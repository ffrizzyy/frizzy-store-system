# Frizzy - sistem operasi konter Diva Cell

Frizzy menyatukan penjualan, stok, dan kas konter ponsel **Diva Cell** dalam satu tempat, lalu
menambahkan satu hal yang biasanya tidak ada di aplikasi kasir: **Cash Recovery Engine** yang
menghitung berapa cepat kas habis, dari mana kebocorannya, dan apa yang harus dikerjakan minggu ini.

Penjualan handset di aplikasi ini berasal dari **catatan nyata konter**: hasil ekstraksi ekspor obrolan
WhatsApp "DIVA Sale" — tiap baris memuat model dan harga jual yang benar-benar terjadi. Entitas
pendukung yang tidak ada di obrolan (stok, kas, beban, prive, shift, pembelian, piutang, opname)
dibangkitkan secara deterministik agar seluruh fitur berjalan penuh.

- Antarmuka: Bahasa Indonesia. Istilah teknis (POS, IMEI, QRIS, EDC, GMROI, DIO, open-to-buy,
  True Burn, runway) tetap Inggris karena itu yang dipakai di lapangan.
- Uang selalu **integer rupiah**, tidak pernah float.
- Stok adalah **ledger append-only**: penjualan tidak pernah mengubah angka stok secara langsung.

---

## Menjalankan

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # audit tautan internal + tsc --noEmit (wajib hijau sebelum commit)
pnpm check:data   # memeriksa angka generator + mesin metrik
pnpm build        # produksi; 19 halaman, semua route terverifikasi
pnpm start        # jalankan hasil build produksi
```

### Uji end-to-end di browser sungguhan

Uji ini benar-benar mengklik aplikasi: menambah produk di POS, menyelesaikan pembayaran,
menolak PIN salah, menyetujui dengan PIN pemilik, menggeser slider What-If, mengganti tema,
dan membuka semua halaman. Tanpa dependensi tambahan (memakai Chrome DevTools Protocol).

```powershell
# 1. jalankan build produksi
pnpm build; pnpm start -- --port 3980

# 2. jalankan Chrome headless dengan port debug
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --no-sandbox --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\frizzy-e2e" about:blank

# 3. jalankan uji
node scripts/e2e.mjs http://127.0.0.1:3980 9222
```

Hasil terakhir: **34 lulus, 0 gagal**. Uji mengunci ukuran viewport desktop (panel keranjang POS
disembunyikan di bawah breakpoint `lg`) supaya hasilnya tidak bergantung ukuran jendela Chrome.

Catatan lingkungan penting: file `pnpm-workspace.yaml` memakai `nodeLinker: hoisted`.
Tanpa itu, `next build` gagal `MODULE_NOT_FOUND` karena Node di Windows tidak bisa menembus
junction virtual store pnpm untuk dependensi internal Next (`@next/env`, `@swc/helpers`).

Dua halaman memakai `useSearchParams` untuk membaca `?tab=`. Keduanya **wajib** berada di dalam
`<Suspense>` (`/app/inventory` dan `/app/products`); tanpa itu `next build` gagal dengan
`missing-suspense-with-csr-bailout`. Ini sudah ditangani, jangan dilepas saat mengubah halaman itu.

Font Geist di-*self-host* di `public/fonts` (skrip `scripts/fetch-fonts.mjs` hanya dijalankan
sekali saat menyiapkan repo). Build tidak butuh jaringan.

Batas galat sudah dipasang di tiga tingkat: `src/app/error.tsx` (halaman publik),
`src/app/app/error.tsx` (segmen aplikasi, satu blok gagal tidak mengosongkan dashboard),
dan `src/app/not-found.tsx` dengan daftar halaman yang tersedia.

---

## Peta halaman

| Route | Isi |
|---|---|
| `/` | Landing page: hero dengan widget Cash Runway hidup, Stock-to-Cash Bridge, kemampuan, alur konter, Cash Recovery, contoh tanya-jawab, keamanan, FAQ |
| `/data-konter` | Data konter: 4 KPI nyata dari mesin metrik dan peta fitur |
| `/case-study` | Studi kasus: konteks, identitas akuntansi, data, metode, hasil, batasan |
| `/app` | Dashboard: banner runway, 6 KPI, jembatan kas, peringatan, prakiraan 13 minggu, briefing kas harian, penyumbang laba, stok mati, kesehatan operasional |
| `/app/tutorial` | Panduan singkat: alur kerja penting konter langkah demi langkah |
| `/app/pos` | POS: katalog, scan/cari, pilih IMEI, margin guard, diskon berlapis, pembayaran campuran, struk |
| `/app/sales` | Riwayat struk: filter, penanda di bawah HPP, drawer detail, void/refund ber-PIN, ekspor CSV |
| `/app/products` | Katalog dan harga: margin, ABC/XYZ, riwayat harga, label barcode, impor/ekspor CSV |
| `/app/inventory` | Stok: level, ledger, unit IMEI, opname, penyesuaian, rencana belanja |
| `/app/purchasing` | Pembelian: supplier, PO, penerimaan barang, kalender utang |
| `/app/customers` | Pelanggan: segmen, riwayat, garansi per IMEI, consent, ulasan |
| `/app/shifts` | Shift: kas seharusnya, hitung denominasi, selisih, tren |
| `/app/finance` | Keuangan: ledger kas, beban, prive, utang, piutang, prakiraan, anggaran, tutup bulan |
| `/app/recovery` | Cash Recovery Engine: ringkasan, Leak Detector, Bebas Kas, Reorder, What-If, Playbook |
| `/app/reports` | Katalog 24 laporan, ekspor CSV, definisi metrik |
| `/app/ai` | AI Analyst: jawaban dihitung alat, bukan diarang model bahasa |
| `/app/team` | Tim dan perangkat: peran, perangkat tepercaya, undangan |
| `/app/security` | Sesi, perangkat, audit log, 2FA |
| `/app/settings` | Toko, struk, ulasan, pembayaran, pajak, notifikasi, AI, data |

Dua peran bisa dicoba dari bilah atas: **Pemilik** dan **Staf**. Sebagai staf, harga pokok dan laba
hilang, halaman keuangan tertutup, dan aksi sensitif meminta **PIN pemilik** (contoh: `2468`).
Isi keranjang tidak hilang saat peran berganti, karena tablet kasir memang dipakai bergantian.

Tiga hal yang sering ditanyakan:

**Bagaimana cara menambah stok?** Tombol **Tambah stok** ada di bilah atas (selalu tersedia), di
halaman Stok, dan di kartu "Stok menipis" pada dashboard. Dialognya punya tiga cara masuk barang:
penyesuaian cepat, penerimaan dari supplier (tercatat sebagai pembelian), dan pemasukan per IMEI
dengan validasi 15 digit serta deteksi IMEI ganda. Cara lain: halaman **Pembelian** untuk menerima
barang dengan nomor PO, atau halaman **Stok** tab **Penyesuaian** untuk koreksi hasil hitung.
Semua penambahan menulis satu baris ledger baru dan satu baris audit log; angka stok lama tidak
pernah ditimpa.

**Apa guna tombol notifikasi?** Lonceng di kanan atas membuka daftar peringatan yang dihitung dari
data, bukan hiasan: status runway kas, temuan Leak Detector beserta dampak rupiahnya, stok menipis,
utang supplier yang jatuh tempo tiga hari, selisih kas saat tutup shift, struk email yang gagal
terkirim, tautan ulasan yang belum diklik, dan tugas pemulihan yang masih terbuka. Setiap
notifikasi punya tautan langsung ke halaman yang bisa menindaklanjutinya, dan ada penanda belum
dibaca dengan aksi "Tandai terbaca".

**Kenapa logo tampil sebagai mark putih di bidang gelap?** Karena logo asli Diva Cell memang putih
dengan satu pita oranye di atas latar gelap. Mark digambar ulang dari logo resmi: kontur gambar
aslinya ditelusuri, bukan diperkirakan, lalu diverifikasi ulang (IoU 0,953 bagian putih dan 0,972
pita oranye). Di latar terang mark diletakkan pada bidang gelap membulat agar identitasnya tetap
sama. Mark dirasterkan ulang menjadi `icon.svg`, `icon.png`, dan `apple-icon.png` oleh
`scripts/make-icon.mjs` (Node murni, tanpa dependensi gambar). Komponen `Logo.tsx` memakai
`preserveAspectRatio="none"` pada kotak vektor yang sudah dinormalisasi, jadi mark tidak pernah
terentang di ukuran mana pun.

---

## Mesin metrik (`src/lib/metrics.ts`)

Semua aritmetika ada di satu modul fungsi murni. AI tidak pernah menghitung angka; ia hanya
menarasikan keluaran modul ini (`factsForAi`, `detectLeaks`, `simulate`, `buildReorderPlan`).

```
ΔKas                = Laba kotor - Beban - Prive - ΔStok + ΔUtang
Defisit tersembunyi = ΔKas + ΔStok - ΔUtang
True Burn / hari    = -(ΔKas + ΔStok - ΔUtang) / jumlah hari      (positif = kas terbakar)
Runway (hari)       = Kas di tangan / True Burn
Rasio replenishment = Belanja stok (at cost) / HPP                (target >= 1,0)
DIO                 = Rata-rata stok (at cost) / HPP x hari
Turnover            = HPP / Rata-rata stok x (365/hari)
GMROI               = Laba kotor / Rata-rata stok (disetahunkan)
Sell-through        = Unit terjual / (Unit terjual + Sisa unit)
Reorder point       = Rata-rata permintaan harian x lead time + safety stock
Open-to-buy         = (Kas - Lantai aman - Utang jatuh tempo) x Alokasi%
Skor pemulihan      = 0,30 Runway + 0,20 Replenishment + 0,20 Kebocoran + 0,15 Kesehatan stok + 0,15 Margin
```

**Leak Detector** menjalankan 10 aturan (jual di bawah HPP, kebocoran diskon, prive berlebih,
rasio replenishment, erosi margin handset, stok mati, float pulsa, selisih opname, selisih kas
shift, piutang lewat jatuh tempo). Setiap temuan membawa **dampak rupiah per bulan**, bukti,
dan satu aksi yang bisa dikerjakan hari ini.

**What-If Simulator** mengubah 7 tuas (margin, prive, likuidasi stok mati, diskon, attach rate,
termin supplier, potong beban) dan menghitung ulang runway, True Burn, kas minggu 4/8/13, serta
kombinasi minimum agar True Burn tidak lagi positif.

---

## Sumber data

Baris handset diambil dari ekspor obrolan WhatsApp "DIVA Sale". Ekstraksi mengenali beberapa bentuk
pesan yang berbeda:

- Baris barang dengan nomor urut: `2. Redmi A5 4/128 : 1.400.000`
- Catatan pembayaran di belakang harga: `( cash : 400.000 TF. 2.700.000 )`, `( sdh Dp 3.000.000 sisa 50.000 )`
- Harga kurang tiga nol (`2.150`) dan salah tulis lain (`3.400.000h`, `1.600,000`) ikut dikoreksi.
- Pesan yang terkirim dua kali berurutan digabung.
- Baris yang **bukan** penjualan unit dikeluarkan dari omzet: uang muka/PO, titipan `stok dr. hp`,
  tukar unit, koreksi, pelunasan sisa, dan aksesori.

Cara memperbarui: ekspor ulang obrolan, lalu jalankan

```bash
node scripts/extract-sales.mjs "<berkas chat>" data/sales-export.json
node scripts/build-real-sales.mjs data/sales-export.json src/lib/penjualan-nyata.ts
```

Data yang tersimpan saat ini: **670 penjualan unit, 80 model, Rp 1.514.870.000**, rentang
**11 Mar - 10 Okt 2026**. Hasil olahan mesin metrik pada periode 220 hari:

| Metrik | Nilai |
|---|---|
| Kas di tangan | Rp 499 juta |
| Nilai stok (harga pokok) | Rp 408 juta, Rp 196 juta di antaranya stok mati 60 hari+ |
| Penjualan 30 hari | Rp 151 juta (laba kotor Rp 36 juta, margin 23,8%) |
| Rasio belanja stok | 100% dari HPP |
| Runway | 849 hari (kas aman) |
| Skor pemulihan | 85/100 (sehat) |

Angka ini bergerak mengikuti data: menambah atau mengubah penjualan akan menggeser semua metrik di
atas karena semuanya dihitung ulang dari satu dataset yang sama.


---

## Struktur

```
src/
  app/
    page.tsx                  landing
    data-konter/ case-study/  halaman publik
    app/                      shell + 16 halaman aplikasi (termasuk tutorial)
    api/sample/               dataset penuh (JSON)
    api/sample/headline/      ringkasan untuk halaman publik
    api/health/               health check untuk Docker/uptime
    icon.svg icon.png         favicon dan ikon aplikasi
  components/
    app/                      AppShell, Toaster, PinGate
    brand/                    mark dan logo Diva Cell
    charts/                   Stock-to-Cash Bridge, garis dengan pita
    landing/                  widget runway, reveal, tombol tema
    ui/                       Button, Card, Feedback, Field, Overlay, Kpi, Icon
  lib/
    types.ts                  model data
    penjualan-nyata.ts        data penjualan nyata (hasil ekstraksi, jangan diedit manual)
    realSales.ts              jembatan data nyata ke generator
    generator.ts              perakit dataset: penjualan nyata + entitas pendukung ter-seed
    metrics.ts                mesin metrik + aturan
    store.ts                  state klien, keranjang, mutasi
    money.ts constants.ts utils.ts
data/
  sales-export.json           hasil ekstraksi mentah (perantara)
scripts/
  extract-sales.mjs           parsing obrolan WhatsApp
  build-real-sales.mjs        mengubah ekspor menjadi modul TypeScript
  check-data.mjs              verifikasi angka generator + metrik
  audit-links.mjs             verifikasi tautan vs route
  make-icon.mjs               merender favicon dari mark logo
  e2e.mjs                     uji browser sungguhan (Chrome DevTools Protocol)
  fetch-fonts.mjs             unduh Geist sekali saja
```

---

## Batasan yang jujur

- **Penjualan handset nyata, entitas pendukung dibangkitkan.** Baris handset berasal dari catatan
  obrolan konter, sedangkan stok, kas, beban, prive, dan pembelian dibangkitkan deterministik. Angka
  turunannya belum pembukuan resmi; kalibrasi dua sampai empat minggu sebelum dijadikan target bisnis.
- **Belum ada backend.** Pelanggan, PO, dan laporan dihitung di klien. Tidak ada PostgreSQL,
  autentikasi, antrean job, atau pengiriman email nyata. Yang tersedia adalah perilaku, aturan, dan
  alur kerja yang sudah terbukti konsisten.
- **Ambang default.** Batas diskon 5%, lantai kas aman Rp 5 juta, selisih kas Rp 20.000, dan
  biaya tetap adalah nilai awal yang bisa diubah di Pengaturan.
- **AI Analyst** memakai jawaban terhitung dari mesin metrik, bukan panggilan model bahasa.
- **Verifikasi otomatis**: `tsc --noEmit` bersih, audit tautan tanpa tautan mati, `next build`
  menghasilkan 19 halaman, dan `scripts/e2e.mjs` menjalankan 34 pemeriksaan di browser sungguhan
  (klik POS sampai struk terbit, gerbang PIN, slider What-If, tema, semua halaman) dengan hasil
  **34 lulus, 0 gagal**. Yang belum diotomatiskan: unggah foto produk, cetak termal nyata, dan
  pembayaran QRIS ke penyedia.

## Selanjutnya

1. Pindahkan dataset (termasuk `src/lib/penjualan-nyata.ts`) ke Postgres + Drizzle dengan skema yang
   sama, lalu jadikan `metrics.ts` sekumpulan view SQL dan layanan analitik Python.
2. Tambahkan autentikasi (Argon2id + TOTP), RLS sebagai lapis kedua, dan audit log berantai hash.
3. Sambungkan Midtrans/Xendit untuk QRIS, Resend untuk struk email, dan pg-boss untuk antrean job.
4. Ganti jawaban AI statis dengan Claude API ber-tool, tetap dengan aturan "angka dari alat".
