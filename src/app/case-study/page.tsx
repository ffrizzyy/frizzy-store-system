import type { Metadata } from "next";
import Link from "next/link";
import { SHOP } from "@/lib/constants";
import { formatCompact, formatDate, formatNumber, formatPct, formatRupiah } from "@/lib/money";
import { computeContext, detectLeaks, recoveryScore } from "@/lib/metrics";
import { generateDataset } from "@/lib/generator";
import { DivaCellMark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Studi kasus",
  description:
    "Studi kasus teknis Frizzy pada data sintetis 180 hari: identitas akuntansi, True Burn, sepuluh aturan Leak Detector, dan batasan angkanya.",
};

const METHOD = [
  {
    icon: "BookBookmark",
    title: "Ledger stok append-only",
    body: "Setiap perubahan jumlah stok adalah baris baru di ledger, tidak pernah penimpaan. Dua kasir tidak bisa membuat stok jadi salah, dan setiap selisih bisa ditelusuri ke transaksinya.",
  },
  {
    icon: "Gear",
    title: "Mesin aturan sebelum LLM",
    body: "Semua aritmetika uang dikerjakan fungsi murni yang deterministik. Model bahasa hanya menarasikan dan memprioritaskan hasilnya, sehingga tidak ada angka yang dikarang.",
  },
  {
    icon: "Fire",
    title: "True Burn dan runway",
    body: "True Burn adalah laba kotor dikurangi beban operasional dan prive, dirata-ratakan 30 hari bergulir. Runway adalah kas dibagi laju bakar itu. Keduanya memakai kas nyata, bukan laba akrual.",
  },
  {
    icon: "WarningCircle",
    title: "Sepuluh aturan Leak Detector",
    body: "Jual di bawah HPP, erosi margin, kebocoran diskon, prive berlebih, rasio replenishment, selisih opname, float pulsa, utang lewat jatuh tempo, selisih kas shift, dan stok mati. Tiap temuan membawa dampak rupiah per bulan dan tautan ke buktinya.",
  },
  {
    icon: "Stack",
    title: "Knapsack open-to-buy",
    body: "Anggaran belanja dihitung dari kas dikurangi lantai kas aman dan utang yang jatuh tempo, lalu dialokasikan ke kandidat berurutan menurut skor modal kerja. Kandidat yang tidak muat ditandai ditunda, bukan dihilangkan.",
  },
  {
    icon: "Sliders",
    title: "What-if deterministik",
    body: "Tujuh tuas (margin, prive, stok mati, diskon, attach rate, termin supplier, beban tetap) dihitung ulang secara aljabar pada setiap perubahan, lengkap dengan kas minggu ke-4, 8, dan 13.",
  },
];

const LIMITS = [
  {
    title: "Datanya sintetis",
    body: "Seluruh angka di halaman ini berasal dari generator berbenih tetap. Pola krisisnya sengaja dibuat, jadi angkanya menunjukkan cara sistem bekerja, bukan kondisi konter tertentu.",
  },
  {
    title: "Bukan pembukuan resmi",
    body: "Frizzy adalah alat operasional dan keputusan. Ia tidak menggantikan laporan keuangan yang disusun akuntan, dan tidak menghitung pajak.",
  },
  {
    title: "Ambang masih nilai awal",
    body: "Batas diskon 4%, target margin handset 7,5%, dan ambang selisih opname 1% adalah titik mulai yang lazim di konter kecil. Semuanya perlu dikalibrasi ulang.",
  },
  {
    title: "Perlu kalibrasi dua sampai empat minggu",
    body: "Setelah data nyata terkumpul, aturan yang paling sering muncul biasanya perlu ambang berbeda per kategori. Kalibrasi itu sebagian besar pekerjaan adopsi.",
  },
];

export default function CaseStudyPage() {
  const data = generateDataset();
  const ctx = computeContext(data);
  const leaks = detectLeaks(ctx);
  const score = recoveryScore(ctx);
  const k = ctx.kpis;

  const anchorIndex = Math.max(0, ctx.daily.length - 31);
  const anchor = ctx.daily[anchorIndex];
  const last = ctx.daily[ctx.daily.length - 1];
  const cashStart = anchor?.cashEod ?? ctx.cashNow;
  const cashDelta = ctx.cashNow - cashStart;
  const inventoryDelta = ctx.inventoryValueNow - (anchor?.inventoryValue ?? ctx.inventoryValueNow);
  const payablesDelta = (last?.payables ?? 0) - (anchor?.payables ?? 0);
  const hiddenDeficit = cashDelta + inventoryDelta - payablesDelta;
  const accountingResult = k.grossProfit - k.opex - k.draws;
  const leakImpact = leaks.reduce((s, l) => s + l.impactPerMonth, 0);
  const topLeak = leaks[0] ?? null;

  const results: { label: string; value: string; hint: string }[] = [
    {
      label: "Kas di tangan",
      value: formatRupiah(k.cashOnHand),
      hint: `Lantai kas aman ${formatRupiah(data.profile.safetyCashFloor)}`,
    },
    {
      label: "True Burn",
      value: `${formatRupiah(Math.abs(k.trueBurnPerDay))} / hari`,
      hint: `Bulan sebelumnya ${formatRupiah(Math.abs(k.trueBurnPrev))} / hari`,
    },
    {
      label: "Runway",
      value: Number.isFinite(k.runwayDays) ? `${formatNumber(Math.round(k.runwayDays), 0)} hari` : "∞",
      hint: `Status ${k.runwayState}`,
    },
    {
      label: "Penjualan 30 hari",
      value: formatRupiah(k.netSales),
      hint: `${formatNumber(k.salesCount, 0)} transaksi, rata-rata ${formatCompact(k.avgDailySales)} / hari`,
    },
    {
      label: "Laba kotor 30 hari",
      value: formatRupiah(k.grossProfit),
      hint: `Margin kotor ${formatPct(k.grossMarginPct)}`,
    },
    {
      label: "Nilai persediaan",
      value: formatRupiah(k.inventoryValue),
      hint: `DIO ${formatNumber(k.dio, 0)} hari, GMROI ${formatNumber(k.gmroi, 2)}`,
    },
    {
      label: "Stok mati",
      value: formatRupiah(k.deadStockValue),
      hint: `Stok lambat tambahan ${formatRupiah(k.slowStockValue)}`,
    },
    {
      label: "Rasio replenishment",
      value: formatPct(k.replenishmentRatio * 100, 0),
      hint: "Belanja stok dibanding HPP periode yang sama",
    },
    {
      label: "Prive pemilik 30 hari",
      value: formatRupiah(k.draws),
      hint: `Batas bulanan ${formatRupiah(data.profile.ownerDrawMonthlyCap)}`,
    },
    {
      label: "Kebocoran diskon",
      value: formatPct(k.discountLeakagePct),
      hint: `Total diskon ${formatRupiah(k.discountTotal)} dari penjualan kotor`,
    },
    {
      label: "Transaksi di bawah HPP",
      value: `${formatNumber(k.belowCostCount, 0)} baris`,
      hint: `Kerugian ${formatRupiah(k.belowCostLoss)}`,
    },
    {
      label: "Skor pemulihan",
      value: `${score.score} / 100 (${score.band})`,
      hint: `Temuan aktif ${formatNumber(leaks.length, 0)} aturan, dampak ${formatRupiah(leakImpact)} / bulan`,
    },
  ];

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <DivaCellMark size={30} />
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-text">{SHOP.name}</span>
              <span className="num text-[10px] uppercase tracking-[0.16em] text-text-faint">{SHOP.system}</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-[13.5px] text-text-muted md:flex" aria-label="Navigasi publik">
            <Link className="transition-colors hover:text-text" href="/">
              Beranda
            </Link>
            <Link className="transition-colors hover:text-text" href="/demo">
              Mode demo
            </Link>
          </nav>
          <Link
            href="/demo"
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            Buka dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-4 py-12 md:px-8 md:py-16">
        <article className="space-y-12">
          <header className="reveal">
            <Badge tone="info">Studi kasus teknis</Badge>
            <h1 className="mt-5 text-[32px] font-semibold leading-[1.1] tracking-tighter text-text md:text-[46px]">
              Konter yang kasnya turun, stoknya juga turun.
            </h1>
            <p className="measure mt-5 text-[16px] leading-relaxed text-text-muted">
              Catatan ini menjelaskan masalah yang diselesaikan Cash Recovery Engine, cara angkanya dihitung, dan seberapa
              jauh angka pada data contoh ini boleh dipercaya. Semua nilai di bawah dihitung saat halaman dibangun dari
              dataset sintetis {formatNumber(data.days, 0)} hari, bukan ditulis tangan.
            </p>
            <p className="num mt-4 text-[12px] text-text-faint">
              Tanggal acuan {formatDate(data.asOf)} - periode mulai {formatDate(data.startDate)} - {formatNumber(data.sales.length, 0)} transaksi
            </p>
          </header>

          {/* ------------------------------------------------------------ konteks */}
          <section className="space-y-4" aria-labelledby="konteks">
            <div className="label-caps">01 - Konteks</div>
            <h2 id="konteks" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Konter kecil, satu pintu, arus kas tipis.
            </h2>
            <p className="measure text-[14.5px] leading-relaxed text-text-muted">
              {SHOP.name} menjual handset, aksesori, voucher pulsa, dan jasa ringan dengan tiga karyawan. Semua keputusan
              stok dan kas dipegang pemilik. Dalam {formatNumber(data.days, 0)} hari terakhir penjualan tidak hilang, tetapi
              saldo kas menurun terus dan nilai persediaan ikut menyusut. Dua hal itu terjadi bersamaan, dan itulah
              petunjuk utamanya.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Kas turun", value: formatRupiah(cashDelta), hint: "perubahan 30 hari terakhir" },
                { label: "Nilai stok turun", value: formatRupiah(inventoryDelta), hint: "modal yang berubah jadi beban" },
                { label: "Utang supplier", value: formatRupiah(payablesDelta), hint: "perubahan posisi utang" },
              ].map((item) => (
                <div key={item.label} className="card px-4 py-3.5">
                  <div className="label-caps">{item.label}</div>
                  <div className={item.value.startsWith("-") ? "num mt-1 text-[18px] font-semibold text-danger" : "num mt-1 text-[18px] font-semibold text-text"}>
                    {item.value}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-text-faint">{item.hint}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ----------------------------------------------------------- masalah */}
          <section className="space-y-4" aria-labelledby="masalah">
            <div className="label-caps">02 - Masalah dan hipotesis</div>
            <h2 id="masalah" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Defisit yang tidak terlihat di laporan penjualan.
            </h2>
            <p className="measure text-[14.5px] leading-relaxed text-text-muted">
              Hipotesisnya sederhana dan bisa diuji: stok dipakai untuk membiayai beban yang bukan stok. Sewa, gaji, dan
              prive pemilik dibayar dengan barang dagangan, sehingga stok terkuras sementara penjualan tetap terlihat wajar.
              Identitas akuntansinya bisa ditulis satu baris.
            </p>
            <div className="card px-5 py-4">
              <p className="num text-[13px] text-text">
                Δ Kas = Laba kotor - Beban - Prive - Δ Stok + Δ Utang
              </p>
              <p className="measure mt-2 text-[13px] leading-relaxed text-text-muted">
                Defisit tersembunyi adalah sisi kiri setelah semua yang terlihat dikeluarkan: Δ Kas + Δ Stok - Δ Utang.
                Angka itulah yang Frizzy sebut True Burn dan tampilkan setiap hari.
              </p>
            </div>
            <div className="card px-0 py-0">
              <div className="scroll-x">
                <table className="w-full min-w-[520px] text-left">
                  <caption className="sr-only">Identitas akuntansi 30 hari terakhir pada data contoh</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="label-caps px-5 py-3">
                        Komponen
                      </th>
                      <th scope="col" className="label-caps px-5 py-3 text-right">
                        Nilai
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Δ Kas 30 hari", value: cashDelta },
                      { label: "Δ Nilai stok", value: inventoryDelta },
                      { label: "Δ Utang supplier", value: payablesDelta },
                      { label: "Defisit tersembunyi (Δ Kas + Δ Stok - Δ Utang)", value: hiddenDeficit },
                      { label: "Laba kotor 30 hari", value: k.grossProfit },
                      { label: "Beban operasional 30 hari", value: -k.opex },
                      { label: "Prive pemilik 30 hari", value: -k.draws },
                      { label: "Laba kotor - beban - prive", value: accountingResult },
                    ].map((row) => (
                      <tr key={row.label} className="border-b border-border last:border-0">
                        <th scope="row" className="px-5 py-2.5 text-left text-[13px] font-normal text-text-muted">
                          {row.label}
                        </th>
                        <td
                          className={
                            row.value < 0
                              ? "num px-5 py-2.5 text-right text-[13px] font-medium text-danger"
                              : "num px-5 py-2.5 text-right text-[13px] font-medium text-text"
                          }
                        >
                          {formatRupiah(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="measure text-[12.5px] leading-relaxed text-text-faint">
              Selisih kecil antara defisit tersembunyi dan laba kotor dikurangi beban dan prive berasal dari waktu
              pencatatan serta pembulatan. Yang penting bukan selisihnya, melainkan tandanya: kedua baris terakhir
              menunjukkan arah yang sama.
            </p>
          </section>

          {/* -------------------------------------------------------------- data */}
          <section className="space-y-4" aria-labelledby="data">
            <div className="label-caps">03 - Data</div>
            <h2 id="data" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Empat parameter krisis yang disengaja.
            </h2>
            <p className="measure text-[14.5px] leading-relaxed text-text-muted">
              Generator memakai RNG berbenih tetap, jadi hasilnya sama setiap kali dijalankan. Empat mekanisme berikut
              ditanam untuk menghasilkan skenario krisis kas yang realistis.
            </p>
            <ol className="space-y-3">
              {[
                {
                  t: "Prive pemilik tinggi dan makin sering",
                  b: "Prive diambil hampir setiap hari, dengan peluang dan nominal yang naik seiring waktu. Nilainya jauh di atas batas bulanan, sehingga kas keluar lebih cepat daripada kemampuan laba kotor menutupinya.",
                },
                {
                  t: "Belanja stok dipotong di bawah HPP",
                  b: "Anggaran belanja harian dihitung mendekati HPP hari itu, lalu dikurangi lagi kalau kas di awal hari sudah menipis. Rasio replenishment akhirnya di bawah 1: stok dipakai membiayai beban non-stok.",
                },
                {
                  t: "Model lama tidak dicari pembeli",
                  b: "Sejumlah SKU lama diberi bobot permintaan nol dan tidak pernah dibeli ulang. Barangnya tetap tercatat di etalase sebagai stok mati, menahan modal tanpa penjualan.",
                },
                {
                  t: "Margin handset tererosi",
                  b: "Harga jual handset turun bertahap sepanjang periode mengikuti perang harga, ditambah nego dan transaksi agresif di bawah harga minimum. Margin handset menipis sementara bauran aksesori belum cukup menutup.",
                },
              ].map((item, i) => (
                <li key={item.t} className="card flex items-start gap-3 px-5 py-4">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[12px] text-text-muted">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-semibold tracking-tight text-text">{item.t}</h3>
                    <p className="measure mt-1 text-[13px] leading-relaxed text-text-muted">{item.b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="card px-5 py-4">
              <div className="label-caps mb-2">Ringkasan dataset</div>
              <dl className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
                {[
                  ["Hari operasional", formatNumber(data.days, 0)],
                  ["Seed generator", "20260215 (deterministik)"],
                  ["Produk", formatNumber(data.products.length, 0)],
                  ["Unit berseri (IMEI)", formatNumber(data.units.length, 0)],
                  ["Transaksi", formatNumber(data.sales.length, 0)],
                  ["Baris pergerakan stok", formatNumber(data.movements.length, 0)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-0">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="num text-text">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* ------------------------------------------------------------ metode */}
          <section className="space-y-4" aria-labelledby="metode">
            <div className="label-caps">04 - Metode</div>
            <h2 id="metode" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Enam keputusan desain yang menentukan angkanya.
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {METHOD.map((item) => (
                <div key={item.title} className="card flex h-full flex-col gap-2 px-5 py-4">
                  <Icon name={item.icon} size={20} className="text-accent" />
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-text">{item.title}</h3>
                  <p className="text-[13px] leading-relaxed text-text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ------------------------------------------------------------- hasil */}
          <section className="space-y-4" aria-labelledby="hasil">
            <div className="label-caps">05 - Hasil pada data contoh</div>
            <h2 id="hasil" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Apa yang mesin lihat pada konter ini.
            </h2>
            <p className="measure text-[14.5px] leading-relaxed text-text-muted">
              Seluruh nilai berikut dihasilkan computeContext dan recoveryScore pada dataset ini. Tidak ada satu pun angka
              yang ditulis manual di halaman ini.
            </p>
            <div className="card px-0 py-0">
              <div className="scroll-x">
                <table className="w-full min-w-[620px] text-left">
                  <caption className="sr-only">Hasil metrik utama pada data contoh 180 hari</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="label-caps px-5 py-3">
                        Metrik
                      </th>
                      <th scope="col" className="label-caps px-5 py-3 text-right">
                        Nilai
                      </th>
                      <th scope="col" className="label-caps px-5 py-3">
                        Catatan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.label} className="border-b border-border last:border-0 align-top">
                        <th scope="row" className="px-5 py-2.5 text-left text-[13px] font-medium text-text">
                          {row.label}
                        </th>
                        <td className="num whitespace-nowrap px-5 py-2.5 text-right text-[13px] text-text">{row.value}</td>
                        <td className="px-5 py-2.5 text-[12.5px] leading-snug text-text-muted">{row.hint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <h3 className="pt-2 text-[17px] font-semibold tracking-tight text-text">Temuan Leak Detector terbesar</h3>
            <p className="measure text-[13.5px] leading-relaxed text-text-muted">
              Mesin menemukan {formatNumber(leaks.length, 0)} aturan yang terlampaui dengan total dampak{" "}
              {formatRupiah(leakImpact)} per bulan
              {topLeak ? `, terbesar pada "${topLeak.rule}"` : ""}. Setiap temuan membawa bukti transaksi dan satu aksi yang
              bisa dikerjakan hari itu.
            </p>
            {leaks.length === 0 ? (
              <p className="text-[13px] text-text-muted">Tidak ada aturan yang terlampaui pada dataset ini.</p>
            ) : (
              <div className="card px-0 py-0">
                <div className="scroll-x">
                  <table className="w-full min-w-[620px] text-left">
                    <caption className="sr-only">Lima temuan kebocoran dengan dampak terbesar</caption>
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="label-caps px-5 py-3">
                          Aturan
                        </th>
                        <th scope="col" className="label-caps px-5 py-3">
                          Tingkat
                        </th>
                        <th scope="col" className="label-caps px-5 py-3 text-right">
                          Bukti
                        </th>
                        <th scope="col" className="label-caps px-5 py-3 text-right">
                          Dampak / bulan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaks.slice(0, 5).map((leak) => (
                        <tr key={leak.id} className="border-b border-border last:border-0 align-top">
                          <th scope="row" className="px-5 py-2.5 text-left">
                            <span className="block text-[13px] font-medium text-text">{leak.rule}</span>
                            <span className="block text-[12px] leading-snug text-text-muted">{leak.action}</span>
                          </th>
                          <td className="px-5 py-2.5">
                            <Badge tone={leak.severity === "high" ? "danger" : leak.severity === "medium" ? "warn" : "info"}>
                              {leak.severity === "high" ? "Berat" : leak.severity === "medium" ? "Sedang" : "Ringan"}
                            </Badge>
                          </td>
                          <td className="num px-5 py-2.5 text-right text-[13px] text-text-muted">
                            {formatNumber(leak.count, 0)}
                          </td>
                          <td className="num whitespace-nowrap px-5 py-2.5 text-right text-[13px] font-medium text-danger">
                            {formatRupiah(leak.impactPerMonth)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="card border-accent/35 bg-accent-soft px-5 py-4">
              <h3 className="text-[14.5px] font-semibold tracking-tight text-text">Urutan yang disarankan mesin</h3>
              <ol className="mt-2.5 space-y-2">
                {score.topActions.map((action, i) => (
                  <li key={`${i}-${action}`} className="flex items-start gap-3">
                    <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-medium text-accent">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed text-text-muted">{action}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ---------------------------------------------------------- batasan */}
          <section className="space-y-4" aria-labelledby="batasan">
            <div className="label-caps">06 - Batasan</div>
            <h2 id="batasan" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Yang belum bisa disimpulkan dari angka ini.
            </h2>
            <ul className="space-y-3">
              {LIMITS.map((limit) => (
                <li key={limit.title} className="card px-5 py-4">
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-text">{limit.title}</h3>
                  <p className="measure mt-1 text-[13px] leading-relaxed text-text-muted">{limit.body}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ------------------------------------------------------- selanjutnya */}
          <section className="space-y-4" aria-labelledby="selanjutnya">
            <div className="label-caps">07 - Apa selanjutnya</div>
            <h2 id="selanjutnya" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
              Dari contoh ke konter sungguhan.
            </h2>
            <ol className="space-y-3">
              {[
                "Impor data nyata: katalog produk, saldo kas per akun, dan riwayat 30 hari pertama. Ledger stok mulai dari opname yang disetujui.",
                "Jalankan mesin aturan dua minggu tanpa mengubah apa pun, lalu catat aturan mana yang paling sering muncul dan berapa dampaknya.",
                "Kalibrasi ambang per kategori, tetapkan batas prive dan lantai kas aman, lalu mulai kerjakan Playbook 90 hari dengan urutan Stabilkan lebih dulu.",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[12px] text-text-muted">
                    {i + 1}
                  </span>
                  <p className="measure text-[13.5px] leading-relaxed text-text-muted">{step}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/demo"
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
              >
                Coba mode demo
                <Icon name="ArrowRight" size={16} weight="bold" />
              </Link>
              <Link
                href="/app/recovery"
                className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-5 text-[14px] font-medium text-text transition-colors hover:bg-surface-2"
              >
                Buka Cash Recovery Engine
              </Link>
            </div>
          </section>
        </article>
      </main>

      <footer className="border-t border-border bg-surface py-10">
        <div className="mx-auto flex max-w-[900px] flex-col gap-2 px-4 text-[12.5px] text-text-faint md:px-8">
          <span className="num">
            {SHOP.system} - {SHOP.name}, {SHOP.address}
          </span>
          <span>
            Semua angka pada halaman ini dihitung dari dataset sintetis berbenih tetap. Tidak ada data konter nyata yang
            dipakai.
          </span>
        </div>
      </footer>
    </div>
  );
}
