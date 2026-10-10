# Frizzy - sistem operasi konter Diva Cell

Frizzy menyatukan penjualan, stok, dan kas konter ponsel **Diva Cell** dalam satu tempat, lalu
menambahkan satu hal yang biasanya tidak ada di aplikasi kasir: **Cash Recovery Engine** yang
menghitung berapa cepat kas habis, dari mana kebocorannya, dan apa yang harus dikerjakan minggu ini.

Seluruh angka di aplikasi ini berasal dari **generator data sintetis berskenario krisis kas**
(180 hari, seed deterministik). Tidak ada data pelanggan nyata di repo ini.

- Antarmuka: Bahasa Indonesia. Istilah teknis (POS, IMEI, QRIS, EDC, GMROI, DIO, open-to-buy,
  True Burn, runway) tetap Inggris karena itu yang dipakai di lapangan.
- Uang selalu **integer rupiah**, tidak pernah float.
- Stok adalah **ledger append-only**: penjualan tidak pernah mengubah angka stok secara langsung.

---

## Menjalankan

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck    # tsc --noEmit (wajib hijau sebelum commit)
node scripts/check-data.mjs   # memeriksa angka generator + mesin metrik
node scripts/audit-links.mjs  # memeriksa tautan internal vs route yang ada
```

Catatan lingkungan penting: file `pnpm-workspace.yaml` memakai `nodeLinker: hoisted`.
Tanpa itu, `next build` gagal `MODULE_NOT_FOUND` karena Node di Windows tidak bisa menembus
junction virtual store pnpm untuk dependensi internal Next (`@next/env`, `@swc/helpers`).

Font Geist di-*self-host* di `public/fonts` (skrip `scripts/fetch-fonts.mjs` hanya dijalankan
sekali saat menyiapkan repo). Build tidak butuh jaringan.

---

## Peta halaman

| Route | Isi |
|---|---|
| `/` | Landing page: hero dengan widget Cash Runway hidup, Stock-to-Cash Bridge, kemampuan, alur konter, Cash Recovery, contoh tanya-jawab, keamanan, FAQ |
| `/demo` | Penjelasan mode demo + 4 KPI nyata dari mesin metrik |
| `/case-study` | Studi kasus: konteks, identitas akuntansi, data, metode, hasil, batasan |
| `/app` | Dashboard: banner runway, 6 KPI, jembatan kas, peringatan, prakiraan 13 minggu, briefing kas harian, penyumbang laba, stok mati, kesehatan operasional |
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

## Skenario krisis yang dibangkitkan generator

| Parameter | Nilai di data contoh |
|---|---|
| Prive pemilik | ~Rp 2,5 juta per hari, jauh di atas batas Rp 2 juta per bulan |
| Belanja stok | ~93-99% HPP, dipotong lagi saat kas di bawah ambang (efek throttle kas) |
| Model lama | iPhone 13/12 Ex, Galaxy A12, OPPO A54, Redmi 9A tidak lagi dicari pembeli |
| Margin handset | Tererosi bertahap karena perang harga sepanjang periode |
| Musiman | Gajian awal/akhir bulan, akhir pekan, Ramadan dan Lebaran |

Hasil akhirnya: kas kritis (runway belasan sampai puluhan hari), stok mati menahan puluhan juta,
dan rasio belanja stok di bawah 1. Itulah bahan bakar Cash Recovery Engine.

---

## Struktur

```
src/
  app/
    page.tsx                  landing
    demo/ case-study/         halaman publik
    app/                      shell + 15 halaman aplikasi
    api/sample/               dataset penuh (JSON)
    api/sample/headline/      ringkasan untuk halaman publik
  components/
    app/                      AppShell, Toaster, PinGate
    brand/                    mark dan logo Diva Cell
    charts/                   Stock-to-Cash Bridge, garis dengan pita
    landing/                  widget runway, reveal, tombol tema
    ui/                       Button, Card, Feedback, Field, Overlay, Kpi, Icon
  lib/
    types.ts                  model data
    generator.ts              generator data sintetis (seeded)
    metrics.ts                mesin metrik + aturan
    store.ts                  state klien, keranjang, mutasi
    money.ts constants.ts utils.ts
scripts/
  check-data.mjs              verifikasi angka generator + metrik
  audit-links.mjs             verifikasi tautan vs route
  fetch-fonts.mjs             unduh Geist sekali saja
```

---

## Batasan yang jujur

- **Data sintetis.** Angka di sini bukan pembukuan resmi dan tidak boleh dipakai sebagai target
  bisnis sebelum dikalibrasi dengan data nyata dua sampai empat minggu.
- **Demo tanpa backend.** Pelanggan, PO, dan laporan dihitung di klien. Tidak ada PostgreSQL,
  autentikasi, antrean job, atau pengiriman email nyata. Yang tersedia adalah perilaku,
  aturan, dan alur kerja yang sudah terbukti konsisten.
- **Ambang default.** Batas diskon 5%, lantai kas aman Rp 5 juta, selisih kas Rp 20.000, dan
  biaya tetap adalah nilai awal yang bisa diubah di Pengaturan.
- **AI Analyst** memakai jawaban terhitung dari mesin metrik, bukan panggilan model bahasa.

## Selanjutnya

1. Pindahkan `src/lib/generator.ts` ke Postgres + Drizzle dengan skema yang sama, lalu jadikan
   `metrics.ts` sekumpulan view SQL dan layanan analitik Python.
2. Tambahkan autentikasi (Argon2id + TOTP), RLS sebagai lapis kedua, dan audit log berantai hash.
3. Sambungkan Midtrans/Xendit untuk QRIS, Resend untuk struk email, dan pg-boss untuk antrean job.
4. Ganti jawaban AI statis dengan Claude API ber-tool, tetap dengan aturan "angka dari alat".
