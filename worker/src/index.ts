// TMailku Worker entry: HTTP API (Hono) + email() handler (Email Routing) + scheduled() (cron).
import { Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import type { Env, Variables } from "./types";
import { publicRoutes } from "./routes/public";
import { apiV1Routes } from "./routes/apiv1";
import { adminRoutes } from "./routes/admin";
import { brandingRoutes } from "./routes/branding";
import { setupRoutes } from "./routes/setup";
import { openapiSpec, docsHtml } from "./openapi";
import { storeEmail, type ParsedEmail } from "./lib/storage";
import { pollAllImap } from "./imap/fetcher";
import { cleanupExpired } from "./lib/cleanup";
import { addLog } from "./lib/log";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  // WEB_ORIGIN bisa berisi beberapa origin dipisah koma, atau '*' untuk semua.
  const allowed = (c.env.WEB_ORIGIN || "*")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return cors({
    origin: (o) => {
      if (allowed.includes("*")) return o;
      if (o && allowed.includes(o.replace(/\/$/, ""))) return o;
      return allowed[0] || "";
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  })(c, next);
});

app.get("/", (c) => c.json({ service: "tmailku", ok: true }));
app.get("/openapi.json", (c) => c.json(openapiSpec));
app.get("/docs", (c) => c.html(docsHtml));

app.post("/inbound", async (c) => {
  try {
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const parsed = await PostalMime.parse(raw);
    const toAddr =
      parsed.to?.[0]?.address || c.req.header("x-forwarded-to") || "";
    if (!toAddr) return c.json({ error: "missing recipient" }, 400);
    const email: ParsedEmail = {
      messageId: parsed.messageId,
      fromAddr:
        parsed.from?.address || c.req.header("x-forwarded-from") || undefined,
      fromName: parsed.from?.name,
      toAddr,
      subject: parsed.subject,
      text: parsed.text,
      html: parsed.html || undefined,
      attachments: (parsed.attachments || []).map((a: any) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        content: a.content,
      })),
      raw,
    };
    const id = await storeEmail(c.env, "routing", email);
    if (!id)
      return c.json({ error: "Address not found or routing disabled" }, 404);
    return c.json({ ok: true, id });
  } catch (e: any) {
    await addLog(
      c.env,
      "error",
      "email",
      "gagal proses inbound endpoint: " + (e?.message || e),
    );
    return c.json({ error: "invalid email payload" }, 400);
  }
});

app.route("/api/setup", setupRoutes);
app.route("/api/branding", brandingRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/v1", apiV1Routes);
app.route("/api", publicRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json(
    { error: "internal error", detail: String(err?.message || err) },
    500,
  );
});

export default {
  fetch: app.fetch,

  // Cloudflare Email Routing -> push ke sini
  async email(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext,
  ) {
    try {
      const rawBuf = new Response(message.raw);
      const raw = new Uint8Array(await rawBuf.arrayBuffer());
      const parsed = await PostalMime.parse(raw);
      const email: ParsedEmail = {
        messageId: parsed.messageId,
        fromAddr: parsed.from?.address || message.from,
        fromName: parsed.from?.name,
        toAddr: message.to,
        subject: parsed.subject,
        text: parsed.text,
        html: parsed.html || undefined,
        attachments: (parsed.attachments || []).map((a: any) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          content: a.content,
        })),
        raw,
      };
      const id = await storeEmail(env, "routing", email);
      if (!id) message.setReject("Address not found or disabled");
    } catch (e: any) {
      await addLog(
        env,
        "error",
        "email",
        "gagal proses email routing: " + (e?.message || e),
      );
    }
  },

  // Cron: poll IMAP + cleanup TTL
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        await pollAllImap(env).catch((e) =>
          addLog(env, "error", "cron", "imap poll: " + e),
        );
        await cleanupExpired(env).catch((e) =>
          addLog(env, "error", "cron", "cleanup: " + e),
        );
      })(),
    );
  },
};