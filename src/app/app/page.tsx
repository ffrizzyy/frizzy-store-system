"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  WarningCircle,
  TrendDown,
  TrendUp,
  ClockCountdown,
  Package,
} from "@phosphor-icons/react/dist/ssr";
import { useFrizzy, useCtx, useUi } from "@/lib/store";
import {
  buildCashBridge,
  buildReorderPlan,
  detectLeaks,
  deadStockList,
  forecast13Weeks,
  lowStockList,
  recoveryScore,
  topMovers,
} from "@/lib/metrics";
import { formatCompact, formatDate, formatNumber, formatPct, formatRupiah, relativeDays } from "@/lib/money";
import { Kpi, MiniBar, Sparkline } from "@/components/ui/Kpi";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CashBridge } from "@/components/charts/CashBridge";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);
  const role = useFrizzy((s) => s.role);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "idle" || status === "loading") return <DashboardSkeleton />;
  if (status === "error") {
    return (
      <div className="mx-auto max-w-[720px] py-10">
        <Alert tone="danger" title="Data dashboard gagal dimuat">
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

  if (role === "staff") return <StaffDashboard />;
  return <OwnerDashboard />;
}

/* ------------------------------------------------------------- pemilik */

function OwnerDashboard() {
  const openAddStock = useUi((s) => s.openAddStock);
  const ctx = useCtx();
  const data = ctx.data;
  const k = ctx.kpis;
  const leaks = useMemo(() => detectLeaks(ctx), [ctx]);
  const bridge = useMemo(() => buildCashBridge(ctx, 30), [ctx]);
  const forecast = useMemo(() => forecast13Weeks(ctx), [ctx]);
  const movers = useMemo(() => topMovers(ctx, 6), [ctx]);
  const dead = useMemo(() => deadStockList(ctx, 6), [ctx]);
  const low = useMemo(() => lowStockList(ctx, 5), [ctx]);
  const score = useMemo(() => recoveryScore(ctx), [ctx]);
  const plan = useMemo(() => buildReorderPlan(ctx), [ctx]);
  const [range, setRange] = useState<30 | 60 | 90>(30);

  const window = ctx.daily.slice(-range);
  const prev = ctx.daily.slice(-range * 2, -range);
  const salesNow = window.reduce((s, d) => s + d.sales, 0);
  const salesPrev = prev.reduce((s, d) => s + d.sales, 0);
  const profitNow = window.reduce((s, d) => s + d.grossProfit, 0);
  const profitPrev = prev.reduce((s, d) => s + d.grossProfit, 0);
  const deltaOf = (now: number, before: number) => (before === 0 ? 0 : ((now - before) / Math.abs(before)) * 100);

  const cashSpark = ctx.daily.slice(-60).map((d) => d.cashEod);
  const burnSpark = ctx.daily.slice(-60).map((d) => -d.trueBurn);
  const salesSpark = ctx.daily.slice(-60).map((d) => d.sales);

  const critical = k.runwayState === "critical";

  return (
    <div className="mx-auto max-w-[1240px] space-y-6">
      <SectionTitle
        eyebrow={`Ringkasan ${range} hari`}
        title="Dashboard pemilik"
        hint={`Data sampai ${formatDate(data.asOf)} - ${formatNumber(data.sales.length)} transaksi tercatat, ${data.days} hari riwayat.`}
        right={
          <div className="flex items-center gap-2">
            {[30, 60, 90].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r as 30 | 60 | 90)}
                className={cn(
                  "num h-9 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors",
                  range === r ? "border-accent bg-accent-soft text-accent" : "border-border text-text-muted hover:bg-surface-2"
                )}
              >
                {r} hari
              </button>
            ))}
          </div>
        }
      />

      {/* ------------------------------------------------------- runway */}
      <Card className={cn(critical ? "border-danger/40" : "border-accent/30")}>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <div className="flex items-center gap-2">
              <Badge tone={critical ? "danger" : k.runwayState === "watch" ? "warn" : "ok"}>
                {critical ? "Kritis" : k.runwayState === "watch" ? "Waspada" : "Aman"}
              </Badge>
              <span className="text-[12px] text-text-muted">Runway kas pada True Burn saat ini</span>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className={cn("kpi-number text-[46px]", critical ? "text-danger" : "text-text")}>
                {Number.isFinite(k.runwayDays) ? Math.round(k.runwayDays) : "∞"}
              </span>
              <span className="text-[15px] text-text-muted">hari</span>
            </div>
            <p className="measure mt-2 text-[13px] leading-relaxed text-text-muted">
              Kas {formatRupiah(k.cashOnHand)} dibagi True Burn {formatRupiah(Math.abs(k.trueBurnPerDay))} per hari.{" "}
              {k.trueBurnPerDay < 0
                ? "Angka ini sudah memperhitungkan beban, prive, dan perubahan stok."
                : "Arus kas saat ini masih positif, jaga agar tidak berbalik arah."}
            </p>
            {k.trueBurnPerDay < k.trueBurnPrev ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-danger">
                <TrendDown size={14} weight="bold" /> True Burn memburuk dibanding periode sebelumnya (
                {formatCompact(Math.abs(k.trueBurnPrev))}/hari).
              </p>
            ) : null}
          </div>
          <div className="md:col-span-5">
            <div className="rounded-[10px] bg-surface-2 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="label-caps">Skor pemulihan</span>
                <span className="num text-[16px] font-semibold text-text">{score.score}/100</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    "h-2 rounded-full",
                    score.band === "kritis" ? "bg-danger" : score.band === "waspada" ? "bg-warning" : "bg-accent"
                  )}
                  style={{ width: `${score.score}%` }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {score.topActions.slice(0, 2).map((a) => (
                  <li key={a} className="text-[12px] leading-snug text-text-muted">
                    {a}
                  </li>
                ))}
              </ul>
              <Link
                href="/app/recovery"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
              >
                Buka Cash Recovery <ArrowRight size={13} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------- KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi
          label="Penjualan"
          value={salesNow}
          delta={{ value: deltaOf(salesNow, salesPrev) }}
          sub={`${range} hari - rata-rata ${formatCompact(k.avgDailySales)}/hari`}
          hint={<Sparkline values={salesSpark} height={28} />}
        />
        <Kpi
          label="Laba kotor"
          value={profitNow}
          delta={{ value: deltaOf(profitNow, profitPrev) }}
          sub={`Margin ${formatPct(k.grossMarginPct)}`}
          hint={<Sparkline values={ctx.daily.slice(-60).map((d) => d.grossProfit)} height={28} />}
        />
        <Kpi
          label="Kas di tangan"
          value={k.cashOnHand}
          tone={critical ? "danger" : "neutral"}
          sub={`Lantai aman ${formatCompact(data.profile.safetyCashFloor)}`}
          hint={<Sparkline values={cashSpark} height={28} tone={critical ? "danger" : "accent"} />}
        />
        <Kpi
          label="Nilai stok"
          value={k.inventoryValue}
          sub={`${formatCompact(k.deadStockValue)} di antaranya stok mati`}
          hint={<Sparkline values={ctx.daily.slice(-60).map((d) => d.inventoryValue)} height={28} tone="muted" />}
        />
        <Kpi
          label="True Burn / hari"
          value={Math.abs(k.trueBurnPerDay)}
          tone={k.trueBurnPerDay < 0 ? "danger" : "ok"}
          subject={k.trueBurnPerDay < 0 ? "keluar" : "masuk"}
          sub={`Sebelumnya ${formatCompact(Math.abs(k.trueBurnPrev))}`}
          hint={<Sparkline values={burnSpark} height={28} tone="danger" />}
        />
        <Kpi
          label="Utang jatuh tempo 7 hari"
          value={k.payablesDue7}
          tone={k.payablesDue7 > k.cashOnHand ? "danger" : "neutral"}
          sub={`Total utang ${formatCompact(k.payablesTotal)}`}
          hint={k.payablesDue7 > k.cashOnHand ? "Melebihi kas yang tersedia" : "Masih tertutup kas"}
        />
      </div>

      {/* -------------------------------------------------------- alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Jembatan stok ke kas"
            hint={`30 hari terakhir - kas awal, penerimaan, belanja stok, beban, dan prive.`}
          />
          <CardBody>
            <CashBridge steps={bridge} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Peringatan aktif"
            hint={`${leaks.length} temuan dari mesin aturan`}
            action={
              <Link href="/app/recovery?tab=leak-detector" className="text-[12.5px] font-medium text-accent hover:underline">
                Semua
              </Link>
            }
          />
          <div className="divide-y divide-border">
            {leaks.slice(0, 5).map((l) => (
              <Link key={l.id} href={l.href} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    l.severity === "high" ? "bg-danger-soft text-danger" : l.severity === "medium" ? "bg-warning-soft text-warning" : "bg-surface-2 text-text-muted"
                  )}
                >
                  <WarningCircle size={14} weight="fill" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-snug text-text">{l.rule}</span>
                  <span className="num block text-[12px] text-text-muted">{formatCompact(l.impactPerMonth)}/bulan</span>
                </span>
                <ArrowUpRight size={14} className="mt-1 shrink-0 text-text-faint" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------ prakiraan */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Prakiraan kas 13 minggu"
            hint="Tiga jalur prakiraan: dasar, konservatif (penjualan turun), dan pemulihan (aksi dijalankan)."
          />
          <CardBody>
            <ForecastTable weeks={forecast} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Briefing kas harian" hint="Ringkasan semalam dan tiga aksi" />
          <CardBody className="space-y-3">
            <ul className="space-y-2.5">
              {[
                `Kas hari ini ${formatRupiah(k.cashOnHand)}, runway ${
                  Number.isFinite(k.runwayDays) ? `${Math.round(k.runwayDays)} hari` : "positif"
                }.`,
                `Penjualan 30 hari ${formatCompact(k.netSales)} dengan laba kotor ${formatCompact(k.grossProfit)} (${formatPct(
                  k.grossMarginPct
                )}).`,
                `Beban ${formatCompact(k.opex)} dan prive ${formatCompact(k.draws)} - prive ${
                  k.draws > data.profile.ownerDrawMonthlyCap ? "di atas batas" : "dalam batas"
                }.`,
                `Stok mati ${formatCompact(k.deadStockValue)}; belanja stok ${(k.replenishmentRatio * 100).toFixed(0)}% dari HPP.`,
              ].map((line) => (
                <li key={line} className="flex gap-2 text-[13px] leading-relaxed text-text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="hairline pt-3">
              <p className="label-caps mb-2">Tiga aksi hari ini</p>
              <ol className="space-y-2">
                {score.topActions.map((a, i) => (
                  <li key={a} className="flex gap-2.5 text-[13px] leading-snug text-text">
                    <span className="num text-accent">{i + 1}.</span>
                    <span className="text-text-muted">{a}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-[11.5px] leading-snug text-text-faint">
              Angka dihitung mesin aturan, bukan diarang model bahasa. AI hanya menarasikan.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------ movers & dead stock */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Penyumbang laba teratas"
            hint="Diurutkan dari laba kotor selama periode yang tercatat"
            action={
              <Link href="/app/products" className="text-[12.5px] font-medium text-accent hover:underline">
                Produk
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Produk penyumbang laba terbesar</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-text-faint">
                  <th className="px-5 py-2.5 font-medium">Produk</th>
                  <th className="px-3 py-2.5 text-right font-medium">Terjual</th>
                  <th className="px-3 py-2.5 text-right font-medium">Laba</th>
                  <th className="px-5 py-2.5 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((m) => (
                  <tr key={m.product.id} className="border-b border-border last:border-0">
                    <td className="max-w-[220px] px-5 py-2.5">
                      <span className="block truncate text-text">{m.product.name}</span>
                      <span className="num text-[11.5px] text-text-faint">{m.product.sku}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-text-muted">{m.soldUnits}</td>
                    <td className="num px-3 py-2.5 text-right text-text">{formatCompact(m.grossProfit)}</td>
                    <td className="num px-5 py-2.5 text-right text-accent">{formatPct(m.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Stok mati menahan kas"
            hint="Tanpa penjualan 60 hari atau lebih"
            action={
              <Link href="/app/recovery?tab=bebas-kas" className="text-[12.5px] font-medium text-accent hover:underline">
                Bebaskan
              </Link>
            }
          />
          {dead.length === 0 ? (
            <EmptyState
              icon={<Package size={26} />}
              title="Tidak ada stok mati"
              body="Semua barang masih berputar. Jaga kedalaman stok agar tidak menumpuk."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <caption className="sr-only">Stok mati dengan nilai tertahan terbesar</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-text-faint">
                    <th className="px-5 py-2.5 font-medium">Produk</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sisa</th>
                    <th className="px-3 py-2.5 text-right font-medium">Terakhir laku</th>
                    <th className="px-5 py-2.5 text-right font-medium">Tertahan</th>
                  </tr>
                </thead>
                <tbody>
                  {dead.map((m) => (
                    <tr key={m.product.id} className="border-b border-border last:border-0">
                      <td className="max-w-[220px] px-5 py-2.5">
                        <span className="block truncate text-text">{m.product.name}</span>
                        <span className="num text-[11.5px] text-text-faint">
                          {m.health === "obsolete" ? "Usang" : m.health === "dead" ? "Mati" : "Lambat"}
                        </span>
                      </td>
                      <td className="num px-3 py-2.5 text-right text-text-muted">{m.qty}</td>
                      <td className="num px-3 py-2.5 text-right text-text-muted">
                        {m.lastSoldAt ? relativeDays(m.lastSoldAt, data.asOf) : "belum pernah"}
                      </td>
                      <td className="num px-5 py-2.5 text-right font-medium text-danger">{formatCompact(m.trappedCash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* --------------------------------------------------------- bawah */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Stok menipis"
            hint="Di bawah titik pesan ulang"
            action={
              <Button variant="secondary" size="sm" icon={<Icon name="Plus" size={14} weight="bold" />} onClick={openAddStock} data-testid="dashboard-add-stock">
                Tambah stok
              </Button>
            }
          />
          {low.length === 0 ? (
            <EmptyState icon={<Package size={24} />} title="Stok aman" body="Tidak ada produk di bawah titik pesan ulang." />
          ) : (
            <ul className="divide-y divide-border">
              {low.map((m) => (
                <li key={m.product.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">{m.product.name}</span>
                  <span className="num text-[12px] text-warning">sisa {m.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Anggaran belanja yang aman"
            hint="Berdasarkan kas dikurangi lantai aman dan utang jatuh tempo"
            action={
              <Link href="/app/recovery?tab=reorder" className="text-[12.5px] font-medium text-accent hover:underline">
                Rencana
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-text-muted">Open-to-buy</span>
              <span className="num text-[20px] font-semibold text-text">{formatRupiah(plan.openToBuy)}</span>
            </div>
            <div className="space-y-1.5 text-[12.5px] text-text-muted">
              <Row label="Kas tersedia" value={formatRupiah(plan.cashOnHand)} />
              <Row label="Lantai kas aman" value={`- ${formatRupiah(plan.safetyFloor)}`} />
              <Row label="Utang jatuh tempo 14 hari" value={`- ${formatRupiah(plan.payablesDue)}`} />
              <Row label={`Alokasi ${plan.allocationPct}%`} value={formatRupiah(plan.openToBuy)} strong />
            </div>
            <p className="text-[12px] leading-snug text-text-faint">
              {plan.funded.length} baris terdanai, {plan.deferred.length} ditunda. Estimasi modal kembali{" "}
              {plan.expectedPaybackDays} hari.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Kesehatan operasional" hint="Metrik yang dilihat pemilik tiap minggu" />
          <CardBody className="space-y-2.5">
            {[
              { l: "Rasio belanja stok", v: `${(k.replenishmentRatio * 100).toFixed(0)}%`, target: "target >= 100%", ok: k.replenishmentRatio >= 1 },
              { l: "Attach rate aksesori", v: formatPct(k.attachRatePct), target: "target 55%", ok: k.attachRatePct >= 55 },
              { l: "Kebocoran diskon", v: formatPct(k.discountLeakagePct), target: "maksimum 4%", ok: k.discountLeakagePct <= 4 },
              { l: "DIO", v: `${k.dio.toFixed(1)} hari`, target: "makin kecil makin baik", ok: k.dio <= 30 },
              { l: "GMROI", v: k.gmroi.toFixed(2), target: "target > 3", ok: k.gmroi >= 3 },
              { l: "Selisih opname", v: formatPct(k.shrinkagePct, 2), target: "maksimum 1%", ok: k.shrinkagePct <= 1 },
              { l: "Klik ulasan", v: formatPct(k.reviewClickRatePct), target: `${k.reviewClicks}/${k.reviewRequestsSent} terkirim`, ok: k.reviewClickRatePct >= 30 },
              { l: "Selisih kas shift", v: formatRupiah(k.shiftVarianceTotal), target: "target 0", ok: Math.abs(k.shiftVarianceTotal) < 50_000 },
            ].map((row) => (
              <div key={row.l} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] text-text">{row.l}</div>
                  <div className="text-[11.5px] text-text-faint">{row.target}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="num text-[13px] text-text">{row.v}</span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                      row.ok ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning"
                    )}
                    aria-label={row.ok ? "Sesuai target" : "Perlu perhatian"}
                  >
                    {row.ok ? "✓" : "!"}
                  </span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {critical ? (
        <Alert
          tone="danger"
          title="Kas di bawah ambang aman"
          action={
            <Link href="/app/recovery">
              <Button variant="danger" size="sm">
                Jalankan rencana
              </Button>
            </Link>
          }
        >
          Runway {Math.round(k.runwayDays)} hari. Pemulihan butuh tiga hal bersamaan: prive turun, stok mati cair, dan belanja stok
          kembali ke 100% HPP.
        </Alert>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className={cn("num", strong ? "font-semibold text-text" : "text-text-muted")}>{value}</span>
    </div>
  );
}

function ForecastTable({ weeks }: { weeks: ReturnType<typeof forecast13Weeks> }) {
  const max = Math.max(...weeks.map((w) => Math.max(Math.abs(w.base), Math.abs(w.conservative), Math.abs(w.recovery))), 1);
  return (
    <div className="space-y-3">
      <div className="scroll-x">
        <table className="w-full min-w-[520px] text-[12.5px]">
          <caption className="sr-only">Prakiraan kas 13 minggu untuk tiga jalur prakiraan</caption>
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-faint">
              <th className="py-2 pr-3 font-medium">Minggu</th>
              <th className="px-3 py-2 text-right font-medium">Dasar</th>
              <th className="px-3 py-2 text-right font-medium">Konservatif</th>
              <th className="pl-3 py-2 text-right font-medium">Pemulihan</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week} className="border-b border-border last:border-0">
                <td className="num py-2 pr-3 text-text-muted">{w.label}</td>
                <td className={cn("num px-3 py-2 text-right", w.base < 0 ? "text-danger" : "text-text")}>
                  {formatCompact(w.base)}
                </td>
                <td className={cn("num px-3 py-2 text-right", w.conservative < 0 ? "text-danger" : "text-text-muted")}>
                  {formatCompact(w.conservative)}
                </td>
                <td className={cn("num pl-3 py-2 text-right", w.recovery < 0 ? "text-danger" : "text-accent")}>
                  {formatCompact(w.recovery)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hairline pt-3">
        <div className="flex items-center gap-3">
          <span className="label-caps">Selisih dasar vs pemulihan</span>
          <MiniBar value={Math.abs((weeks[12]?.recovery ?? 0) - (weeks[12]?.base ?? 0))} max={max} width={120} />
          <span className="num text-[12px] text-text-muted">
            {formatCompact((weeks[12]?.recovery ?? 0) - (weeks[12]?.base ?? 0))} pada minggu 13
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- staf */

function StaffDashboard() {
  const ctx = useCtx();
  const data = ctx.data;
  const user = data.users.find((u) => u.role === "staff") ?? null;
  const shift = data.shifts[data.shifts.length - 1] ?? null;
  const mySales = data.sales.filter((s) => s.userId === user?.id && s.status !== "void");
  const today = data.asOf.slice(0, 10);
  const todaySales = mySales.filter((s) => s.createdAt.slice(0, 10) === today);
  const low = lowStockList(ctx, 6);
  const tasks = data.recoveryTasks.filter((t) => t.status === "open").slice(0, 4);

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <SectionTitle eyebrow="Tampilan staf" title={`Halo, ${user?.name.split(" ")[0] ?? "kasir"}`} hint="Shift berjalan dan tugas yang ditugaskan untuk Anda." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Transaksi hari ini" value={todaySales.length} format="number" sub="Struk yang Anda buat" />
        <Kpi label="Kas seharusnya" value={shift?.expectedCash ?? 0} sub={`Float awal ${formatCompact(shift?.openingFloat ?? 0)}`} />
        <Kpi
          label="Status shift"
          value={shift?.closedAt === null ? "Berjalan" : "Tertutup"}
          format="text"
          tone={shift?.closedAt === null ? "ok" : "neutral"}
          sub={shift ? `Dibuka ${relativeDays(shift.openedAt, data.asOf)}` : "Belum ada shift"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/app/pos" className="card flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-surface-2">
          <Icon name="Storefront" size={22} className="text-accent" />
          <span className="text-[15px] font-semibold text-text">Transaksi baru</span>
          <span className="text-[13px] text-text-muted">Buka POS dan mulai jualan.</span>
        </Link>
        <Link href="/app/inventory" className="card flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-surface-2">
          <Icon name="Package" size={22} className="text-accent" />
          <span className="text-[15px] font-semibold text-text">Cek stok</span>
          <span className="text-[13px] text-text-muted">Cari IMEI atau hitung stok.</span>
        </Link>
        <Link href="/app/shifts" className="card flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-surface-2">
          <Icon name="ClockCountdown" size={22} className="text-accent" />
          <span className="text-[15px] font-semibold text-text">Tutup shift</span>
          <span className="text-[13px] text-text-muted">Hitung uang laci dan catat selisih.</span>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Stok menipis" hint="Laporkan ke pemilik sebelum habis" />
          <ul className="divide-y divide-border">
            {low.map((m) => (
              <li key={m.product.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{m.product.name}</span>
                <span className="num text-[12px] text-warning">sisa {m.qty}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Tugas Anda" hint="Dari rencana pemulihan" />
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <ClockCountdown size={14} className="text-text-faint" />
                  <span className="text-[13px] font-medium text-text">{t.title}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-text-muted">{t.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Alert tone="info" title="Harga pokok dan laba tidak ditampilkan di peran staf">
        Pembatasan dilakukan di server, bukan hanya disembunyikan di tampilan. Anda tetap melihat harga jual, stok, dan
        indikator batas margin.
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Link href="/app/pos">
          <Button variant="primary" size="lg" icon={<Icon name="Storefront" size={18} />}>
            Mulai transaksi
          </Button>
        </Link>
        {Math.abs(ctx.kpis.shiftVarianceTotal) > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-warning">
            <WarningCircle size={15} weight="fill" /> Ada selisih kas tercatat periode ini
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-accent">
            <TrendUp size={15} weight="bold" /> Kas shift tercatat rapi
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- skeleton */

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1240px] space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
