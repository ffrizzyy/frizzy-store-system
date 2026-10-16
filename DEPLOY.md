# Deploy Frizzy

Panduan singkat menjalankan Frizzy di produksi: lokal, Docker, Compose, VPS + nginx, dan
Vercel/Netlify. Aplikasi ini berjalan **tanpa backend** (angka dihitung di sisi klien dari data
bawaan) — lihat bagian [Yang belum ada](#yang-belum-ada--next-steps) di bawah.

---

## 1. Jalankan produksi di lokal

Butuh Node >= 20.9 dan pnpm (aktifkan lewat `corepack enable`).

```bash
pnpm install --frozen-lockfile
pnpm build          # cetak jumlah halaman bila berhasil
pnpm start          # http://localhost:3000
```

Jalankan di port lain: `pnpm start -- --port 4000`.

> Jangan lupa `pnpm typecheck` sebelum build di CI. Repo ini sengaja memakai
> `typescript.ignoreBuildErrors` agar `next build` tidak men-spawn `tsc` sendiri,
> jadi typecheck dijalankan sebagai langkah terpisah.

---

## 2. Variabel lingkungan

Semua variabel opsional hari ini. Salin contoh dan isi sesuai kebutuhan:

```bash
cp .env.example .env
```

Isi `.env.example` sudah memuat placeholder aman untuk layanan masa depan
(`DATABASE_URL`, `AUTH_SECRET`, `MIDTRANS_SERVER_KEY`, `RESEND_API_KEY`, `R2_*`,
`ANTHROPIC_API_KEY`, dll). **Jangan pernah commit `.env`.**

Variabel yang relevan untuk deployment saat ini:

| Variabel | Fungsi | Default |
|---|---|---|
| `NODE_ENV` | Mode runtime Node | `production` (di image Docker) |
| `PORT` | Port HTTP server | `3000` |
| `HOSTNAME` | Alamat bind | `0.0.0.0` |
| `APP_URL` | URL publik aplikasi | `http://localhost:3000` |
| `TZ` | Zona waktu server | `Asia/Jakarta` |
| `NEXT_TELEMETRY_DISABLED` | Matikan telemetri Next | `1` (di image Docker) |

Variabel lain di `.env.example` **belum dipakai** kode saat ini.

---

## 3. Docker

`next.config.ts` memakai `output: "standalone"`, jadi image hanya berisi server Node
plus dependensi runtime yang benar-benar dipakai. Build tidak butuh jaringan saat runtime.

### Build & jalankan manual

```bash
docker build -t frizzy:latest .
docker run --rm -p 3000:3000 --name frizzy frizzy:latest
```

Server berjalan sebagai pengguna non-root (`nextjs`), `EXPOSE 3000`, dan
`CMD ["node","server.js"]`.

### Docker Compose

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:3000/api/health
```

Compose memetakan port `3000:3000`, `restart: unless-stopped`, dan healthcheck
yang memanggil `/api/health`. Untuk memuat `.env`, buka komentar `env_file` di
`docker-compose.yml`.

---

## 4. VPS + nginx (reverse proxy)

Jalankan aplikasi (Docker atau `pnpm start`) di belakang nginx, lalu proxy ke
port `3000`. Contoh `/etc/nginx/sites-available/frizzy`:

```nginx
server {
    listen 80;
    server_name frizzy.example.com;

    # Naikkan bila nanti ada unggah berkas besar.
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Header WebSocket / HMR — wajib bila memakai upgrade koneksi.
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Healthcheck ringan tanpa masuk ke aplikasi.
    location = /api/health {
        proxy_pass http://127.0.0.1:3000/api/health;
        access_log off;
    }
}
```

Aktifkan dan pasang TLS:

```bash
sudo ln -s /etc/nginx/sites-available/frizzy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d frizzy.example.com   # HTTPS
```

Jalankan server sebagai layanan `systemd` (bila bukan Docker), contoh
`/etc/systemd/system/frizzy.service`:

```ini
[Unit]
Description=Frizzy (Next.js standalone)
After=network.target

[Service]
WorkingDirectory=/opt/frizzy
Environment=NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ExecStart=/usr/bin/node server.js
Restart=always
User=frizzy

[Install]
WantedBy=multi-user.target
```

> Saat memakai `output: "standalone"`, jalankan dengan
> `node .next/standalone/server.js` (aset `.next/static` dan `public` harus
> disalin ke sampingnya), atau gunakan `pnpm start` untuk mode biasa.

---

## 5. Vercel / Netlify

**Vercel** — impor repo, framework terdeteksi otomatis:

- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`
- Output: terkelola otomatis (Vercel mengabaikan `output: "standalone"`)

Tambahkan variabel lingkungan di dashboard (nilai dari `.env.example`).

**Netlify**:

- Build command: `pnpm build`
- Publish directory: `.next`
- Pasang plugin `@netlify/plugin-nextjs` (adaptor Next.js resmi).

---

## 6. Health endpoint

`GET /api/health` mengembalikan JSON ringan (tanpa mengimpor dataset):

```json
{ "status": "ok", "app": "frizzy", "time": "2026-01-01T00:00:00.000Z", "uptimeSec": 12.34 }
```

Respons `200` dengan header `Cache-Control: no-store`. Pakai endpoint ini untuk
healthcheck Docker, load balancer, dan uptime monitor.

---

## 7. Log & observabilitas

- Log server keluar ke **stdout/stderr**. Tangkap lewat `docker logs -f frizzy-web`
  atau `journalctl -u frizzy -f`.
- `NEXT_TELEMETRY_DISABLED=1` sudah aktif di image (tidak ada telemetri Next).
- Placeholder `SENTRY_DSN` / `POSTHOG_KEY` di `.env.example` **belum terhubung**.
  Setelah integrasi ditambahkan, kirim log terstruktur (JSON) ke agregator pilihan.
- Healthcheck Compose memanggil `/api/health` tiap 30 detik; `docker compose ps`
  menampilkan status `healthy`/`unhealthy`.

---

## 8. Checklist smoke test setelah deploy

```bash
# 1. Kesehatan
curl -s http://localhost:3000/api/health
#    -> {"status":"ok","app":"frizzy",...}

# 2. Landing page
curl -sI http://localhost:3000/ | head -n 1        # HTTP/1.1 200 OK

# 3. Dashboard aplikasi
curl -sI http://localhost:3000/app | head -n 1     # HTTP/1.1 200 OK
```

- [ ] `/api/health` mengembalikan `status: "ok"`.
- [ ] `/` terbuka (landing page).
- [ ] `/app` terbuka (dashboard).
- [ ] Header keamanan ada: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- [ ] `docker compose ps` menunjukkan `healthy`.

---

## Yang belum ada / next steps

Jujur: aplikasi ini belum punya backend. **Belum ada database, autentikasi, dan integrasi
pembayaran** — semua perhitungan berjalan di klien. Penjualan handset berasal dari data nyata
(hasil ekstraksi obrolan konter di `src/lib/penjualan-nyata.ts`), sedangkan entitas pendukung
(stok, kas, beban, shift) dirakit deterministik oleh `src/lib/generator.ts`. Belum ada PostgreSQL,
sesi pengguna, atau webhook pembayaran nyata.

Langkah berikutnya (lihat bagian "Selanjutnya" di `README.md`): pindahkan generator
ke PostgreSQL + Drizzle, tambahkan autentikasi (Argon2id + TOTP), lalu sambungkan
Midtrans/Xendit, Resend, dan antrean job.
