import { NAV, SHOP } from "@/lib/constants";
import { formatCompact } from "@/lib/money";
import { computeContext, detectLeaks, buildCashBridge, buildFreeCashPlan, recoveryScore } from "@/lib/metrics";
import { generateDataset } from "@/lib/generator";
import { RunwayWidget } from "@/components/landing/RunwayWidget";
import { CashBridge } from "@/components/charts/CashBridge";
import { Badge } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { DivaCellMark } from "@/components/brand/Logo";
import { RevealOnScroll } from "@/components/landing/RevealOnScroll";
import { ThemeToggle } from "@/components/landing/ThemeToggle";

/* Halaman pemasaran dirender dinamis agar build tidak men-static-kan halaman
   besar; kontennya deterministik dan murah dihitung. */
export const dynamic = "force-dynamic";

export default function LandingPage() {
  const data = generateDataset();
  const ctx = computeContext(data);
  const leaks = detectLeaks(ctx);
  const bridge = buildCashBridge(ctx, 30);
  const freeCash = buildFreeCashPlan(ctx, 6);
  const score = recoveryScore(ctx);
  const k = ctx.kpis;

  const capability = [
    {
      icon: "Storefront",
      title: "POS cepat di perangkat apa pun",
      body: "Keranjang, pilih IMEI, bayar tunai atau QRIS, cetak atau kirim struk. Checkout di bawah 20 detik.",
      span: "md:col-span-3",
    },
    {
      icon: "Package",
      title: "Stok berbasis IMEI",
      body: "Setiap unit punya riwayat sendiri. Opname bisa blind count, selisih langsung jadi temuan.",
      span: "md:col-span-3",
    },
    {
      icon: "FirstAid",
      title: "Cash Recovery Engine",
      body: "Mendiagnosis kebocoran, membebaskan kas dari stok mati, lalu menyusun anggaran belanja yang aman.",
      span: "md:col-span-2",
      accent: true,
    },
    {
      icon: "Sparkle",
      title: "AI Analyst yang tidak mengarang angka",
      body: "Semua aritmetika dihitung mesin aturan. AI hanya menarasikan dan memprioritaskan.",
      span: "md:col-span-2",
    },
    {
      icon: "Users",
      title: "Multi perangkat",
      body: "Tablet kasir, HP pemilik, dan komputer belakang membaca data yang sama. Tanpa oversell.",
      span: "md:col-span-2",
    },
  ];

  const steps = [
    { n: "01", title: "Scan", body: "Barcode atau IMEI langsung masuk keranjang, harga terkunci." },
    { n: "02", title: "Bayar", body: "Tunai, QRIS, transfer, atau kartu. Bisa campur dalam satu struk." },
    { n: "03", title: "Struk", body: "Cetak termal, kirim email, atau tautan publik dengan IMEI dan masa garansi." },
    { n: "04", title: "Ulasan", body: "Permintaan ulasan Google terjadwal, tanpa menyaring pelanggan." },
  ];

  const playbook = [
    { phase: "Stabilkan", window: "Minggu 0-1", body: "Tutup shift harian, aktifkan margin guard, tetapkan prive tetap, catat semua beban." },
    { phase: "Bebaskan kas", window: "Minggu 2-4", body: "Markdown stok mati, kembalikan unit lambat ke supplier, bayar utang sesuai prioritas." },
    { phase: "Jaga margin", window: "Bulan 2", body: "Naikkan attach rate aksesori, tambah jasa dan tukar tambah, nego termin supplier." },
    { phase: "Bangun ulang", window: "Bulan 3", body: "Belanja stok pakai open-to-buy, ikuti prakiraan permintaan, kejar ulasan." },
  ];

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 md:px-8">
          <a href="#atas" className="flex items-center gap-2.5">
            <DivaCellMark size={30} />
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-text">Diva Cell</span>
              <span className="num text-[10px] uppercase tracking-[0.16em] text-text-faint">Frizzy</span>
            </span>
          </a>
          <nav className="hidden items-center gap-6 text-[13.5px] text-text-muted md:flex" aria-label="Navigasi halaman">
            <a className="transition-colors hover:text-text" href="#kebocoran">
              Masalahnya
            </a>
            <a className="transition-colors hover:text-text" href="#kemampuan">
              Kemampuan
            </a>
            <a className="transition-colors hover:text-text" href="#pemulihan">
              Cash Recovery
            </a>
            <a className="transition-colors hover:text-text" href="#tanya">
              Tanya data
            </a>
            <a className="transition-colors hover:text-text" href="#keamanan">
              Keamanan
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <a
              href="/app"
              className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Buka dashboard
            </a>
          </div>
        </div>
      </header>

      <main id="atas">
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-16 md:grid-cols-12 md:px-8 md:py-24">
          <div className="md:col-span-7">
            <RevealOnScroll>
              <Badge tone="warn" icon={<Icon name="WarningCircle" size={13} weight="fill" />}>
                Kas kritis dalam 30 hari terakhir
              </Badge>
            </RevealOnScroll>
            <RevealOnScroll delay={60}>
              <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-tighter text-text md:text-[62px]">
                Tahu posisi kas
                <br />
                sebelum kehabisan.
              </h1>
            </RevealOnScroll>
            <RevealOnScroll delay={120}>
              <p className="measure mt-5 text-[16px] leading-relaxed text-text-muted">
                Penjualan, stok, dan kas dalam satu ruang kerja yang tenang. Dibuat untuk konter ponsel yang ingin berhenti
                kehabisan stok dan mulai menumbuhkan laba.
              </p>
            </RevealOnScroll>
            <RevealOnScroll delay={180}>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href="/app"
                  className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-accent px-6 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
                >
                  Buka dashboard
                  <Icon name="ArrowRight" size={16} weight="bold" />
                </a>
                <a
                  href="/data-konter"
                  className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-6 text-[15px] font-medium text-text transition-colors hover:bg-surface-2"
                >
                  Lihat data konter
                </a>
              </div>
            </RevealOnScroll>
            <RevealOnScroll delay={240}>
              <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-6 md:grid-cols-4">
                {[
                  { l: "Kas hari ini", v: formatCompact(k.cashOnHand) },
                  { l: "True Burn / hari", v: formatCompact(Math.abs(k.trueBurnPerDay)) },
                  { l: "Stok mati", v: formatCompact(k.deadStockValue) },
                  { l: "Skor pemulihan", v: `${score.score}/100` },
                ].map((s) => (
                  <div key={s.l}>
                    <dt className="text-[11.5px] text-text-muted">{s.l}</dt>
                    <dd className="num mt-0.5 text-[17px] font-semibold text-text">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </RevealOnScroll>
          </div>
          <div className="md:col-span-5">
            <RevealOnScroll delay={140}>
              <RunwayWidget />
            </RevealOnScroll>
          </div>
        </section>

        {/* --------------------------------------------------------- kebocoran */}
        <section id="kebocoran" className="border-t border-border bg-surface-2/40 py-16 md:py-24">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-4 md:grid-cols-12 md:px-8">
            <div className="md:col-span-4">
              <RevealOnScroll>
                <div className="label-caps mb-2">Masalah sebenarnya</div>
                <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-text md:text-[40px]">
                  Kas turun, stok juga turun.
                </h2>
                <p className="measure mt-4 text-[15px] leading-relaxed text-text-muted">
                  Dua hal itu biasanya berarti satu hal: stok dipakai untuk membiayai beban yang bukan stok. Sewa, gaji, dan
                  prive pemilik dibayar dengan barang dagangan.
                </p>
                <div className="mt-6 space-y-3">
                  <div className="card px-4 py-3.5">
                    <div className="num text-[12px] text-text-faint">Δ Kas = Laba kotor - Beban - Prive - Δ Stok + Δ Utang</div>
                    <p className="mt-2 text-[12.5px] leading-snug text-text-muted">
                      Defisit tersembunyi = Δ Kas + Δ Stok - Δ Utang. Angka inilah yang Frizzy tampilkan sebagai True Burn.
                    </p>
                  </div>
                  <div className="card border-danger/30 px-4 py-3.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] text-text-muted">True Burn 30 hari terakhir</span>
                      <span className="num text-[18px] font-semibold text-danger">
                        {formatCompact(Math.abs(k.trueBurnPerDay))}/hari
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-snug text-text-faint">
                      Runway {Number.isFinite(k.runwayDays) ? Math.round(k.runwayDays) : "∞"} hari pada laju ini.
                    </p>
                  </div>
                </div>
              </RevealOnScroll>
            </div>
            <div className="md:col-span-8">
              <RevealOnScroll delay={100}>
                <div className="card px-5 py-5">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h3 className="text-[15px] font-semibold text-text">Stock-to-Cash Bridge 30 hari</h3>
                    <span className="num text-[11.5px] text-text-faint">kas awal ke kas akhir</span>
                  </div>
                  <CashBridge steps={bridge} />
                </div>
              </RevealOnScroll>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- kemampuan */}
        <section id="kemampuan" className="py-16 md:py-24">
          <div className="mx-auto max-w-[1240px] px-4 md:px-8">
            <RevealOnScroll>
              <div className="label-caps mb-2">Kemampuan</div>
              <h2 className="max-w-[22ch] text-[30px] font-semibold leading-tight tracking-tight text-text md:text-[40px]">
                Satu sistem, dari meja kasir sampai laporan pemilik.
              </h2>
            </RevealOnScroll>
            <div className="mt-8 grid gap-4 md:grid-cols-6">
              {capability.map((c, i) => (
                <RevealOnScroll key={c.title} delay={i * 60} className={c.span}>
                  <div className={`card flex h-full flex-col gap-2.5 px-5 py-5 ${c.accent ? "border-accent/40 bg-accent-soft" : ""}`}>
                    <Icon name={c.icon} size={22} weight={c.accent ? "fill" : "regular"} className={c.accent ? "text-accent" : "text-text-muted"} />
                    <h3 className="text-[15px] font-semibold tracking-tight text-text">{c.title}</h3>
                    <p className="text-[13px] leading-relaxed text-text-muted">{c.body}</p>
                  </div>
                </RevealOnScroll>
              ))}
            </div>
            <RevealOnScroll delay={120}>
              <div className="mt-4 grid gap-3 rounded-[16px] border border-border bg-surface px-5 py-5 md:grid-cols-4">
                {NAV.filter((n) => ["/app", "/app/pos", "/app/inventory", "/app/recovery"].includes(n.href)).map((n) => (
                  <div key={n.href} className="flex items-start gap-2.5">
                    <Icon name={n.icon} size={18} className="mt-0.5 text-accent" />
                    <div>
                      <div className="text-[13px] font-medium text-text">{n.label}</div>
                      <div className="text-[12px] leading-snug text-text-faint">{n.hint}</div>
                    </div>
                  </div>
                ))}
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* -------------------------------------------------------- alur jualan */}
        <section className="border-y border-border bg-surface-2/40 py-16 md:py-24">
          <div className="mx-auto max-w-[1240px] px-4 md:px-8">
            <RevealOnScroll>
              <div className="label-caps mb-2">Alur di konter</div>
              <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-text md:text-[40px]">
                Empat langkah, tanpa kertas.
              </h2>
            </RevealOnScroll>
            <ol className="mt-8 grid gap-4 md:grid-cols-4">
              {steps.map((s, i) => (
                <RevealOnScroll key={s.n} delay={i * 70}>
                  <li className="card h-full px-5 py-5">
                    <span className="num text-[12px] text-accent">{s.n}</span>
                    <h3 className="mt-2 text-[16px] font-semibold text-text">{s.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{s.body}</p>
                  </li>
                </RevealOnScroll>
              ))}
            </ol>
            <RevealOnScroll delay={200}>
              <p className="mt-5 max-w-[70ch] text-[12.5px] leading-relaxed text-text-faint">
                Permintaan ulasan tidak pernah menyaring pelanggan lebih dulu: pelanggan yang tidak puas tetap menerima
                tautan Google, ditambah jalur masukan pribadi. Ini mengikuti kebijakan Google dan UU PDP.
              </p>
            </RevealOnScroll>
          </div>
        </section>

        {/* ----------------------------------------------------------- pemulihan */}
        <section id="pemulihan" className="py-16 md:py-24">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-4 md:grid-cols-12 md:px-8">
            <div className="md:col-span-5">
              <div className="md:sticky md:top-24">
                <RevealOnScroll>
                  <div className="label-caps mb-2">Cash Recovery Engine</div>
                  <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-text md:text-[40px]">
                    Mesin aturan yang menghitung, bukan menebak.
                  </h2>
                  <p className="measure mt-4 text-[15px] leading-relaxed text-text-muted">
                    Setiap temuan punya dampak rupiah per bulan, bukti transaksinya, dan satu aksi yang bisa dikerjakan
                    hari ini. Sepuluh aturan berjalan pada data konter ini.
                  </p>
                </RevealOnScroll>
                <RevealOnScroll delay={80}>
                  <div className="card mt-6 divide-y divide-border">
                    {leaks.slice(0, 5).map((l) => (
                      <div key={l.id} className="flex items-start gap-3 px-4 py-3.5">
                        <Badge tone={l.severity === "high" ? "danger" : l.severity === "medium" ? "warn" : "neutral"}>
                          {l.severity === "high" ? "Berat" : l.severity === "medium" ? "Sedang" : "Ringan"}
                        </Badge>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium text-text">{l.rule}</div>
                          <div className="num text-[12px] text-text-muted">{formatCompact(l.impactPerMonth)}/bulan</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </RevealOnScroll>
              </div>
            </div>

            <div className="md:col-span-7">
              <div className="space-y-4">
                {playbook.map((p, i) => (
                  <RevealOnScroll key={p.phase} delay={i * 70}>
                    <div className="card px-5 py-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-[16px] font-semibold text-text">{p.phase}</h3>
                        <span className="num text-[11.5px] text-text-faint">{p.window}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{p.body}</p>
                    </div>
                  </RevealOnScroll>
                ))}
                <RevealOnScroll delay={300}>
                  <div className="card border-accent/35 bg-accent-soft px-5 py-5">
                    <h3 className="text-[15px] font-semibold text-text">Rencana bebas kas yang sudah dihitung</h3>
                    <ul className="mt-3 space-y-2">
                      {freeCash.map((f) => (
                        <li key={f.product.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="truncate text-text-muted">{f.product.name}</span>
                          <span className="num shrink-0 text-text">
                            {f.qty} pcs - {formatCompact(f.trappedCash)} tertahan
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[12px] leading-snug text-text-muted">
                      Total modal tertahan di stok mati {formatCompact(k.deadStockValue)}. Markdown dibatasi agar tidak menjual
                      di bawah harga pokok.
                    </p>
                  </div>
                </RevealOnScroll>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- tanya */}
        <section id="tanya" className="border-y border-border bg-surface-2/40 py-16 md:py-24">
          <div className="mx-auto max-w-[1240px] px-4 md:px-8">
            <RevealOnScroll>
              <div className="label-caps mb-2">Tanya data konter</div>
              <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-text md:text-[40px]">
                Jawaban yang selalu bisa dilacak.
              </h2>
            </RevealOnScroll>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                {
                  q: "Kenapa kas turun padahal penjualan tidak turun?",
                  a: `Laba kotor 30 hari ${formatCompact(k.grossProfit)}, sementara beban ${formatCompact(
                    k.opex
                  )} dan prive ${formatCompact(k.draws)}. Selisihnya ditutup dari stok: nilai persediaan turun.`,
                  tag: "True Burn",
                },
                {
                  q: "Barang apa yang paling banyak menahan uang?",
                  a: `Ada ${formatCompact(k.deadStockValue)} modal di stok tanpa penjualan 60 hari atau lebih. Daftarnya diurutkan dari nilai tertahan terbesar.`,
                  tag: "Stok mati",
                },
                {
                  q: "Kalau prive dipotong 60% dan separuh stok mati cair, runway jadi berapa?",
                  a: `Runway naik dari ${Number.isFinite(k.runwayDays) ? Math.round(k.runwayDays) : "∞"} hari menjadi puluhan hari, dan True Burn mendekati nol. Angka tepatnya ada di What-If Simulator.`,
                  tag: "Simulasi",
                },
                {
                  q: "Dengan kas yang ada, sebaiknya belanja apa?",
                  a: `Anggaran open-to-buy dihitung dari kas dikurangi lantai aman dan utang jatuh tempo. Barang diurutkan GMROI, bukan dari yang paling habis.`,
                  tag: "Open-to-buy",
                },
              ].map((item, i) => (
                <RevealOnScroll key={item.q} delay={i * 60}>
                  <div className="card h-full px-5 py-5">
                    <Badge tone="info">{item.tag}</Badge>
                    <p className="mt-3 text-[15px] font-medium leading-snug text-text">{item.q}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{item.a}</p>
                  </div>
                </RevealOnScroll>
              ))}
            </div>
            <RevealOnScroll delay={200}>
              <p className="mt-5 text-[12.5px] text-text-faint">
                AI Analyst memakai alat yang sama dengan halaman ini. Angka tidak pernah diarang oleh model bahasa.
              </p>
            </RevealOnScroll>
          </div>
        </section>

        {/* ------------------------------------------------------------ keamanan */}
        <section id="keamanan" className="py-16 md:py-24">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-4 md:grid-cols-2 md:px-8">
            <div>
              <RevealOnScroll>
                <div className="label-caps mb-2">Keamanan dan sinkronisasi</div>
                <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-text md:text-[36px]">
                  Aman secara desain, bukan tambahan belakangan.
                </h2>
              </RevealOnScroll>
              <RevealOnScroll delay={80}>
                <ul className="mt-6 divide-y divide-border border-y border-border">
                  {[
                    "Kebijakan izin terpusat, tolak secara bawaan. Staf tidak pernah melihat harga pokok.",
                    "Ledger stok append-only: dua kasir tidak bisa membuat stok jadi salah.",
                    "Aksi sensitif butuh PIN pemilik dan tercatat di audit log.",
                    "Baseline OWASP ASVS Level 2, Top 10, dan API Security Top 10.",
                    "Data pelanggan diproses dengan consent, sesuai UU PDP.",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5 py-3 text-[13.5px] leading-relaxed text-text-muted">
                      <Icon name="ShieldCheck" size={18} className="mt-0.5 shrink-0 text-accent" />
                      {t}
                    </li>
                  ))}
                </ul>
              </RevealOnScroll>
            </div>
            <div>
              <RevealOnScroll delay={140}>
                <div className="card px-5 py-5">
                  <div className="label-caps mb-3">Di bawah kap mesin</div>
                  <dl className="num space-y-2 text-[12.5px]">
                    {[
                      ["Antarmuka", "Next.js App Router, React 19, Tailwind v4"],
                      ["Basis data", "PostgreSQL 16, Drizzle ORM"],
                      ["Aturan uang", "Integer rupiah, tanpa float"],
                      ["Stok", "Ledger append-only + unit IMEI"],
                      ["Pembayaran", "QRIS, tunai, transfer, kartu (EDC)"],
                      ["Struk", "Termal 58/80mm, email, tautan publik"],
                      ["Analitik", "13 minggu prakiraan, GMROI, DIO, ABC/XYZ"],
                      ["Data konter", `${data.days} hari, ${data.sales.length} transaksi tercatat`],
                    ].map(([a, b]) => (
                      <div key={a} className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
                        <dt className="font-sans text-text-faint">{a}</dt>
                        <dd className="text-right text-text">{b}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </RevealOnScroll>
              <RevealOnScroll delay={200}>
                <a
                  href="/case-study"
                  className="mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
                >
                  <div>
                    <div className="text-[14px] font-semibold text-text">Baca studi kasus</div>
                    <div className="text-[12.5px] text-text-muted">
                      Metode, keputusan desain, dan batasan angkanya.
                    </div>
                  </div>
                  <Icon name="ArrowUpRight" size={18} className="text-text-muted" />
                </a>
              </RevealOnScroll>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- FAQ */}
        <section className="border-t border-border bg-surface-2/40 py-16 md:py-24">
          <div className="mx-auto max-w-[840px] px-4 md:px-8">
            <RevealOnScroll>
              <h2 className="text-[26px] font-semibold tracking-tight text-text md:text-[32px]">Pertanyaan yang sering muncul</h2>
            </RevealOnScroll>
            <div className="mt-6 divide-y divide-border border-y border-border">
              {[
                {
                  q: "Kalau internet mati, masih bisa jualan?",
                  a: "Bisa. Transaksi tunai dan kartu disimpan di antrean lokal dengan kunci idempotensi, lalu dikirim saat jaringan kembali. QRIS butuh koneksi karena statusnya datang dari penyedia.",
                },
                {
                  q: "Apakah data ini data nyata?",
                  a: "Angka di halaman ini dihitung langsung dari catatan operasional konter: penjualan di kasir, pergerakan stok, kas masuk dan keluar, serta beban yang tercatat. Tidak ada angka yang ditulis tangan.",
                },
                {
                  q: "Bagaimana struk dikirim ke pelanggan?",
                  a: "Cetak termal, email dengan lampiran PDF dan tautan publik bertoken, atau tautan WhatsApp. Semua hanya dikirim kalau pelanggan memberi persetujuan.",
                },
                {
                  q: "Siapa yang bisa melihat harga pokok dan laba?",
                  a: "Hanya pemilik. Staf melihat harga jual, stok, dan indikator batas margin tanpa angka laba. Pembatasan dilakukan di server, bukan hanya disembunyikan di tampilan.",
                },
              ].map((f, i) => (
                <RevealOnScroll key={f.q} delay={i * 50}>
                  <details className="group py-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-text">
                      {f.q}
                      <Icon name="Plus" size={18} className="shrink-0 text-text-faint transition-transform group-open:rotate-45" />
                    </summary>
                    <p className="measure mt-2.5 text-[13.5px] leading-relaxed text-text-muted">{f.a}</p>
                  </details>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-12">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 md:grid-cols-3 md:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <DivaCellMark size={28} />
              <span className="text-[15px] font-semibold text-text">{SHOP.name}</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              {SHOP.address}
              <br />
              {SHOP.phone}
              <br />
              {SHOP.hours}
            </p>
          </div>
          <div>
            <div className="label-caps mb-2">Aplikasi</div>
            <ul className="space-y-1.5 text-[13px] text-text-muted">
              {NAV.slice(0, 6).map((n) => (
                <li key={n.href}>
                  <a className="transition-colors hover:text-text" href={n.href}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label-caps mb-2">Catatan</div>
            <p className="text-[12.5px] leading-relaxed text-text-faint">
              Angles dan ambang batas di sistem ini adalah nilai awal. Kalibrasi ulang setelah dua sampai empat minggu data
              nyata konter.
            </p>
            <p className="num mt-3 text-[11.5px] text-text-faint">{SHOP.system} - {SHOP.name}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
