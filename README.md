# 📨 TMailku — Temporary Mail di Cloudflare

Layanan **email sementara (disposable email)** yang berjalan penuh di **Cloudflare Worker**. Bikin alamat email instan, terima email & kode OTP secara real-time, tanpa registrasi. Dilengkapi **dashboard admin**, **multi-domain**, **dukungan IMAP**, dan **REST API**.

> Monorepo ini berisi dua bagian: **`worker/`** (backend API di Cloudflare Worker) dan **`web/`** (frontend Next.js).

---

## 📑 Daftar Isi

1. [Fitur](#-fitur)
2. [Cara Kerja (Arsitektur)](#-cara-kerja-arsitektur)
3. [Struktur Folder](#-struktur-folder)
4. [Persiapan (Prasyarat)](#-persiapan-prasyarat)
5. [Deploy Langsung di Cloudflare (Tanpa Lokal)](#-deploy-langsung-di-cloudflare-tanpa-lokal)
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
- 🌐 **Multi-domain** — pakai banyak domain, tiap domain bisa diaktif/nonaktifkan & verifikasi MX.
- 📥 **Dua sumber email per domain (domain-centric)**:
  - **CF Email Routing (Direct Routing)** → email langsung diteruskan ke Worker.
  - **IMAP** → tarik email dari mailbox eksternal (Gmail, dll) via cron.
  - **Hybrid** → aktifkan keduanya pada satu domain sekaligus.
- 🎨 **Branding** — atur nama app, hero text (judul & subjudul), logo, dan favicon (upload langsung).
- 🌗 **Tema gelap & terang** — toggle, dengan tema default yang bisa diatur admin.
- 🌍 **Multi-bahasa** — Indonesia & English.
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
- **IMAP dikonfigurasi di dalam tiap domain** (menu Mail Sources), bukan sebagai akun terpisah.

### Penyimpanan
| Layanan | Binding | Untuk apa |
|---------|---------|-----------|
| **D1** (SQLite) | `DB` | Domain, IMAP settings, alamat, email, admin, settings, API keys, log |
| **KV** | `KV` | Cache & rate limit |
| **R2** | `R2` | Lampiran email, raw message & aset branding (logo/favicon) |

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
│   │   ├── lib/            # util, auth, settings, otp, notify, apikeys, storage, dll
│   │   ├── imap/           # client + fetcher IMAP
│   │   └── routes/         # setup, public, apiv1, admin, branding
│   ├── schema.sql          # skema database D1 (opsional/advanced)
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

Untuk metode **tanpa lokal**, kamu hanya butuh:

- **Akun GitHub** — repo bisa repo milik sendiri atau hasil fork.
- **Akun Cloudflare** — untuk Worker, Pages, D1, KV, R2, dan Email Routing.
- **Domain di Cloudflare** — wajib jika ingin menerima email via **Direct Routing / Cloudflare Email Routing**.
- **Mailbox eksternal** — opsional jika ingin menerima email via **IMAP** tanpa Email Routing.

Tidak perlu install Node.js, npm, Bun, atau Wrangler di komputer kalau memakai metode **Connect to Git**. Semua build dijalankan oleh Cloudflare.

> Kalau repo ini milikmu sendiri, **tidak perlu fork**. Langsung hubungkan repo aslimu ke Cloudflare. Fork hanya diperlukan untuk orang lain yang tidak punya akses edit ke repo ini.

---

## 🚀 Deploy Langsung di Cloudflare (Tanpa Lokal)

> Metode yang **direkomendasikan** — semuanya lewat **GitHub + Dashboard Cloudflare**, tanpa clone, tanpa build lokal, dan tanpa menjalankan terminal di komputer.

### 1. Siapkan repo GitHub

Pilih salah satu:

- **Kalau ini repo milikmu sendiri**: langsung pakai repo ini. **Tidak perlu fork**.
- **Kalau kamu memakai repo orang lain**: klik **Fork** dulu, lalu pakai repo hasil fork.

Semua perubahan file seperti `worker/wrangler.toml` bisa dilakukan langsung dari GitHub web editor: buka file → klik ikon ✏️ → edit → **Commit changes**.

### 2. Buat resource Cloudflare

Di dashboard Cloudflare, buat resource berikut:

#### D1 Database

Storage & Databases → **D1 SQL Database** → **Create**

Rekomendasi:

```txt
Name: tmailku
```

Catat **Database ID**-nya.

#### KV Namespace

Storage & Databases → **KV** → **Create namespace**

Rekomendasi:

```txt
Name: KV
```

Catat **Namespace ID**-nya.

#### R2 Bucket

R2 Object Storage → **Create bucket**

Rekomendasi:

```txt
Name: tmailku-attachments
```

### 3. Edit `worker/wrangler.toml`

Buka file ini di GitHub:

```txt
worker/wrangler.toml
```

Isi bagian binding dengan ID dari Cloudflare:

```toml
[[d1_databases]]
binding = "DB"
database_name = "tmailku"
database_id = "TEMPEL_D1_DATABASE_ID"

[[kv_namespaces]]
binding = "KV"
id = "TEMPEL_KV_NAMESPACE_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "tmailku-attachments"

[vars]
APP_URL    = "https://domain-frontend-kamu.com"
WEB_ORIGIN = "https://domain-frontend-kamu.com"
```

Penjelasan penting:

- `APP_URL` = URL website/frontend yang dibuka user.
- `WEB_ORIGIN` = origin website/frontend, harus sama persis, tanpa trailing slash.
- Jangan isi `APP_URL` / `WEB_ORIGIN` dengan URL Worker API.
- `JWT_SECRET` **jangan ditulis di `wrangler.toml`**. Nanti dibuat sebagai Secret di dashboard Worker.

Commit perubahan `wrangler.toml`.

### 4. Deploy Worker API dari GitHub

Cloudflare → **Workers & Pages** → **Create** → **Workers** → **Import a repository / Connect to Git** → pilih repo kamu.

Setting Worker yang benar:

```txt
Root directory: worker
Build command: kosong / default
Deploy command: npx wrangler deploy
```

Yang paling penting adalah:

```txt
Root directory = worker
```

Karena file `wrangler.toml` dan `src/index.ts` berada di folder `worker/`. Kalau root directory kosong atau masih root repo, deploy bisa gagal dengan error:

```txt
Missing entry-point to Worker script or to assets directory
```

Setelah deploy berhasil, catat URL Worker, misalnya:

```txt
https://tmailku.namakamu.workers.dev
```

URL ini dipakai sebagai `NEXT_PUBLIC_API_BASE` di frontend.

### 5. Set Secret `JWT_SECRET`

Masuk ke Worker yang sudah dibuat → **Settings** → **Variables and Secrets** → **Add**.

Tambahkan:

```txt
Type: Secret
Name: JWT_SECRET
Value: string acak panjang, minimal 32 karakter
```

Contoh value bisa dibuat dari password manager. Jangan taruh value ini di README, GitHub, atau `wrangler.toml`.

Setelah save, lakukan deploy ulang kalau Cloudflare meminta.

### 6. Database otomatis dibuat oleh Worker

Untuk pemula, **tidak perlu paste SQL manual** ke D1 Console.

Setelah Worker berhasil deploy dan binding `DB` sudah terhubung ke D1, buka URL ini sekali di browser:

```txt
https://URL-WORKER-KAMU/api/setup/status
```

Contoh:

```txt
https://tmailku.namakamu.workers.dev/api/setup/status
```

Worker akan otomatis membuat tabel D1 yang diperlukan (`domains`, `admins`, `settings`, `emails`, dan lainnya). Kalau berhasil, akan muncul:

```json
{"setupCompleted":false}
```

> `worker/schema.sql` tetap disediakan untuk pengguna advanced/CLI, tapi untuk instalasi biasa via Cloudflare Dashboard kamu bisa mengabaikannya.

### 7. Deploy Frontend Pages dari GitHub

Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pilih repo yang sama.

Setting Pages yang benar:

```txt
Framework preset: Next.js
Root directory: web
Build command: npm run build
Build output directory: out
```

Tambahkan environment variable:

```txt
NEXT_PUBLIC_API_BASE = https://URL-WORKER-KAMU
```

Contoh:

```txt
NEXT_PUBLIC_API_BASE = https://tmailku.namakamu.workers.dev
```

atau kalau Worker sudah pakai custom domain:

```txt
NEXT_PUBLIC_API_BASE = https://api.domainkamu.com
```

> Jangan isi build output directory dengan `/`. Untuk project ini hasil build frontend ada di folder `out`. Kalau output masih `/`, web bisa blank atau tidak muncul apa-apa.

Setelah deploy selesai, buka URL Pages, misalnya:

```txt
https://nama-project.pages.dev
```

### 8. Pasang domain frontend

Untuk domain yang ada di Cloudflare:

Pages → project kamu → **Custom domains** → tambah domain website, misalnya:

```txt
https://vdey.website
```

Lalu ubah `APP_URL` dan `WEB_ORIGIN` di `worker/wrangler.toml` menjadi URL frontend tersebut, commit, lalu redeploy Worker.

### 9. Jika frontend pakai subdomain FreeDNS / afraid.org

Frontend Pages **bisa** memakai subdomain dari FreeDNS, karena Pages bisa diverifikasi lewat CNAME.

Contoh:

```txt
tmail.example.freeddns-domain.com
```

Langkah umum:

1. Pages → **Custom domains** → tambahkan subdomain FreeDNS kamu.
2. Cloudflare akan memberi target CNAME, biasanya ke `nama-project.pages.dev`.
3. Di freedns.afraid.org, buat record:

```txt
Type: CNAME
Subdomain: nama-subdomain
Destination: nama-project.pages.dev
```

4. Tunggu Cloudflare verifikasi SSL.
5. Set `APP_URL` dan `WEB_ORIGIN` ke URL FreeDNS tersebut.

Catatan penting:

- Frontend via FreeDNS: **bisa**.
- Worker custom domain via FreeDNS: biasanya **tidak bisa**, karena Worker custom domain butuh domain berada di Cloudflare. Pakai saja URL `*.workers.dev` untuk API.
- Cloudflare Email Routing butuh domain berada di Cloudflare. Kalau tidak punya domain di Cloudflare, gunakan mode **IMAP** untuk mengambil email dari mailbox eksternal.

### 10. Hubungkan domain untuk menerima email

Ada 2 pilihan sumber email:

#### Opsi A — Direct Routing / Cloudflare Email Routing

Syarat: domain penerima email harus berada di Cloudflare.

Cloudflare → pilih domain → **Email → Email Routing**:

- Aktifkan Email Routing.
- Buat **catch-all rule**.
- Action: **Send to a Worker**.
- Pilih Worker `tmailku`.

Lalu di admin TMailku → **Mail Sources** → tambah domain → aktifkan **Direct Routing** → klik **Verify**.

#### Opsi B — IMAP Mailbox

Tidak wajib domain berada di Cloudflare. Cocok kalau kamu memakai mailbox eksternal seperti Gmail, cPanel, Zoho, atau layanan email lain.

Di admin TMailku → **Mail Sources** → tambah domain → aktifkan **IMAP Mailbox** → isi host, port, username, password, folder → klik **Test Connection** → save.

### 11. Buka website dan setup admin

Buka URL frontend kamu. Pertama kali akan diarahkan ke:

```txt
/setup
```

Isi email, nama, dan password admin pertama. Setelah itu login ke:

```txt
/admin/login
```

> Update berikutnya cukup commit ke GitHub. Cloudflare akan otomatis rebuild/redeploy Worker dan Pages.

<details>
<summary><b>Alternatif: deploy via CLI dari lokal</b></summary>

Gunakan cara ini hanya kalau kamu memang ingin install dan deploy dari komputer sendiri.

```bash
git clone https://github.com/premitry/tmailku.git
cd tmailku
npm install

cd worker
npx wrangler login
npx wrangler d1 create tmailku
npx wrangler kv namespace create KV
npx wrangler r2 bucket create tmailku-attachments
```

Tempel ID ke `worker/wrangler.toml`, lalu:

```bash
npm run db:init
npx wrangler secret put JWT_SECRET
npx wrangler deploy

cd ../web
echo NEXT_PUBLIC_API_BASE=https://api.domainkamu.com > .env.local
npm run build
```

Upload/deploy hasil `web/out` ke Cloudflare Pages, atau gunakan Pages Connect to Git.

</details>

---

## 🔗 Konfigurasi URL (paling sering bikin bingung)

Ada 3 URL yang sering tertukar:

| Variabel / URL | Dipakai untuk | Contoh |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | URL **Worker API** yang dipanggil frontend | `https://tmailku.namakamu.workers.dev` atau `https://api.domainkamu.com` |
| `APP_URL` | URL **website/frontend** | `https://vdey.website` atau `https://subdomain.pages.dev` |
| `WEB_ORIGIN` | Origin frontend yang boleh login admin | `https://vdey.website` atau `https://subdomain.pages.dev` |

Pola sederhananya:

```txt
Frontend / Pages  →  memanggil  →  Worker API
NEXT_PUBLIC_API_BASE = URL Worker

Worker API  →  mengizinkan login dari  →  Frontend / Pages
APP_URL / WEB_ORIGIN = URL Frontend
```

Contoh jika belum punya custom domain API:

```txt
Frontend Pages: https://tmailku-5sk.pages.dev
Worker API:     https://tmailku.namakamu.workers.dev

NEXT_PUBLIC_API_BASE = https://tmailku.namakamu.workers.dev
APP_URL              = https://tmailku-5sk.pages.dev
WEB_ORIGIN           = https://tmailku-5sk.pages.dev
```

Contoh jika sudah punya custom domain:

```txt
Frontend: https://vdey.website
API:      https://api.vdey.website

NEXT_PUBLIC_API_BASE = https://api.vdey.website
APP_URL              = https://vdey.website
WEB_ORIGIN           = https://vdey.website
```

> `WEB_ORIGIN` harus sama persis dengan URL yang dibuka di browser: pakai `https`, tanpa trailing slash. Kalau salah, login admin bisa gagal atau langsung logout.

### Pakai subdomain dari FreeDNS / afraid.org

Bisa untuk **frontend Pages**:

```txt
Subdomain FreeDNS  CNAME  →  nama-project.pages.dev
```

Tapi untuk **Worker API**, paling mudah pakai URL bawaan:

```txt
https://nama-worker.username.workers.dev
```

Karena custom domain Worker biasanya membutuhkan domain berada di Cloudflare.

Untuk **Email Routing**, domain penerima email juga harus berada di Cloudflare. Kalau domain kamu hanya dari FreeDNS dan tidak bisa dipindah ke Cloudflare, gunakan mode **IMAP Mailbox**.

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
| **Mail Sources** | Kelola **domain** secara domain-centric: aktif/nonaktif, verify MX, dan atur cara terima (**IMAP** dan/atau **Direct Routing**) langsung di tiap domain — lengkap dengan Test Connection & Sync Now untuk IMAP |
| **Appearance** | Nama app, hero text (judul & subjudul), logo, favicon, tema & bahasa default |
| **Access & Security** | Lock website + kelola akun admin |
| **API** | Aktifkan API publik + kelola API keys |
| **Integrations** | Telegram bot & webhook notifikasi |
| **System** | TTL alamat, batas lampiran, rate limit, format alamat, blocklist |

> Ikon profil di kanan atas → ganti email/password sendiri.
> Inbox/email pengguna **tidak** ditampilkan di admin demi privasi.

### Mail Sources (domain-centric)
Tiap domain adalah entitas utama. Saat menambah domain kamu memilih satu atau dua cara terima email:
- **IMAP Mailbox** — isi Server, Port (993), SSL/TLS, Username, Password, Folder (INBOX), dan interval polling (2/5/10/15 menit). Ada tombol **Test Connection** sebelum disimpan.
- **Direct Routing** — gunakan endpoint Email Routing Worker (catch-all → Send to Worker).
- **Hybrid** — aktifkan keduanya sekaligus.

Di halaman Edit Domain tersedia **Danger Zone** untuk menghapus domain (perlu mengetik ulang nama domain sebagai konfirmasi).

---

## 🔌 REST API

Dokumentasi interaktif lengkap tersedia di **`https://api.vdey.website/docs`**.

```
# Publik (inbox user) — tanpa API key
POST   /api/address            # generate alamat (random/custom)
GET    /api/address/:addr       # info + sisa TTL
GET    /api/domains             # daftar domain aktif (buat dropdown)
GET    /api/inbox/:addr         # daftar email
GET    /api/email/:id           # detail email (tandai dibaca)
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
CRUD   /api/admin/imap-profiles         # reusable IMAP profile (dipakai banyak domain)
POST   /api/admin/imap-profiles/:id/test # test koneksi profile
POST   /api/admin/imap-profiles/check    # smart-detect profile identik (host+username)
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

Contoh:
```bash
curl -X POST https://api.vdey.website/api/v1/address \
  -H "Authorization: Bearer tmk_xxxxxxxx"
```
> API key dibuat di **Admin → API**, ditampilkan **sekali** saat dibuat — simpan baik-baik.
> Catatan: IMAP dikelola **di dalam tiap domain** (Mail Sources). Endpoint `imap-accounts` lama sudah deprecated.

---

## 🩺 Troubleshooting (Solusi Error Umum)

**Worker deploy error: `Missing entry-point to Worker script or to assets directory`**
→ Root directory Worker salah. Di setting Worker Connect to Git, isi:

```txt
Root directory: worker
Deploy command: npx wrangler deploy
```

Jangan deploy Worker dari root repo, karena `wrangler.toml` ada di folder `worker/`.

**Pages blank / web tidak muncul**
→ Setting Pages biasanya salah. Pastikan:

```txt
Root directory: web
Build command: npm run build
Build output directory: out
NEXT_PUBLIC_API_BASE: URL Worker kamu
```

Jangan isi output directory dengan `/`.

**Bingung menjalankan SQL di D1 Console**
→ Untuk instalasi terbaru, kamu **tidak perlu menjalankan SQL manual**. Pastikan Worker punya binding `DB`, lalu buka:

```txt
https://URL-WORKER-KAMU/api/setup/status
```

Worker akan membuat tabel database otomatis.

**D1 Console error: `Requests without any query are not supported`**
→ Ini hanya terjadi kalau memakai cara manual. Artinya query kosong. Abaikan cara manual dan pakai auto-setup di atas.

**D1 Console error: `no such table: settings` / `no such table: admins`**
→ Buka `/api/setup/status` setelah Worker terbaru ter-deploy. Auto-setup akan membuat tabel yang belum ada.

**Tabel D1 tidak terlihat di panel kiri**
→ Klik refresh. Kalau masih kosong, cek apakah ada filter aktif di panel kiri D1 Studio/Console. Hapus filter tersebut.

**Login admin gagal / langsung ke-logout**
→ `WEB_ORIGIN` tidak cocok dengan URL frontend yang dibuka di browser. Samakan persis, misalnya `https://tmailku-5sk.pages.dev`, lalu redeploy Worker.

**Frontend tidak bisa konek API**
→ Cek `NEXT_PUBLIC_API_BASE` di Pages. Isinya harus URL Worker, bukan URL frontend. Setelah mengubah env, redeploy Pages karena value `NEXT_PUBLIC_*` dibaca saat build.

**Email tidak masuk via Direct Routing**
→ Pastikan domain berada di Cloudflare, Email Routing aktif, MX record sudah benar, catch-all rule mengarah ke Worker, dan domain sudah **Verify** di Admin → Mail Sources.

**Email tidak masuk via IMAP**
→ Klik **Test Connection** di konfigurasi IMAP. Pastikan host, port, SSL/TLS, username, password/app password, dan folder `INBOX` benar.

**Warning Wrangler out-of-date / `Assertion failed async.c` (khusus cara CLI/lokal)**
→ Biasanya tidak memengaruhi deploy Connect to Git. Kalau deploy lokal, update Wrangler dengan `npm install --save-dev wrangler@4`.

---

## ❓ FAQ

**Aku pemilik repo ini. Harus fork atau tidak?**
Tidak perlu. Kalau repo itu milikmu sendiri, langsung pilih repo tersebut saat Connect to Git di Cloudflare. Fork hanya untuk orang lain yang ingin memakai project ini.

**Kalau repo public, apakah email/password/admin-ku kelihatan orang?**
Tidak, data runtime disimpan di Cloudflare milikmu: D1, KV, dan R2. Repo hanya berisi kode. Tapi jangan pernah commit `JWT_SECRET`, password IMAP, API key, atau data rahasia lain ke GitHub.

**Apakah harus install Node/npm di komputer?**
Tidak kalau pakai metode **Deploy Langsung di Cloudflare**. Node/npm hanya dibutuhkan jika kamu memilih cara lokal/CLI.

**Apakah harus punya domain sendiri?**
Untuk Direct Routing / Cloudflare Email Routing: ya, domain harus berada di Cloudflare. Untuk mode IMAP, tidak wajib; kamu bisa menarik email dari mailbox eksternal.

**Bisa pakai FreeDNS / afraid.org untuk frontend?**
Bisa, pakai CNAME ke `*.pages.dev`. Tetapi untuk Worker API sebaiknya tetap pakai `*.workers.dev`, dan untuk Email Routing tetap butuh domain di Cloudflare.

**Password IMAP disimpan bagaimana?**
Saat ini disimpan plaintext di D1 sesuai kebutuhan project. Gunakan **App Password** khusus, bukan password utama akun email.

**Email dan attachment disimpan di mana?**
Metadata alamat/email disimpan di **D1**. Raw email dan attachment disimpan di **R2**. Sistem temporary mail sebaiknya memakai TTL dan cleanup agar storage tidak membesar terus.

**Bisa pakai 1 domain saja untuk frontend + API?**
Bisa, tapi setup subdomain lebih rapi: frontend di `domain.com`, API di `api.domain.com`.

---

Dibuat dengan ❤️ di atas Cloudflare Workers, Hono, dan Next.js.
