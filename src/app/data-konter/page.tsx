import type { Metadata } from "next";
import Link from "next/link";
import { SHOP } from "@/lib/constants";
import { formatCompact, formatDate } from "@/lib/money";
import { computeContext, recoveryScore } from "@/lib/metrics";
import { generateDataset } from "@/lib/generator";
import { DivaCellMark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Feedback";
import { Kpi } from "@/components/ui/Kpi";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Data konter",
  description:
    "Data operasional konter Diva Cell dan cara Frizzy mengubah penjualan, stok, dan kas menjadi angka yang bisa dipakai mengambil keputusan.",
};

const TOUR = [
  {
    href: "/app",
    icon: "Gauge",
    label: "Dashboard",
    body: "Ringkasan kas, penjualan, dan runway dalam satu layar. Semua angka dihitung ulang setiap data berubah.",
  },
  {
    href: "/app/pos",
    icon: "Storefront",
    label: "POS",
    body: "Keranjang, pilih unit per IMEI, bayar tunai atau QRIS, lalu cetak atau kirim struk ke pelanggan.",
  },
  {
    href: "/app/recovery",
    icon: "FirstAid",
    label: "Cash Recovery Engine",
    body: "Inti produk: Leak Detector, Bebas Kas, Reorder Planner, What-If, dan Playbook 90 hari.",
  },
  {
    href: "/app/inventory",
    icon: "Package",
    label: "Stok",
    body: "Ledger stok append-only, kelas ABC/XYZ, umur barang, dan opname blind count per IMEI.",
  },
  {
    href: "/app/finance",
    icon: "Wallet",
    label: "Keuangan",
    body: "Arus kas per akun, beban, prive pemilik, utang supplier, dan piutang pelanggan.",
  },
  {
    href: "/app/ai",
    icon: "Sparkle",
    label: "AI Analyst",
    body: "Tanya data konter dalam bahasa sehari-hari. Model hanya menarasikan angka yang sudah dihitung mesin aturan.",
  },
];

const CARA = [
  {
    title: "Satu sumber catatan",
    body: "Penjualan di kasir, pergerakan stok per IMEI, kas masuk dan keluar, serta beban tercatat di satu tempat. Setiap angka di halaman ini dihitung dari catatan itu, bukan ditulis tangan.",
  },
  {
    title: "Mesin aturan yang bisa dilacak",
    body: "True Burn, runway, temuan kebocoran, dan skor pemulihan dihitung fungsi murni yang sama dengan dashboard. Setiap temuan membawa dampak rupiah per bulan dan tautan ke buktinya.",
  },
  {
    title: "Akses sesuai peran",
    body: "Pemilik memegang setelan kas dan melihat harga pokok serta laba. Staf hanya melihat harga jual, stok, dan indikator batas margin. Pembatasan dilakukan di server, bukan disembunyikan di tampilan.",
  },
];

export default function DataKonterPage() {
  const data = generateDataset();
  const ctx = computeContext(data);
  const score = recoveryScore(ctx);
  const k = ctx.kpis;

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
            <Link className="transition-colors hover:text-text" href="/case-study">
              Studi kasus
            </Link>
          </nav>
          <Link
            href="/app"
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            Buka dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-12 md:px-8 md:py-16">
        <section className="reveal">
          <Badge tone="info" icon={<Icon name="Storefront" size={13} weight="fill" />}>
            Data konter {SHOP.name}
          </Badge>
          <h1 className="mt-5 max-w-[24ch] text-[34px] font-semibold leading-[1.08] tracking-tighter text-text md:text-[52px]">
            Beginilah data konter menjadi keputusan.
          </h1>
          <p className="measure mt-5 text-[16px] leading-relaxed text-text-muted">
            Frizzy merangkum {data.days} hari operasional {SHOP.name}: penjualan di kasir, pergerakan stok per IMEI, kas
            masuk dan keluar, serta beban yang tercatat. Semua fitur berjalan penuh di atas data ini, jadi Anda bisa
            menekan tombol, mengubah tuas, dan melihat angkanya bergerak.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-accent px-6 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Buka dashboard
              <Icon name="ArrowRight" size={16} weight="bold" />
            </Link>
            <Link
              href="/case-study"
              className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-6 text-[15px] font-medium text-text transition-colors hover:bg-surface-2"
            >
              Baca studi kasus
            </Link>
            <span className="num text-[12px] text-text-faint">data per {formatDate(data.asOf)}</span>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="pratinjau">
          <div className="label-caps mb-2">Pratinjau angka</div>
          <h2 id="pratinjau" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
            Empat angka yang dilihat pemilik setiap pagi.
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Kas di tangan"
              value={k.cashOnHand}
              format="rupiah"
              hint={`Lantai kas aman ${formatCompact(data.profile.safetyCashFloor)}`}
            />
            <Kpi
              label="True Burn"
              value={Math.abs(k.trueBurnPerDay)}
              format="rupiah"
              tone="danger"
              subject="/hari"
              hint="Defisit tersembunyi: laba kotor dikurangi beban dan prive"
            />
            <Kpi
              label="Stok mati"
              value={k.deadStockValue}
              format="rupiah"
              tone="warn"
              hint="Modal tertahan pada barang tanpa penjualan 60 hari atau lebih"
            />
            <Kpi
              label="Skor pemulihan"
              value={`${score.score}/100`}
              tone={score.band === "kritis" ? "danger" : score.band === "waspada" ? "warn" : "ok"}
              hint={`Band ${score.band}. Terhitung dari runway, replenishment, kebocoran, stok, dan margin.`}
            />
          </div>
          <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-text-faint">
            Keempat angka di atas dihitung saat halaman ini dibangun, memakai fungsi murni yang sama dengan dashboard.
            Tidak ada permintaan jaringan yang dikirim dari halaman ini.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="coba">
          <div className="label-caps mb-2">Yang bisa dibuka</div>
          <h2 id="coba" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
            Enam pintu masuk, satu data konter yang sama.
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TOUR.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card flex h-full flex-col gap-2.5 px-5 py-5 transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center justify-between gap-2">
                  <Icon name={item.icon} size={22} className="text-accent" />
                  <Icon name="ArrowUpRight" size={16} className="text-text-faint" />
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-text">{item.label}</span>
                <span className="text-[13px] leading-relaxed text-text-muted">{item.body}</span>
                <span className="num mt-auto pt-2 text-[11.5px] text-text-faint">{item.href}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="cara-kerja">
          <div className="label-caps mb-2">Cara kerja sistem</div>
          <h2 id="cara-kerja" className="text-[24px] font-semibold tracking-tight text-text md:text-[28px]">
            Tiga hal tentang cara Frizzy menghitung.
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {CARA.map((item) => (
              <div key={item.title} className="card px-5 py-5">
                <h3 className="text-[15px] font-semibold tracking-tight text-text">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="card mt-4 border-accent/30 bg-accent-soft px-5 py-4">
            <div className="flex items-start gap-3">
              <Icon name="ShieldCheck" size={20} weight="fill" className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-[14px] font-semibold text-text">Data pelanggan dijaga sesuai perannya</p>
                <p className="measure mt-1 text-[13px] leading-relaxed text-text-muted">
                  Nama, nomor telepon, dan IMEI pelanggan hanya dipakai untuk struk, garansi, dan layanan purna jual,
                  sesuai UU PDP. Harga pokok dan laba hanya terbuka untuk pemilik.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="card flex flex-col items-start gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-text md:text-[26px]">
                Mulai dari dashboard, lanjut ke Cash Recovery.
              </h2>
              <p className="measure mt-2 text-[13.5px] leading-relaxed text-text-muted">
                Dashboard menunjukkan posisi kas hari ini. Cash Recovery Engine menjelaskan kenapa kas turun dan apa yang
                harus dikerjakan minggu ini.
              </p>
            </div>
            <Link
              href="/app"
              className="inline-flex h-14 shrink-0 items-center gap-2 rounded-[10px] bg-accent px-7 text-[16px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Buka dashboard
              <Icon name="ArrowRight" size={18} weight="bold" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-10">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 text-[12.5px] text-text-faint md:flex-row md:items-center md:px-8">
          <span className="num">
            {SHOP.system} - {SHOP.name}
          </span>
          <span>{SHOP.hours}</span>
          <span className="md:ml-auto">
            Butuh konteks metodenya?{" "}
            <Link className="underline underline-offset-2 hover:text-text" href="/case-study">
              Baca studi kasus
            </Link>
            .
          </span>
        </div>
      </footer>
    </div>
  );
}
