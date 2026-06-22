# 📨 TMailku — Temporary Mail di Cloudflare

Layanan **email sementara (disposable email)** yang berjalan penuh di **Cloudflare Worker**. Bikin alamat email instan, terima email & kode OTP secara real-time, tanpa registrasi. Dilengkapi **dashboard admin**, **multi-domain**, **dukungan IMAP**, dan **REST API**.

> Monorepo ini berisi dua bagian: **`worker/`** (backend API di Cloudflare Worker) dan **`web/`** (frontend Next.js).

---

## 📑 Daftar Isi

1. [Fitur](#-fitur)
2. [Cara Kerja (Arsitektur)](#-cara-kerja-arsitektur)
3. [Struktur Folder](#-struktur-folder)
4. [Persiapan (Prasyarat)](#-persiapan-prasyarat)
5. [Panduan Deploy Lengkap](#-panduan-deploy-lengkap-langkah-demi-langkah)
6. [Konfigurasi URL (paling sering bikin bingung)](#-konfigurasi-url-paling-sering-bikin-bingung)
7. [Menjalankan Secara Lokal](#-menjalankan-secara-lokal-development)
8. [Setup Pertama (Buat Admin)](#-setup-pertama-buat-admin)
9. [Dashboard Admin](#-dashboard-admin)
10. [REST API](#-rest-api)
11. [Troubleshooting (Solusi Error Umum)](#-troubleshooting-solusi-error-umum)
12. [FAQ](#-faq)

---

## ✨ Fitur

- 📬 **Email sementara instan** — buat alamat tanpa daftar, auto-expire sesuai TTL.
- ⚡ **Real-time** — email masuk langsung muncul (SSE + polling), tanpa refresh.
- 🔢 **Auto-deteksi OTP** — kode verifikasi otomatis dikenali & bisa di-copy 1 klik.
- 🗂️ **Multi-inbox** — kelola beberapa alamat sekaligus lewat dropdown switch.
- 🌐 **Multi-domain** — pakai banyak domain, tiap domain bisa diaktif/nonaktifkan.
- 📥 **Dua sumber email**:
  - **CF Email Routing** → email langsung diteruskan ke Worker.
  - **IMAP** → tarik email dari mailbox eksternal (Gmail, dll).
- 🎨 **Branding** — atur nama app, logo, favicon, dan 3 warna (Primary/Secondary/Tertiary).
- 🌗 **Tema gelap & terang** — toggle, dengan tema default yang bisa diatur admin.
- 🔒 **Lock website** — kunci akses publik dengan password.
- 🔑 **REST API + API Keys** — akses programatik dengan Bearer token.
- 🔔 **Integrasi notifikasi** — Telegram bot & webhook saat email masuk.
- 🛠️ **Dashboard admin** — statistik, log aktivitas, kelola semua pengaturan.
- 📱 **PWA** — bisa di-install di HP/desktop.
- 📖 **Dokumentasi API** otomatis di `/docs`.

---

## 🏗 Cara Kerja (Arsitektur)

```
                 ┌─────────────────────────┐
  Email masuk →  │  Cloudflare Email Routing│ ─┐
                 └─────────────────────────┘  │
                 ┌─────────────────────────┐  │   ┌──────────────────────┐
  Mailbox lain → │  IMAP Fetcher (cron 2m) │ ─┼─→ │   Worker (Hono API)  │
                 └─────────────────────────┘  │   │  /api/... + /docs    │
                                               │   └──────────┬───────────┘
                                               │              │
                                   ┌───────────┴────┐   ┌─────┴──────┬──────────┐
                                   │                │   │            │          │
                                 D1 (SQL)        KV (cache)      R2 (lampiran)

  User buka  →  Frontend Next.js  ──fetch──→  Worker API
```

- **Frontend (Next.js)** dan **Worker (API)** di-deploy **terpisah** dan punya URL berbeda.
- Frontend memanggil Worker lewat `NEXT_PUBLIC_API_BASE`.
- Worker mengizinkan frontend lewat `WEB_ORIGIN` (CORS + cookie sesi admin).

### Penyimpanan
| Layanan | Binding | Untuk apa |
|---------|---------|-----------|
| **D1** (SQLite) | `DB` | Domain, alamat, email, admin, settings, API keys, log |
| **KV** | `KV` | Cache & rate limit |
| **R2** | `R2` | Lampiran email & raw message |

---

## 📁 Struktur Folder

```
tmailku/
├── package.json            # npm workspaces (worker + web)
├── README.md
├── worker/                 # === BACKEND (Cloudflare Worker) ===
│   ├── src/
│   │   ├── index.ts        # entry utama + cron + email handler
│   │   ├── types.ts
│   │   ├── openapi.ts      # spec OpenAPI untuk /docs
│   │   ├── lib/            # util, auth, settings, otp, notify, apikeys, dll
│   │   ├── imap/           # client + fetcher IMAP
│   │   └── routes/         # setup, public, apiv1, admin, branding
│   ├── schema.sql          # skema database D1
│   ├── wrangler.toml       # konfigurasi Cloudflare (ISI ID-MU DI SINI)
│   └── .dev.vars.example   # contoh secret lokal
└── web/                    # === FRONTEND (Next.js 15) ===
    ├── app/
    │   ├── page.tsx        # inbox publik
    │   ├── setup/          # wizard admin pertama
    │   └── admin/          # login + dashboard
    ├── lib/                # api client + store
    ├── components/         # ThemeToggle, BrandingProvider
    └── .env.example        # contoh NEXT_PUBLIC_API_BASE
```

---

## 🧰 Persiapan (Prasyarat)

- **Node.js 18+** dan **npm**
- **Akun Cloudflare** (gratis)
- **Domain** yang sudah ditambahkan ke Cloudflare (untuk menerima email)
- **Wrangler** (CLI Cloudflare) — sudah termasuk sebagai dependency, jalankan via `npx wrangler`

Login ke Cloudflare sekali:
```bash
npx wrangler login
```

---

## 🚀 Panduan Deploy Lengkap (Langkah demi Langkah)

### 1. Clone & install
```bash
git clone https://github.com/premitry/tmailku.git
cd tmailku
npm install          # sekali di root, install worker + web (npm workspaces)
```

### 2. Buat resource Cloudflare (D1, KV, R2)
```bash
cd worker

npx wrangler d1 create tmailku
npx wrangler kv namespace create KV
npx wrangler r2 bucket create tmailku-attachments
```
Masing-masing perintah mengeluarkan **ID**. Catat semuanya.

### 3. Isi `worker/wrangler.toml`
Ganti semua placeholder dengan ID asli dari langkah 2:
```toml
[[d1_databases]]
binding = "DB"
database_name = "tmailku"
database_id = "GANTI_DENGAN_D1_ID"        # dari `d1 create`

[[kv_namespaces]]
binding = "KV"
id = "GANTI_DENGAN_KV_ID"                 # dari `kv namespace create`

[[r2_buckets]]
binding = "R2"
bucket_name = "tmailku-attachments"       # nama bucket (bukan ID)

[vars]
APP_URL    = "https://vdey.website"       # URL WEBSITE/frontend kamu
WEB_ORIGIN = "https://vdey.website"       # URL WEBSITE/frontend kamu
```
> ⚠️ `APP_URL` & `WEB_ORIGIN` diisi **URL website (frontend)**, bukan URL Worker. Lihat [bagian URL](#-konfigurasi-url-paling-sering-bikin-bingung).

### 4. Buat schema database
```bash
npm run db:init      # menjalankan schema.sql ke D1 remote
```

### 5. Set secret JWT (untuk sesi admin)
```bash
npx wrangler secret put JWT_SECRET
# masukkan string acak panjang, mis. hasil: openssl rand -hex 32
```

### 6. Deploy Worker
```bash
npx wrangler deploy
```
Output menampilkan URL Worker, mis: `https://tmailku.namakamu.workers.dev`. **Catat URL ini** → dipakai untuk `NEXT_PUBLIC_API_BASE`.

### 7. Hubungkan domain ke Email Routing
Di dashboard Cloudflare → pilih domain → **Email → Email Routing**:
- Aktifkan Email Routing (otomatis menambah MX record).
- Buat **catch-all rule** → **Send to a Worker** → pilih worker `tmailku`.

Lalu daftarkan domain di dashboard admin (menu **Mail Sources**) dan klik **Verify**.

### 8. Deploy Frontend (folder `web/`)
Pilih salah satu:

**A. Cloudflare Pages (Connect to Git) — direkomendasikan**
- Workers & Pages → Create → Pages → connect repo `premitry/tmailku`
- Root directory: `web`, framework: **Next.js**
- Environment variable: `NEXT_PUBLIC_API_BASE = https://api.vdey.website`

**B. Upload manual (static export)**
```bash
cd web
# tambahkan ke next.config.mjs: output: 'export', images: { unoptimized: true }
echo NEXT_PUBLIC_API_BASE=https://api.vdey.website > .env.local
npm run build        # hasil di folder web/out
```
Lalu Workers & Pages → Create → Pages → **Upload assets** → drag folder `web/out`.

### 9. Pasang domain ke frontend
Di project Pages → **Custom domains** → tambahkan `vdey.website`.
(Worker cukup pakai subdomain `api.vdey.website`.)

### 10. Selesai → buka website
Buka `https://vdey.website`. Pertama kali akan diarahkan ke **/setup** untuk membuat akun admin.

---

## 🔗 Konfigurasi URL (paling sering bikin bingung)

Ada **3 variabel URL**. Ingat polanya: frontend & worker saling menunjuk silang.

| Variabel | Ditulis di | Diisi dengan | Contoh |
|----------|-----------|--------------|--------|
| `NEXT_PUBLIC_API_BASE` | `web/.env.local` / Pages env | URL **Worker** | `https://api.vdey.website` |
| `APP_URL` | `worker/wrangler.toml` | URL **Website** | `https://vdey.website` |
| `WEB_ORIGIN` | `worker/wrangler.toml` | URL **Website** | `https://vdey.website` |

```
NEXT_PUBLIC_API_BASE  →  URL WORKER   (tempat API)
APP_URL / WEB_ORIGIN  →  URL WEBSITE  (tempat frontend dibuka user)
```

> ⚠️ **`WEB_ORIGIN` harus persis** sama dengan origin yang dibuka di browser (tanpa trailing slash). Kalau salah, login admin gagal karena cookie sesi ditolak.

**Pembagian domain yang disarankan:**
| Domain | Tugas | Diarahkan ke |
|--------|-------|--------------|
| `api.vdey.website` | API | Worker (Custom Domain) |
| `vdey.website` | Website | Cloudflare Pages |

---

## 💻 Menjalankan Secara Lokal (Development)

**Backend:**
```bash
cd worker
cp .dev.vars.example .dev.vars     # isi JWT_SECRET
npx wrangler dev                    # → http://localhost:8787
```

**Frontend:**
```bash
cd web
echo NEXT_PUBLIC_API_BASE=http://localhost:8787 > .env.local
npm run dev                         # → http://localhost:3000
```
Saat lokal, set di `wrangler.toml`:
```toml
APP_URL    = "http://localhost:3000"
WEB_ORIGIN = "http://localhost:3000"
```

---

## 🧑‍💼 Setup Pertama (Buat Admin)

Setelah deploy, kunjungi website → otomatis ke **/setup**. Isi nama, email, dan password (min. 8 karakter) untuk membuat **akun admin pertama**. Setelah itu `/setup` terkunci, dan kamu bisa login di **/admin/login**.

---

## 🛠 Dashboard Admin

Akses di `/admin`. Menu:

| Menu | Fungsi |
|------|--------|
| **Overview** | Statistik + panel **log aktivitas** gaya terminal (email dibuat/diterima, dll) |
| **Mail Sources** | Kelola **domain** (aktif/nonaktif, verify MX) & **akun IMAP** (test/sync) |
| **Appearance** | Nama app, logo, favicon, warna Primary/Secondary/Tertiary, tema & bahasa default |
| **Access & Security** | Lock website + kelola akun admin |
| **API** | Aktifkan API publik + kelola API keys |
| **Integrations** | Telegram bot & webhook notifikasi |
| **System** | TTL alamat, batas lampiran, rate limit, format alamat, blocklist |

> Ikon profil di kanan atas → ganti email/password sendiri.
> Inbox/email pengguna **tidak** ditampilkan di admin demi privasi.

### Arti 3 warna branding
- **Primary** — warna aksi utama (tombol, link, highlight).
- **Secondary** — status sukses & indikator "Live".
- **Tertiary** — penanda spesial seperti badge OTP.

---

## 🔌 REST API

Dokumentasi interaktif lengkap tersedia di **`https://api.vdey.website/docs`**.

### Endpoint publik (tanpa auth)
| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| `POST` | `/api/address` | Buat alamat baru |
| `GET` | `/api/inbox/:addr` | Daftar email |
| `GET` | `/api/email/:id` | Detail email (tandai dibaca) |
| `GET` | `/api/stream/:addr` | Real-time (SSE) |
| `DELETE` | `/api/email/:id` | Hapus email |

### Endpoint API publik (perlu API Key)
Kirim header: `Authorization: Bearer tmk_xxxxx`
| Method | Endpoint |
|--------|----------|
| `POST` | `/api/v1/address` |
| `GET` | `/api/v1/inbox/:addr` |
| `GET` | `/api/v1/email/:id` |

Contoh:
```bash
curl -X POST https://api.vdey.website/api/v1/address \
  -H "Authorization: Bearer tmk_xxxxxxxx"
```
> API key dibuat di **Admin → API**, ditampilkan **sekali** saat dibuat — simpan baik-baik.

---

## 🩺 Troubleshooting (Solusi Error Umum)

**`Invalid uuid` saat `npm run db:init`**
→ `database_id` di `wrangler.toml` masih placeholder. Jalankan `npx wrangler d1 create tmailku`, tempel UUID-nya, ulangi.

**Login admin gagal / langsung ke-logout**
→ `WEB_ORIGIN` tidak cocok dengan URL website (cek trailing slash / http vs https). Samakan persis lalu `npx wrangler deploy` ulang.

**Email tidak masuk**
→ Pastikan Email Routing aktif, ada catch-all rule **Send to Worker**, domain sudah **Verify** di admin & berstatus **aktif**.

**Frontend tidak bisa konek API**
→ Cek `NEXT_PUBLIC_API_BASE` mengarah ke URL Worker yang benar (bukan URL website).

**Warning Wrangler out-of-date / `Assertion failed async.c` (Windows)**
→ Cosmetic saja. Untuk menghilangkan: `npm install --save-dev wrangler@4`.

---

## ❓ FAQ

**Apakah `npm install` cukup sekali?**
Ya, di root karena memakai npm workspaces — sekali install untuk `worker` & `web`.

**Apakah harus punya domain sendiri?**
Untuk menerima email: ya, domain harus ada di Cloudflare. Untuk testing API, Worker dapat URL `*.workers.dev` gratis.

**Password IMAP disimpan bagaimana?**
Sesuai pilihan setup, disimpan plaintext di D1 (ada tombol mata untuk show/hide di form).

**Bisa pakai 1 domain saja untuk frontend + API?**
Bisa, tapi setup terpisah (subdomain `api.`) lebih bersih dan menghindari konflik routing.

---

Dibuat dengan ❤️ di atas Cloudflare Workers, Hono, dan Next.js.
