"use client";

/* ============================================================================
   /app/reports - katalog laporan Frizzy: satu tempat untuk tahu laporan mana
   yang menjawab pertanyaan apa, plus ekspor CSV yang dihitung di klien.
   ========================================================================= */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Alert, Badge, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { DataRow, Kpi } from "@/components/ui/Kpi";
import { formatCompact, formatDate, formatNumber } from "@/lib/money";
import { useFrizzy } from "@/lib/store";
import type { Context } from "@/lib/metrics";
import type { Dataset } from "@/lib/types";

/* ------------------------------------------------------------------ tipe */

type ReportGroup =
  | "Penjualan"
  | "Laba"
  | "Persediaan"
  | "Kas & Keuangan"
  | "Pembelian"
  | "Pelanggan"
  | "Operasional"
  | "Pemulihan";

type ExportKey = "sales_daily" | "profit_product" | "aging_receivable";

type ReportEntry = {
  id: string;
  group: ReportGroup;
  name: string;
  summary: string;
  period: string;
  href: string;
  hrefLabel: string;
  exportKey?: ExportKey;
};

const REPORTS: ReportEntry[] = [
  {
    id: "penjualan-harian",
    group: "Penjualan",
    name: "Rekap penjualan harian",
    summary: "Penjualan neto, HPP, laba kotor, dan jumlah struk untuk setiap hari pada periode aktif.",
    period: "30 hari terakhir",
    href: "/app/sales",
    hrefLabel: "Buka Penjualan",
    exportKey: "sales_daily",
  },
  {
    id: "penjualan-struk",
    group: "Penjualan",
    name: "Detail struk dan IMEI",
    summary: "Setiap struk beserta unit IMEI yang keluar, kasir, dan status transaksinya.",
    period: "30 hari terakhir",
    href: "/app/sales",
    hrefLabel: "Buka Penjualan",
  },
  {
    id: "penjualan-metode",
    group: "Penjualan",
    name: "Bauran metode bayar",
    summary: "Porsi tunai, QRIS, transfer, EDC, e-wallet, dan bon terhadap total penjualan.",
    period: "30 hari terakhir",
    href: "/app/pos",
    hrefLabel: "Buka POS",
  },
  {
    id: "penjualan-diskon",
    group: "Penjualan",
    name: "Kebocoran diskon",
    summary: "Diskon per kasir dan per alasan, dihitung sebagai persentase penjualan kotor.",
    period: "30 hari terakhir",
    href: "/app/sales",
    hrefLabel: "Buka Penjualan",
  },
  {
    id: "laba-produk",
    group: "Laba",
    name: "Laba kotor per produk",
    summary: "Unit terjual, omzet, laba kotor, dan margin tiap produk agar terlihat mana yang benar-benar menyumbang.",
    period: "30 hari terakhir",
    href: "/app/inventory",
    hrefLabel: "Buka Stok",
    exportKey: "profit_product",
  },
  {
    id: "laba-ringkasan",
    group: "Laba",
    name: "Ringkasan laba rugi ringkas",
    summary: "Penjualan neto, HPP, laba kotor, beban operasional, prive, dan True Burn harian.",
    period: "30 hari terakhir",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "persediaan-nilai",
    group: "Persediaan",
    name: "Nilai persediaan dan perputaran",
    summary: "Nilai stok, DIO, turnover, dan GMROI sebagai satu paket kesehatan modal yang tertahan.",
    period: "30 hari terakhir",
    href: "/app/inventory",
    hrefLabel: "Buka Stok",
  },
  {
    id: "persediaan-umur",
    group: "Persediaan",
    name: "Umur stok",
    summary: "Sebaran unit menurut hari sejak penjualan terakhir, termasuk daftar stok mati dan lambat.",
    period: "90 hari terakhir",
    href: "/app/inventory",
    hrefLabel: "Buka Stok",
  },
  {
    id: "persediaan-opname",
    group: "Persediaan",
    name: "Selisih opname",
    summary: "Perbandingan jumlah sistem dan jumlah hitung fisik per produk beserta nilai selisihnya.",
    period: "Sesi terakhir",
    href: "/app/inventory",
    hrefLabel: "Buka Stok",
  },
  {
    id: "kas-arus",
    group: "Kas & Keuangan",
    name: "Arus kas harian",
    summary: "Kas masuk, kas keluar, dan saldo kas akhir hari untuk seluruh akun konter.",
    period: "30 hari terakhir",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "kas-bridge",
    group: "Kas & Keuangan",
    name: "Cash bridge",
    summary: "Jembatan dari kas awal ke kas akhir: penjualan, belanja stok, beban, dan prive.",
    period: "30 hari terakhir",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "kas-beban",
    group: "Kas & Keuangan",
    name: "Beban per kategori",
    summary: "Beban operasional dikelompokkan per kategori dan per bulan, dengan lampiran nota.",
    period: "6 bulan terakhir",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "kas-prive",
    group: "Kas & Keuangan",
    name: "Prive pemilik",
    summary: "Prive harian dan akumulasinya terhadap batas bulanan yang ditetapkan pemilik.",
    period: "30 hari terakhir",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "kas-utang",
    group: "Kas & Keuangan",
    name: "Aging utang supplier",
    summary: "Purchase order yang belum dibayar menurut umur jatuh tempo, beserta total kewajiban.",
    period: "Posisi hari ini",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "pembelian-po",
    group: "Pembelian",
    name: "Riwayat purchase order",
    summary: "PO per supplier, tanggal pesan, tanggal terima, jatuh tempo, dan status pembayarannya.",
    period: "90 hari terakhir",
    href: "/app/purchasing",
    hrefLabel: "Buka Pembelian",
  },
  {
    id: "pembelian-supplier",
    group: "Pembelian",
    name: "Kinerja supplier",
    summary: "Lead time aktual, ketepatan kirim, dan nilai belanja per supplier.",
    period: "6 bulan terakhir",
    href: "/app/purchasing",
    hrefLabel: "Buka Pembelian",
  },
  {
    id: "pelanggan-bon",
    group: "Pelanggan",
    name: "Aging piutang pelanggan",
    summary: "Bon pelanggan menurut umur jatuh tempo, dengan total outstanding dan yang sudah lewat tempo.",
    period: "Posisi hari ini",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
    exportKey: "aging_receivable",
  },
  {
    id: "pelanggan-ulang",
    group: "Pelanggan",
    name: "Pelanggan berulang",
    summary: "Pelanggan dengan pembelian lebih dari sekali, nilai belanja, dan jarak antar kunjungan.",
    period: "180 hari terakhir",
    href: "/app/customers",
    hrefLabel: "Buka Pelanggan",
  },
  {
    id: "pelanggan-ulasan",
    group: "Pelanggan",
    name: "Permintaan ulasan",
    summary: "Ulasan yang dikirim, dibuka, dan diklik, sebagai dasar review click rate.",
    period: "90 hari terakhir",
    href: "/app/customers",
    hrefLabel: "Buka Pelanggan",
  },
  {
    id: "operasional-shift",
    group: "Operasional",
    name: "Selisih kas per shift",
    summary: "Kas seharusnya, kas dihitung, selisih, dan alasan pada setiap shift yang ditutup.",
    period: "30 hari terakhir",
    href: "/app/shifts",
    hrefLabel: "Buka Shift",
  },
  {
    id: "operasional-tutup",
    group: "Operasional",
    name: "Tutup bulan",
    summary: "Checklist penutupan periode: shift, opname, beban, dan rekonsiliasi bank.",
    period: "Bulan berjalan",
    href: "/app/finance",
    hrefLabel: "Buka Keuangan",
  },
  {
    id: "pemulihan-rencana",
    group: "Pemulihan",
    name: "Rencana pemulihan kas",
    summary: "Tuas pemulihan yang aktif, target runway, dan dampak rupiah tiap tuas per bulan.",
    period: "13 minggu ke depan",
    href: "/app/recovery",
    hrefLabel: "Buka Cash Recovery",
  },
  {
    id: "pemulihan-reorder",
    group: "Pemulihan",
    name: "Rencana belanja stok",
    summary: "Open to buy, kandidat reorder yang terdanai, dan yang harus ditunda karena kas.",
    period: "14 hari ke depan",
    href: "/app/recovery",
    hrefLabel: "Buka Cash Recovery",
  },
  {
    id: "pemulihan-bebas-kas",
    group: "Pemulihan",
    name: "Pembebasan kas stok mati",
    summary: "Daftar markdown bertahap untuk mencairkan modal yang tertahan di stok lambat dan mati.",
    period: "Posisi hari ini",
    href: "/app/recovery",
    hrefLabel: "Buka Cash Recovery",
  },
];

const GROUP_ORDER: ReportGroup[] = [
  "Penjualan",
  "Laba",
  "Persediaan",
  "Kas & Keuangan",
  "Pembelian",
  "Pelanggan",
  "Operasional",
  "Pemulihan",
];

type MetricDefinition = { name: string; formula: string; note: string };

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: "Net sales",
    formula: "net_sales = sum(sale.grand_total) untuk status != void",
    note: "Setelah diskon dan retur, sebelum HPP. Dasar semua persentase margin.",
  },
  {
    name: "Gross profit",
    formula: "gross_profit = net_sales - cogs",
    note: "HPP memakai unit_cost pada baris penjualan, bukan harga beli produk saat ini.",
  },
  {
    name: "True Burn",
    formula: "true_burn_per_day = (gross_profit - opex - draws) / jumlah_hari",
    note: "Rata-rata bergulir 30 hari. Negatif berarti kas menyusut setiap hari.",
  },
  {
    name: "Runway",
    formula: "runway_days = cash_now / -true_burn_per_day",
    note: "Tak terbatas bila True Burn nol atau positif. Ambang: > 60 hari aman, 30 - 60 waspada, < 30 kritis.",
  },
  {
    name: "DIO",
    formula: "dio = avg_inventory / cogs * jumlah_hari",
    note: "Rata-rata persediaan awal dan akhir periode.",
  },
  {
    name: "Turnover",
    formula: "turnover = cogs / avg_inventory * (365 / jumlah_hari)",
    note: "Disetahunkan agar bisa dibandingkan antar periode.",
  },
  {
    name: "GMROI",
    formula: "gmroi = gross_profit / avg_inventory * (365 / jumlah_hari)",
    note: "Di bawah 1 berarti modal stok tidak menghasilkan laba kotor yang sepadan.",
  },
  {
    name: "Attach rate",
    formula: "attach_rate = transaksi_handset_dengan_aksesori / transaksi_handset * 100",
    note: "Dihitung per struk, bukan per unit aksesori.",
  },
  {
    name: "Review click rate",
    formula: "review_click_rate = ulasan_diklik / ulasan_terkirim * 100",
    note: "Hanya menghitung permintaan ulasan yang benar-benar terkirim.",
  },
];

/* ------------------------------------------------------------------ bantu */

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const body = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function salesDailyRows(ctx: Context): (string | number)[][] {
  const rows: (string | number)[][] = [["tanggal", "jumlah_struk", "penjualan_neto", "hpp", "laba_kotor"]];
  for (const day of ctx.daily.slice(-30)) {
    rows.push([
      day.date,
      day.salesCount,
      Math.round(day.sales),
      Math.round(day.cogs),
      Math.round(day.grossProfit),
    ]);
  }
  return rows;
}

function profitProductRows(ctx: Context): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["sku", "produk", "jenis", "unit_terjual", "omzet", "laba_kotor", "margin_persen"],
  ];
  const metrics = [...ctx.byProduct.values()]
    .filter((m) => m.soldUnits > 0)
    .sort((a, b) => b.grossProfit - a.grossProfit);
  for (const m of metrics) {
    rows.push([
      m.product.sku,
      m.product.name,
      m.product.kind,
      m.soldUnits,
      Math.round(m.revenue),
      Math.round(m.grossProfit),
      Number(m.marginPct.toFixed(2)),
    ]);
  }
  return rows;
}

function agingReceivableRows(data: Dataset): (string | number)[][] {
  const asOfMs = Date.parse(data.asOf);
  const day = 86_400_000;
  const rows: (string | number)[][] = [
    ["pelanggan", "telepon", "jatuh_tempo", "umur_hari", "status", "nilai_bon", "dibayar", "sisa"],
  ];
  const list = data.receivables
    .map((r) => {
      const customer = data.customers.find((c) => c.id === r.customerId) ?? null;
      const age = Math.max(0, Math.round((asOfMs - Date.parse(r.dueDate)) / day));
      return { receivable: r, customerName: customer?.name ?? "-", phone: customer?.phone ?? "-", age };
    })
    .sort((a, b) => b.age - a.age);
  for (const row of list) {
    rows.push([
      row.customerName,
      row.phone,
      row.receivable.dueDate.slice(0, 10),
      row.age,
      row.receivable.status,
      Math.round(row.receivable.amount),
      Math.round(row.receivable.paidAmount),
      Math.round(Math.max(0, row.receivable.amount - row.receivable.paidAmount)),
    ]);
  }
  return rows;
}

function exportRowsFor(key: ExportKey, data: Dataset, ctx: Context): (string | number)[][] {
  if (key === "sales_daily") return salesDailyRows(ctx);
  if (key === "profit_product") return profitProductRows(ctx);
  return agingReceivableRows(data);
}

function exportFileName(key: ExportKey, data: Dataset): string {
  const stamp = data.asOf.slice(0, 10);
  if (key === "sales_daily") return `frizzy-penjualan-harian-${stamp}.csv`;
  if (key === "profit_product") return `frizzy-laba-kotor-produk-${stamp}.csv`;
  return `frizzy-aging-piutang-${stamp}.csv`;
}

/* ------------------------------------------------- kartu akses terbatas */

function ReportsAccessCard() {
  return (
    <div className="mx-auto max-w-[640px] py-8">
      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="label-caps">Akses terbatas</div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Laporan finansial hanya untuk pemilik</h1>
          <p className="measure text-sm leading-relaxed text-text-muted">
            Katalog laporan memuat laba kotor, arus kas, utang, piutang, dan rencana pemulihan kas. Semua itu menyangkut
            posisi keuangan konter sehingga hanya dibuka untuk pemilik.
          </p>
          <p className="measure text-sm leading-relaxed text-text-muted">
            Sebagai staf, ringkasan yang boleh Anda lihat adalah performa shift sendiri: float awal, kas seharusnya, kas
            dihitung, dan selisih beserta alasannya.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/app/shifts"
              className="inline-flex h-10 items-center rounded-[10px] border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              Buka ringkasan shift saya
            </Link>
            <Link
              href="/app"
              className="inline-flex h-10 items-center rounded-[10px] border border-transparent px-4 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              Kembali ke dashboard
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function ReportsPage() {
  const hydrate = useFrizzy((s) => s.hydrate);
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const reset = useFrizzy((s) => s.reset);
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const role = useFrizzy((s) => s.role);
  const toast = useFrizzy((s) => s.toast);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: REPORTS.filter((r) => r.group === group),
    })).filter((entry) => entry.items.length > 0);
  }, []);

  const exportable = useMemo(() => REPORTS.filter((r) => r.exportKey !== undefined), []);

  if (role !== "owner") return <ReportsAccessCard />;

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-52" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (status === "error" || !data || !ctx) {
    return (
      <Alert
        tone="danger"
        title="Data laporan gagal dimuat"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              void hydrate();
            }}
          >
            Coba lagi
          </Button>
        }
      >
        {error ?? "Data contoh tidak bisa diambil dari server. Periksa koneksi lalu ulangi."}
      </Alert>
    );
  }

  const runExport = (entry: ReportEntry) => {
    if (!entry.exportKey) return;
    const rows = exportRowsFor(entry.exportKey, data, ctx);
    downloadCsv(exportFileName(entry.exportKey, data), rows);
    toast({
      title: "CSV dibuat",
      body: `${entry.name}: ${formatNumber(Math.max(0, rows.length - 1))} baris diunduh dari data klien.`,
      tone: "ok",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionTitle
        eyebrow="Analitik"
        title="Laporan"
        hint={`Katalog laporan konter. Tiga laporan bisa diekspor langsung sebagai CSV dari data di layar, sisanya dibuka di halaman terkait. Periode aktif 30 hari terakhir sampai ${formatDate(data.asOf)}.`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ctx.kpis.runwayState === "critical" ? "danger" : ctx.kpis.runwayState === "watch" ? "warn" : "ok"}>
              {`Runway ${Number.isFinite(ctx.kpis.runwayDays) ? `${Math.round(ctx.kpis.runwayDays)} hari` : "tak terbatas"}`}
            </Badge>
            <Badge tone="neutral">{`${formatNumber(REPORTS.length)} laporan`}</Badge>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Penjualan neto 30 hari" value={ctx.kpis.netSales} />
        <Kpi label="Laba kotor 30 hari" value={ctx.kpis.grossProfit} hint={`Margin ${ctx.kpis.grossMarginPct.toFixed(1)}%`} />
        <Kpi label="Kas saat ini" value={ctx.cashNow} hint={`Nilai stok ${formatCompact(ctx.inventoryValueNow)}`} />
      </div>

      <Card>
        <CardHeader
          title="Ekspor CSV yang bisa dihitung di klien"
          hint="Tiga laporan ini seluruhnya berasal dari data yang sudah ada di layar, jadi filenya dibuat tanpa memanggil server."
        />
        <CardBody className="flex flex-col gap-3">
          {exportable.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-text">{entry.name}</div>
                <div className="num text-[11.5px] text-text-faint">
                  {entry.exportKey === "sales_daily"
                    ? "kolom: tanggal, struk, penjualan neto, HPP, laba kotor"
                    : entry.exportKey === "profit_product"
                      ? "kolom: sku, produk, unit, omzet, laba kotor, margin"
                      : "kolom: pelanggan, jatuh tempo, umur, status, sisa"}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Ekspor CSV ${entry.name}`}
                onClick={() => runExport(entry)}
              >
                Ekspor CSV
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      {grouped.map((entry) => (
        <section key={entry.group} className="flex flex-col gap-3">
          <div className="label-caps">{entry.group}</div>
          <div className="grid gap-3 lg:grid-cols-2">
            {entry.items.map((report) => (
              <Card key={report.id}>
                <CardHeader title={report.name} hint={report.summary} />
                <CardBody className="flex flex-col gap-3">
                  <DataRow label="Periode default" value={report.period} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={report.href}
                      className="inline-flex h-8 items-center rounded-[10px] border border-border-strong bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:bg-surface-2"
                    >
                      {report.hrefLabel}
                    </Link>
                    {report.exportKey ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Ekspor CSV ${report.name}`}
                        onClick={() => runExport(report)}
                      >
                        Ekspor CSV
                      </Button>
                    ) : (
                      <span className="text-[11.5px] text-text-faint">Ekspor mengikuti halaman terkait</span>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Card>
        <CardHeader
          title="Cetak"
          hint="Layout cetak disiapkan untuk kertas A4 dengan margin 12 mm, semua warna token tetap terbaca di kertas putih."
        />
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => window.print()}>
            Cetak halaman ini
          </Button>
          <p className="measure text-[12.5px] leading-relaxed text-text-muted">
            Katalog laporan dan tabel ikut tercetak. Untuk cetak bersih, gunakan skala 100% tanpa header browser.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Definisi metrik"
          hint="Rumus ditulis apa adanya supaya angka di laporan bisa ditelusuri, bukan hanya dipercaya."
        />
        <CardBody className="flex flex-col gap-2">
          {METRIC_DEFINITIONS.map((metric) => (
            <details key={metric.name} className="rounded-[10px] border border-border px-4 py-3">
              <summary className="cursor-pointer text-[13.5px] font-medium text-text">{metric.name}</summary>
              <p className="num mt-2 overflow-x-auto rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] text-text">
                {metric.formula}
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-text-muted">{metric.note}</p>
            </details>
          ))}
        </CardBody>
      </Card>

    </div>
  );
}
