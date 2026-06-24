# TMailku — Temporary Mail di Cloudflare Worker

Layanan temporary / disposable email **multi-domain** di atas Cloudflare, dengan
**dual-ingestion** (Cloudflare Email Routing native + IMAP fetch eksternal),
admin dashboard, branding, lock website, API + API keys, dan notifikasi Telegram/Webhook.

## Struktur

```
tmailku/
├── worker/   # Backend: Cloudflare Worker + Hono (API, email handler, IMAP, cron)
└── web/      # Frontend: Next.js 15 (inbox publik + admin dashboard + setup wizard)
```

## Fitur

- 📥 Multi-inbox per user (dropdown switch alamat a/b/c, riwayat di localStorage)
- ⚡ Dual-ingestion: Email Routing (push) + IMAP fetch (pull via Cron)
- 🌐 Multi-domain dengan toggle aktif/nonaktif & wizard verifikasi MX
- 🔢 Auto-detect kode OTP + tombol Copy code
- 🔔 Notifikasi Telegram (Bot Token + Chat ID) & Webhook
- 🎨 Branding (app name, hero text, favicon, logo upload)
- 🌗 Toggle tema gelap/terang
- 🔒 Lock website (password global)
- 🔑 API publik + API keys (scope, rate limit) + docs `/docs`
- 👤 Setup wizard first-run + menu profil admin
- 🧹 Auto-expire (TTL) via Cron cleanup

## Quick start

### 1. Backend (worker)

```bash
cd worker
npm install
# buat resource Cloudflare
npx wrangler d1 create tmailku
npx wrangler kv namespace create KV
npx wrangler r2 bucket create tmailku-attachments
# tempel id-nya ke wrangler.toml, lalu init schema:
npm run db:init
npm run deploy
```

Arahkan domain ke **Cloudflare Email Routing** dengan catch-all → Worker `tmailku`, lalu kelola domain dari dashboard admin → **Mail Sources**.

### 2. Frontend (web)

```bash
cd web
npm install
# set NEXT_PUBLIC_API_BASE ke URL worker kamu
npm run dev
```

### 3. Setup pertama

Buka `/setup` (otomatis di-redirect saat belum ada admin) → buat akun admin pertama.

## API

```
# Publik (inbox user) — tanpa API key
POST   /api/address            # generate alamat (random/custom)
GET    /api/address/:addr       # info + sisa TTL
GET    /api/domains             # daftar domain aktif (buat dropdown)
GET    /api/inbox/:addr         # daftar email
GET    /api/email/:id           # detail email
GET    /api/email/:id/raw       # .eml mentah
GET    /api/attachment/:id      # download lampiran dari R2
GET    /api/asset/:id           # logo/favicon dari R2
GET    /api/stream/:addr        # SSE email baru (realtime)
DELETE /api/email/:id

# Admin (perlu auth / cookie sesi)
POST   /api/admin/login
POST   /api/admin/logout
GET    /api/admin/me   ·  PATCH /api/admin/me
GET    /api/admin/stats
GET    /api/admin/activity              # activity feed + log terminal (Overview)
CRUD   /api/admin/domains               # domain-centric (IMAP / Routing / Hybrid)
POST   /api/admin/domains/imap/test     # test IMAP sebelum domain dibuat
POST   /api/admin/domains/:id/imap/test # test IMAP domain tersimpan
POST   /api/admin/domains/:id/imap/sync # sync sekarang
POST   /api/admin/domains/:id/verify    # cek MX -> Cloudflare
POST   /api/admin/upload                # upload logo/favicon ke R2
CRUD   /api/admin/admins
CRUD   /api/admin/settings              # branding, lock website, sistem
CRUD   /api/admin/api-keys              # buat / revoke / scope & rate limit
CRUD   /api/admin/integrations          # webhook + telegram bot
POST   /api/admin/integrations/test     # tes kirim notifikasi

# Branding (tanpa key)
GET    /api/branding                    # appName, logoUrl, faviconUrl, heroTitle, heroSubtitle

# API publik v1 (WAJIB header: Authorization: Bearer <API_KEY>)
POST   /api/v1/address                  # generate alamat
GET    /api/v1/inbox/:addr              # ambil email
GET    /api/v1/email/:id                # detail email
```

> Catatan: IMAP dikelola **di dalam tiap domain** (Mail Sources), bukan sebagai akun terpisah. Endpoint `imap-accounts` lama sudah deprecated.

## Catatan keamanan

- Password IMAP disimpan **plaintext** (sesuai permintaan). Gunakan **App Password** khusus.
- API key hanya disimpan sebagai hash; plaintext ditampilkan sekali saat dibuat.

Lisensi: MIT
