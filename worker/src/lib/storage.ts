// Logika simpan email + attachment ke D1/R2, deteksi OTP, log, notifikasi.
import type { Env } from "../types";
import { uid, now } from "./util";
import { detectOtp } from "./otp";
import { getAllSettings } from "./settings";
import { dispatchNotifications } from "./notify";
import { addLog } from "./log";

export interface ParsedEmail {
  messageId?: string;
  fromAddr?: string;
  fromName?: string;
  toAddr: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: {
    filename?: string;
    mimeType?: string;
    content: ArrayBuffer | Uint8Array;
  }[];
  raw?: ArrayBuffer | Uint8Array;
}

// Cari address row dari alamat tujuan; hormati blocklist & domain aktif.
export async function resolveAddress(env: Env, toAddr: string) {
  const addr = (toAddr || "").trim().toLowerCase();
  if (!addr) return null;
  return env.DB.prepare(
    `SELECT a.*, d.id AS domain_id, d.status AS domain_status, d.source AS domain_source
		 FROM addresses a
		 LEFT JOIN domains d ON a.domain_id = d.id
		 WHERE a.address = ?`,
  )
    .bind(addr)
    .first<any>();
}

export async function storeEmail(
  env: Env,
  source: "routing" | "imap",
  p: ParsedEmail,
): Promise<string | null> {
  const settings = await getAllSettings(env);

  // blocklist pengirim
  const blocklist = (settings["blocklist_senders"] || "")
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const from = (p.fromAddr || "").toLowerCase();
  if (blocklist.some((b) => from === b || from.endsWith("@" + b))) {
    await addLog(env, "warn", "email", `blocked sender ${from} -> ${p.toAddr}`);
    return null;
  }

  const address = await resolveAddress(env, p.toAddr);
  if (!address || address.blocked || address.domain_status === "disabled") {
    await addLog(
      env,
      "warn",
      "email",
      `dropped (no/disabled address) ${p.toAddr}`,
    );
    return null;
  }
  // Periksa apakah source email cocok dengan konfigurasi domain.
  // "none" atau kosong berarti domain belum dikonfigurasi — tetap izinkan agar
  // email yang masuk sebelum setup selesai tidak hilang.
  const domainSource = address.domain_source || "routing";
  if (
    domainSource !== "none" &&
    domainSource !== "" &&
    source === "routing" &&
    !["routing", "both"].includes(domainSource)
  ) {
    await addLog(
      env,
      "warn",
      "email",
      `dropped (routing disabled for domain source=${domainSource}) ${p.toAddr}`,
    );
    return null;
  }
  if (
    domainSource !== "none" &&
    domainSource !== "" &&
    source === "imap" &&
    !["imap", "both"].includes(domainSource)
  ) {
    await addLog(
      env,
      "warn",
      "email",
      `dropped (imap disabled for domain source=${domainSource}) ${p.toAddr}`,
    );
    return null;
  }

  if (p.messageId) {
    const existing = await env.DB.prepare(
      "SELECT id FROM emails WHERE address_id = ? AND message_id = ? LIMIT 1",
    )
      .bind(address.id, p.messageId)
      .first<{ id: string }>();
    if (existing?.id) return null;
  }

  const emailId = uid("em");
  const otp = detectOtp(p.subject || "", p.text || stripHtml(p.html || ""));
  const maxBytes =
    (Number(settings["max_attachment_mb"] || "10") || 10) * 1024 * 1024;

  let rawKey: string | null = null;
  if (p.raw) {
    rawKey = `raw/${emailId}.eml`;
    await env.R2.put(rawKey, p.raw);
  }

  let hasAttachment = 0;
  const atts = p.attachments ?? [];
  await env.DB.prepare(
    `INSERT INTO emails (id, address_id, message_id, from_addr, from_name, to_addr, subject,
		 body_text, body_html, otp_code, has_attachment, raw_r2_key, source, seen, received_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(
      emailId,
      address.id,
      p.messageId ?? null,
      p.fromAddr ?? null,
      p.fromName ?? null,
      p.toAddr,
      p.subject ?? null,
      p.text ?? null,
      p.html ?? null,
      otp ?? null,
      0,
      rawKey,
      source,
      now(),
    )
    .run();

  for (const att of atts) {
    const bytes =
      att.content instanceof Uint8Array
        ? att.content
        : new Uint8Array(att.content);
    if (bytes.byteLength > maxBytes) continue;
    hasAttachment = 1;
    const attId = uid("at");
    const r2Key = `att/${emailId}/${attId}`;
    await env.R2.put(r2Key, bytes);
    await env.DB.prepare(
      `INSERT INTO attachments (id, email_id, filename, content_type, size, r2_key)
			 VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        attId,
        emailId,
        att.filename ?? "file",
        att.mimeType ?? "application/octet-stream",
        bytes.byteLength,
        r2Key,
      )
      .run();
  }
  if (hasAttachment) {
    await env.DB.prepare("UPDATE emails SET has_attachment = 1 WHERE id = ?")
      .bind(emailId)
      .run();
  }

  await addLog(
    env,
    "info",
    "email",
    `email.received -> ${p.toAddr} (from: ${p.fromAddr || "?"})`,
    {
      emailId,
      source,
      otp: !!otp,
    },
  );

  // realtime fanout via KV bump (frontend poll/SSE)
  await env.KV.put(`inbox_ver:${address.address}`, String(now()), {
    expirationTtl: 86400,
  });

  if (source === "routing") {
    await env.DB.prepare(
      `UPDATE domains SET routing_status = 'active', routing_last_email_at = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(now(), now(), address.domain_id)
      .run();
  }

  await dispatchNotifications(env, {
    address: address.address,
    from: p.fromAddr || "",
    subject: p.subject || "",
    otp,
    receivedAt: now(),
  });

  return emailId;
}

export function stripHtml(html: string): string {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
