"use client";

/* ============================================================================
   /app/tutorial - panduan singkat memakai Frizzy.

   Satu halaman berisi alur kerja penting konter: dari menjual di POS, menjaga
   stok per IMEI, membaca dashboard, mencatat kas, sampai memakai Cash Recovery
   Engine. Angka yang tampil diambil dari data operasional yang sedang dimuat,
   jadi pembaca langsung melihat konteks konternya.
   ========================================================================= */

import { useEffect } from "react";
import Link from "next/link";
import { Alert, Badge, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatRupiah } from "@/lib/money";
import { useCtx, useFrizzy } from "@/lib/store";

type Guide = {
  icon: string;
  title: string;
  tagline: string;
  steps: string[];
  href: string;
  cta: string;
};

const QUICKSTART = [
  {
    title: "Kenali posisi hari ini",
    body: "Buka Dashboard. Empat angka teratas menunjukkan kas, True Burn, stok mati, dan skor pemulihan.",
    href: "/app",
  },
  {
    title: "Catat penjualan di POS",
    body: "Pilih barang, pilih unit per IMEI bila handset, lalu bayar tunai atau QRIS dan cetak struk.",
    href: "/app/pos",
  },
  {
    title: "Periksa temuan kas",
    body: "Di Cash Recovery Engine, baca Leak Detector: tiap temuan membawa dampak rupiah dan langkah perbaikannya.",
    href: "/app/recovery",
  },
  {
    title: "Tutup shift sebelum pulang",
    body: "Hitung uang laci, bandingkan dengan kas seharusnya, dan catat alasannya bila ada selisih.",
    href: "/app/shifts",
  },
];

const GUIDES: Guide[] = [
  {
    icon: "Storefront",
    title: "Menjual di POS",
    tagline: "Transaksi paling sering dipakai staf di depan pelanggan.",
    steps: [
      "Cari atau klik barang di katalog. Handset wajib memilih unit IMEI tertentu.",
      "Kalau harga turun dari batas margin, sistem meminta PIN pemilik sebelum transaksi lanjut.",
      "Pilih metode bayar (tunai, QRIS, transfer, EDC, e-wallet, atau bon) lalu selesaikan pembayaran.",
      "Cetak atau kirim struk; stok dan kas ikut terpotong otomatis.",
    ],
    href: "/app/pos",
    cta: "Buka POS",
  },
  {
    icon: "Package",
    title: "Menjaga stok per IMEI",
    tagline: "Stok adalah ledger append-only; setiap perubahan punya jejak.",
    steps: [
      "Lihat level stok dan kelas ABC/XYZ untuk tahu barang cepat dan barang mati.",
      "Tambahkan barang masuk lewat tombol Tambah stok, lengkap dengan IMEI untuk handset.",
      "Jalankan opname blind count untuk mencocokkan hitungan fisik dengan catatan.",
      "Pakai rencana belanja (open-to-buy) agar pembelian mengikuti laba, bukan sekadar barang habis.",
    ],
    href: "/app/inventory",
    cta: "Buka Stok",
  },
  {
    icon: "Wallet",
    title: "Mencatat kas dan beban",
    tagline: "Kas hanya sehat kalau semua uang keluar tercatat.",
    steps: [
      "Catat beban rutin: sewa, gaji, listrik, dan promosi.",
      "Pisahkan prive pemilik dari beban usaha supaya laba tidak tampak lebih besar dari kenyataan.",
      "Pantau utang supplier dan piutang pelanggan beserta tanggal jatuh temponya.",
      "Tutup bulan untuk mengunci angka sebelum dijadikan dasar keputusan.",
    ],
    href: "/app/finance",
    cta: "Buka Keuangan",
  },
  {
    icon: "FirstAid",
    title: "Memakai Cash Recovery Engine",
    tagline: "Inti Frizzy: menjelaskan kenapa kas turun dan apa yang harus dikerjakan.",
    steps: [
      "Baca skor pemulihan: runway, replenishment, kebocoran, kesehatan stok, dan margin.",
      "Telusuri Leak Detector; setiap temuan menunjukkan buktinya dan dampak rupiah per bulan.",
      "Geser tuas What-If untuk melihat efek memangkas prive, diskon, atau mencairkan stok mati.",
      "Kerjakan Playbook 90 hari sesuai fase: stabilkan, bebaskan kas, jaga margin, bangun ulang.",
    ],
    href: "/app/recovery",
    cta: "Buka Cash Recovery",
  },
  {
    icon: "Sparkle",
    title: "Bertanya ke AI Analyst",
    tagline: "Model bahasa hanya menarasikan angka yang sudah dihitung mesin aturan.",
    steps: [
      "Tulis pertanyaan seperti “kenapa kas turun bulan ini?” atau “barang mana yang paling menahan modal?”.",
      "Jawaban selalu disertai angka dari mesin metrik, bukan karangan model.",
      "Pakai tautan di jawaban untuk melompat ke halaman buktinya.",
    ],
    href: "/app/ai",
    cta: "Buka AI Analyst",
  },
  {
    icon: "ShieldCheck",
    title: "Mengatur peran dan keamanan",
    tagline: "Pemilik dan staf melihat hal yang berbeda.",
    steps: [
      "Ganti peran dari bilah atas: Staf tidak melihat harga pokok dan laba.",
      "Aksi sensitif (diskon besar, void, ubah harga) meminta PIN pemilik.",
      "Tinjau sesi, perangkat tepercaya, dan audit log secara berkala.",
      "Sesuaikan identitas toko, struk, ulasan, dan preferensi di Pengaturan.",
    ],
    href: "/app/security",
    cta: "Buka Keamanan",
  },
];

export default function TutorialPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "idle" || status === "loading") return <TutorialSkeleton />;
  if (status === "error") {
    return (
      <div className="mx-auto max-w-[720px] py-10">
        <Alert tone="danger" title="Data operasional gagal dimuat">
          {error ?? "Terjadi kesalahan tidak terduga."}
        </Alert>
        <div className="mt-4">
          <Button
            variant="primary"
            onClick={() => {
              reset();
              void hydrate();
            }}
          >
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  return <TutorialBody />;
}

function TutorialBody() {
  const ctx = useCtx();
  const data = ctx.data;
  const k = ctx.kpis;

  return (
    <div className="mx-auto max-w-[1100px] space-y-10 pb-16">
      <header>
        <Badge tone="info" icon={<Icon name="BookOpen" size={13} weight="fill" />}>
          Panduan singkat
        </Badge>
        <h1 className="mt-4 max-w-[28ch] text-[30px] font-semibold leading-[1.1] tracking-tighter text-text md:text-[40px]">
          Cara memakai Frizzy, dari penjualan sampai keputusan.
        </h1>
        <p className="measure mt-4 text-[15px] leading-relaxed text-text-muted">
          Halaman ini menuntun alur kerja penting konter {data.profile.name}. Semua angka di sini dihitung dari data
          operasional konter yang sedang dimuat, jadi pembaca langsung melihat konteks aslinya.
        </p>
      </header>

      <section aria-labelledby="kondisi">
        <SectionTitle
          eyebrow="Konteks data"
          title="Angka yang sedang dibaca"
          hint="Empat angka ringkas dari periode operasional yang sedang aktif."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Hari operasional" value={data.days} format="days" hint={`${formatDate(data.startDate)} - ${formatDate(data.asOf)}`} />
          <Kpi label="Penjualan 30 hari" value={k.netSales} format="rupiah" hint="Penjualan neto setelah diskon" />
          <Kpi label="Struk tercatat" value={k.salesCount} format="number" hint="Termasuk aksesori, voucher, dan jasa" />
          <Kpi
            label="Kas di tangan"
            value={k.cashOnHand}
            format="rupiah"
            tone={k.runwayState === "critical" ? "danger" : k.runwayState === "watch" ? "warn" : "ok"}
            hint={`Runway ${Number.isFinite(k.runwayDays) ? `${Math.round(k.runwayDays)} hari` : "aman"}`}
          />
        </div>
      </section>

      <section aria-labelledby="lima-menit">
        <SectionTitle
          eyebrow="Lima menit pertama"
          title="Empat langkah untuk mulai bekerja"
          hint="Urutan ini cukup untuk menjalankan operasional harian konter."
        />
        <ol className="grid gap-4 md:grid-cols-2">
          {QUICKSTART.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full flex-col">
                <CardBody className="flex h-full flex-col gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent">
                    {index + 1}
                  </span>
                  <h3 className="text-[15px] font-semibold tracking-tight text-text">{step.title}</h3>
                  <p className="text-[13px] leading-relaxed text-text-muted">{step.body}</p>
                  <Link
                    href={step.href}
                    className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-medium text-accent hover:underline"
                  >
                    Buka {step.href}
                    <Icon name="ArrowRight" size={15} weight="bold" />
                  </Link>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fitur">
        <SectionTitle
          eyebrow="Fitur penting"
          title="Tujuh kebiasaan yang membuat kas tetap sehat"
          hint="Setiap kartu menjelaskan langkahnya dan halaman tempat mengerjakannya."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {GUIDES.map((guide) => (
            <Card key={guide.title} className="flex h-full flex-col">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Icon name={guide.icon} size={18} className="text-accent" />
                    {guide.title}
                  </span>
                }
                hint={guide.tagline}
              />
              <CardBody className="flex h-full flex-col gap-3">
                <ol className="space-y-2">
                  {guide.steps.map((step, i) => (
                    <li key={step} className="flex gap-2.5 text-[13px] leading-relaxed text-text-muted">
                      <span className="num mt-0.5 shrink-0 text-[12px] text-text-faint">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <Link
                  href={guide.href}
                  className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface px-4 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-2"
                >
                  {guide.cta}
                  <Icon name="ArrowUpRight" size={15} weight="bold" />
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="catatan">
        <SectionTitle eyebrow="Catatan cepat" title="Hal yang sering ditanyakan" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="PIN dan peran" hint="Keamanan aksi sensitif" />
            <CardBody className="space-y-2.5 text-[13px] leading-relaxed text-text-muted">
              <p>
                PIN pemilik pada data ini adalah <span className="num font-semibold text-text">2468</span>, PIN staf{" "}
                <span className="num font-semibold text-text">1234</span>. Ganti keduanya di Pengaturan sebelum dipakai
                sungguhan.
              </p>
              <p>
                Untuk berpindah peran, pakai tombol peran di bilah atas. Staf tetap bisa melayani penjualan, tetapi tidak
                melihat harga pokok, laba, dan halaman keuangan.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Mencari halaman dengan cepat" hint="Palet perintah" />
            <CardBody className="space-y-2.5 text-[13px] leading-relaxed text-text-muted">
              <p>
                Tekan <span className="num rounded bg-surface-2 px-1.5 py-0.5 text-text">Ctrl</span> +{" "}
                <span className="num rounded bg-surface-2 px-1.5 py-0.5 text-text">K</span> untuk membuka pencarian
                halaman dan aksi. Tekan <span className="num rounded bg-surface-2 px-1.5 py-0.5 text-text">Esc</span>{" "}
                untuk menutupnya.
              </p>
              <p>
                Nilai periode aktif: kas {formatRupiah(k.cashOnHand)}. Bila angkanya berubah, seluruh halaman ikut
                menghitung ulang tanpa perlu memuat ulang manual.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      <Card className="border-accent/30 bg-accent-soft">
        <CardBody className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-text">Sudah paham alurnya?</h2>
            <p className="measure mt-1 text-[13px] leading-relaxed text-text-muted">
              Mulai dari Dashboard, lalu lanjut ke Cash Recovery Engine untuk tahu langkah minggu ini.
            </p>
          </div>
          <Link
            href="/app"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            Buka Dashboard
            <Icon name="ArrowRight" size={16} weight="bold" />
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

function TutorialSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
