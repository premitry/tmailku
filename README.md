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

## Catatan keamanan

- Password IMAP disimpan **plaintext** (sesuai permintaan). Gunakan **App Password** khusus.
- API key hanya disimpan sebagai hash; plaintext ditampilkan sekali saat dibuat.

Lisensi: MIT