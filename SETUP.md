# 🚀 Panduan Setup TMailku (Urut, Anti-Bingung)

Ikuti **dari atas ke bawah, jangan dilompati**. Total ~10 menit.
Ada 2 bagian: **A. Backend (Worker)** dan **B. Frontend (Pages)**.

> Inti yang sering kelupaan: setelah bikin DB, **WAJIB** `db:init` (bikin tabel) + set `JWT_SECRET` + `wrangler deploy`. Kalau salah satu kelewat → login 500 & "Failed to fetch".

---

## A. BACKEND (Cloudflare Worker)

Semua perintah dijalankan di dalam folder `worker/`.

```bash
cd worker
npm install            # kalau belum
npx wrangler login     # login ke akun Cloudflare (sekali saja)
```

### 1. Buat 3 resource (DB, KV, R2)

```bash
npx wrangler d1 create tmailku
npx wrangler kv namespace create KV
npx wrangler r2 bucket create tmailku-attachments
```

Tiap perintah mengeluarkan **ID**. Catat ketiganya.

### 2. Tempel ID ke `wrangler.toml`

Ganti 3 baris berikut dengan ID hasil langkah 1:

```toml
[[d1_databases]]
binding = "DB"
database_name = "tmailku"
database_id = "<ID-D1-DARI-LANGKAH-1>"

[[kv_namespaces]]
binding = "KV"
id = "<ID-KV-DARI-LANGKAH-1>"

[[r2_buckets]]
binding = "R2"
bucket_name = "tmailku-attachments"
```

### 3. Atur origin frontend (CORS)

Di bagian `[vars]` `wrangler.toml`, isi dengan **alamat website kamu** (boleh lebih dari satu, dipisah koma, TANPA garis miring di akhir):

```toml
[vars]
APP_URL    = "https://vdey.website"
WEB_ORIGIN = "https://vdey.website,https://tmail-ku.pages.dev"
```

> `WEB_ORIGIN` = daftar alamat website yang boleh akses API. Kalau kamu buka situs dari `tmail-ku.pages.dev`, alamat itu HARUS ada di daftar ini.

### 4. ⭐ Bikin tabel database (LANGKAH YANG SERING KELEWAT)

```bash
npm run db:init
```

Ini menjalankan `schema.sql` ke D1 (bikin tabel `admins`, `domains`, `emails`, dll).
**Kalau langkah ini dilewati → login 500 & API 403/"Failed to fetch".**

Verifikasi tabel sudah jadi:

```bash
npx wrangler d1 execute tmailku --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```
Harus muncul: domains, addresses, emails, attachments, imap_accounts, admins, logs, settings, api_keys.

### 5. ⭐ Set JWT_SECRET (untuk login admin)

```bash
npx wrangler secret put JWT_SECRET
```
Saat diminta, ketik teks acak panjang (mis. hasil `openssl rand -hex 32`). Tanpa ini, login admin = 500.

### 6. Deploy worker

```bash
npx wrangler deploy
```

Setiap kali kamu ubah `wrangler.toml` atau kode, ulangi langkah ini.

### 7. Pasang custom domain API (opsional tapi disarankan)

Dashboard Cloudflare → Workers & Pages → `tmailku` → **Settings → Domains & Routes** → Add `api.vdey.website`.
(Hanya subdomain `api.` yang ke Worker. Domain utama `vdey.website` untuk frontend, lihat Bagian B.)

### 8. Aktifkan Email Routing (biar email masuk)

Dashboard Cloudflare → domain `vdey.website` → **Email → Email Routing** → aktifkan →
buat **Catch-all** → action **Send to a Worker** → pilih `tmailku`.

### ✅ Tes backend

Buka di browser: `https://api.vdey.website/api/branding`
- Muncul **JSON** (appName, colors, dst) → backend SEHAT. Lanjut ke Bagian B.
- Masih error → tabel belum kebuat (ulang langkah 4) atau domain API belum kepasang (langkah 7).

---

## B. FRONTEND (Cloudflare Pages)

Semua perintah di dalam folder `web/`.

### 1. Arahkan frontend ke API

Buat file `web/.env.local`:
```bash
NEXT_PUBLIC_API_BASE=https://api.vdey.website
```
> PENTING: nilai ini di-"bake" saat build. Kalau diubah, **harus build ulang**.

### 2. Deploy (pilih salah satu)

**Cara mudah — Connect Git (rekomendasi):**
Dashboard Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pilih repo `tmailku` →
- Build command: `npm run build`
- Build output: `web/.next` (atau `web/out` kalau pakai static export)
- Root directory: `web`
- Environment variable: `NEXT_PUBLIC_API_BASE = https://api.vdey.website`

Setiap `git push` → Pages auto build & deploy.

**Cara manual (upload):**
```bash
cd web
npm install
npm run build
```
Lalu upload hasil build via dashboard Pages (drag & drop).

### 3. Pasang domain utama ke Pages (opsional)

Kalau mau situs diakses lewat `https://vdey.website` (bukan `pages.dev`):
Dashboard → Pages project → **Custom domains** → Add `vdey.website`.
Lalu pastikan `vdey.website` ada di `WEB_ORIGIN` (Bagian A langkah 3) → deploy worker lagi.

---

## C. SETUP PERTAMA (bikin admin)

Setelah backend & frontend hidup:
1. Buka `https://<situs-kamu>/admin/login`.
2. Kalau belum ada admin, kamu diarahkan ke **wizard setup** untuk bikin email + password admin pertama.
3. Login → masuk dashboard → menu **Mail Sources** → tambah domain → menu lain sesuai kebutuhan.

---

## 🔧 Troubleshooting cepat

| Gejala | Penyebab | Solusi |
|---|---|---|
| Login **500 Internal Server Error** | Tabel `admins` belum ada / `JWT_SECRET` belum di-set | Jalankan A.4 (`db:init`) + A.5 (secret) + A.6 (deploy) |
| **"Failed to fetch" / No Access-Control-Allow-Origin** | DB belum di-init (query error) ATAU origin tak terdaftar | Pastikan A.4 sudah jalan; cek `WEB_ORIGIN` memuat alamat situs kamu (A.3); deploy |
| **CORS: value tmailku.example.com** | `WEB_ORIGIN` masih placeholder / belum deploy | Ganti `WEB_ORIGIN`, lalu `npx wrangler deploy` |
| `Invalid uuid` saat `db:init` | `database_id` masih placeholder | Tempel ID asli dari `wrangler d1 create` (A.2) |
| Email tak masuk | Email Routing belum aktif / catch-all belum ke Worker | Ulang A.8 |
| `NEXT_PUBLIC_API_BASE` nembak ke domain situs sendiri | env kosong saat build | Isi `web/.env.local` lalu **build ulang** (B.1-2) |

---

## 📌 Ringkasan super singkat

```bash
# --- BACKEND ---
cd worker && npm install && npx wrangler login
npx wrangler d1 create tmailku           # catat ID
npx wrangler kv namespace create KV      # catat ID
npx wrangler r2 bucket create tmailku-attachments
# tempel 3 ID + WEB_ORIGIN ke wrangler.toml
npm run db:init                          # <- bikin tabel (WAJIB)
npx wrangler secret put JWT_SECRET       # <- isi teks acak (WAJIB)
npx wrangler deploy

# --- FRONTEND ---
cd ../web
echo NEXT_PUBLIC_API_BASE=https://api.vdey.website > .env.local
npm install && npm run build             # deploy via Pages
```
