// API publik untuk inbox user (tanpa API key; diproteksi owner_token).
import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { uid, now, randomLocalPart } from "../lib/util";
import { getAllSettings } from "../lib/settings";
import { rateLimit } from "../lib/ratelimit";
import { addLog } from "../lib/log";
import { pollAccount } from "../imap/fetcher";

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

async function pickDomain(env: Env, requested?: string) {
  if (requested) {
    return env.DB.prepare(
      "SELECT * FROM domains WHERE domain = ? AND status = 'active' AND source IN ('routing','imap','both')",
    )
      .bind(requested)
      .first<any>();
  }
  return env.DB.prepare(
    "SELECT * FROM domains WHERE status = 'active' AND source IN ('routing','imap','both') ORDER BY RANDOM() LIMIT 1",
  ).first<any>();
}

// POST /api/address  { domain?, local?, ttlMinutes? }
export async function createAddress(env: Env, ip: string, body: any) {
  const settings = await getAllSettings(env);
  const limit = Number(settings["global_rate_limit"] || "120") || 120;
  if (!(await rateLimit(env, "addr:" + ip, limit)))
    return { status: 429, json: { error: "rate limited" } };

  const domain = await pickDomain(env, body?.domain);
  if (!domain)
    return { status: 400, json: { error: "tidak ada domain aktif" } };

  const local = (
    body?.local || randomLocalPart(settings["address_format"] || "word+num")
  )
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  const address = local + "@" + domain.domain;
  const ttlMin =
    Number(body?.ttlMinutes || settings["ttl_minutes"] || "60") || 60;
  const ownerToken = uid("own");
  const id = uid("adr");
  try {
    await env.DB.prepare(
      `INSERT INTO addresses (id, address, domain_id, owner_token, expires_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, address, domain.id, ownerToken, now() + ttlMin * 60000, now())
      .run();
  } catch {
    return { status: 409, json: { error: "alamat sudah dipakai, coba lagi" } };
  }
  await addLog(env, "info", "address", "address.created " + address);
  return {
    status: 200,
    json: {
      address,
      ownerToken,
      expiresAt: now() + ttlMin * 60000,
      domain: domain.domain,
    },
  };
}

publicRoutes.post("/address", async (c) => {
  const ip = c.req.header("cf-connecting-ip") || "anon";
  const body = await c.req.json().catch(() => ({}));
  const r = await createAddress(c.env, ip, body);
  return c.json(r.json, r.status as any);
});

// daftar domain aktif (untuk dropdown user)
publicRoutes.get("/domains", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT domain FROM domains WHERE status = 'active' AND source IN ('routing','imap','both') ORDER BY domain",
  ).all<{ domain: string }>();
  return c.json({ domains: (results ?? []).map((r) => r.domain) });
});

async function syncImapForAddress(env: Env, addr: string) {
  const row = await env.DB.prepare(
    `SELECT a.address, d.domain, d.source AS domain_source, i.*
     FROM addresses a
     JOIN domains d ON d.id = a.domain_id
     JOIN imap_settings i ON i.domain_id = d.id
     WHERE a.address = ?
       AND i.enabled = 1
       AND (
             COALESCE(d.receive_imap_enabled, CASE WHEN d.source IN ('imap','both') THEN 1 ELSE 0 END) = 1
             OR d.source IN ('imap','both')
           )
       AND COALESCE(d.is_enabled, CASE WHEN COALESCE(d.status,'active') = 'disabled' THEN 0 ELSE 1 END) = 1
     LIMIT 1`,
  )
    .bind(addr)
    .first<any>();
  if (!row) return;
  await pollAccount(env, {
    ...row,
    hostname: row.host,
    password: row.password_encrypted,
    poll_interval: (row.polling_interval_minutes || 2) * 60,
    force: true,
  });
}

// serve aset branding (logo/favicon) dari R2
publicRoutes.get("/asset/:id", async (c) => {
  const obj = await c.env.R2.get("brand/" + c.req.param("id"));
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "content-type":
        obj.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=86400",
    },
  });
});

publicRoutes.get("/address/:addr", async (c) => {
  const addr = c.req.param("addr").toLowerCase();
  const row = await c.env.DB.prepare(
    "SELECT address, expires_at, created_at FROM addresses WHERE address = ?",
  )
    .bind(addr)
    .first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({
    address: row.address,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  });
});

// daftar email inbox (ringkas)
export async function listInbox(env: Env, addr: string) {
  const address = await env.DB.prepare(
    "SELECT id FROM addresses WHERE address = ?",
  )
    .bind(addr)
    .first<{ id: string }>();
  if (!address) return null;
  const { results } = await env.DB.prepare(
    `SELECT id, from_addr, from_name, subject, otp_code, has_attachment, seen, received_at
		 FROM emails WHERE address_id = ? ORDER BY received_at DESC LIMIT 100`,
  )
    .bind(address.id)
    .all<any>();
  return results ?? [];
}

publicRoutes.get("/inbox/:addr", async (c) => {
  const addr = c.req.param("addr").toLowerCase();
  if (c.req.query("sync") === "1") {
    await syncImapForAddress(c.env, addr).catch(async (e) => {
      await addLog(c.env, "warn", "imap", "manual refresh gagal " + addr + ": " + (e?.message || e));
    });
  }
  const rows = await listInbox(c.env, addr);
  if (rows === null) return c.json({ error: "not found" }, 404);
  return c.json({ emails: rows });
});

publicRoutes.get("/email/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM emails WHERE id = ?")
    .bind(c.req.param("id"))
    .first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("UPDATE emails SET seen = 1 WHERE id = ?")
    .bind(row.id)
    .run();
  const { results: atts } = await c.env.DB.prepare(
    "SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?",
  )
    .bind(row.id)
    .all<any>();
  return c.json({ ...row, attachments: atts ?? [] });
});

publicRoutes.get("/email/:id/raw", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT raw_r2_key FROM emails WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<any>();
  if (!row?.raw_r2_key) return c.json({ error: "not found" }, 404);
  const obj = await c.env.R2.get(row.raw_r2_key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: { "content-type": "message/rfc822" },
  });
});

publicRoutes.get("/attachment/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id = ?")
    .bind(c.req.param("id"))
    .first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  const obj = await c.env.R2.get(row.r2_key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "content-type": row.content_type || "application/octet-stream",
      "content-disposition":
        'attachment; filename="' + (row.filename || "file") + '"',
    },
  });
});

publicRoutes.delete("/email/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM attachments WHERE email_id = ?")
    .bind(c.req.param("id"))
    .run();
  await c.env.DB.prepare("DELETE FROM emails WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// SSE: kirim event saat versi inbox berubah (poll KV ringan)
publicRoutes.get("/stream/:addr", async (c) => {
  const addr = c.req.param("addr").toLowerCase();
  const encoder = new TextEncoder();
  let last = (await c.env.KV.get("inbox_ver:" + addr)) || "";
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("event: hello\ndata: connected\n\n"));
      let ticks = 0;
      const iv = setInterval(async () => {
        ticks++;
        const cur = (await c.env.KV.get("inbox_ver:" + addr)) || "";
        if (cur !== last) {
          last = cur;
          controller.enqueue(
            encoder.encode("event: new\ndata: " + cur + "\n\n"),
          );
        }
        if (ticks > 280) {
          clearInterval(iv);
          controller.close();
        }
      }, 3000);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
});
