"use client";

/* ============================================================================
   Cash Recovery Engine - inti produk Frizzy.

   Halaman ini tidak menghitung apa pun sendiri. Semua angka datang dari
   src/lib/metrics.ts (recoveryScore, detectLeaks, buildFreeCashPlan,
   buildReorderPlan, simulate). Peran halaman ini hanya menyusun bukti,
   ambang, dan aksi menjadi satu alur kerja 90 hari yang bisa dikerjakan.
   ========================================================================= */

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  buildFreeCashPlan,
  buildReorderPlan,
  detectLeaks,
  recoveryScore,
  simulate,
  type Context,
  type FreeCashItem,
  type LeakFinding,
  type ReorderCandidate,
  type RecoveryScore,
  type WhatIfLevers,
} from "@/lib/metrics";
import { PHASE_LABEL, PHASE_WINDOW } from "@/lib/constants";
import {
  clamp,
  daysBetween,
  formatCompact,
  formatDate,
  formatNumber,
  formatPct,
  formatRupiah,
  relativeDays,
} from "@/lib/money";
import { useCtx, useData, useFrizzy, type Mutation, type Toast } from "@/lib/store";
import type { Dataset, ID, RecoveryTask, TaskPhase } from "@/lib/types";
import { Alert, Badge, EmptyState, Skeleton, type Tone } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Select, Slider } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Overlay";
import { DataRow, Gauge, Kpi } from "@/components/ui/Kpi";
import { LineWithBand } from "@/components/charts/CashBridge";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ tab */
/* Nilai id tab mengikuti query param ?tab= yang sudah dipakai di kode lain. */

const TAB_IDS = ["ringkasan", "leak-detector", "bebas-kas", "reorder", "what-if", "playbook"] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(value: string | null): value is TabId {
  return value !== null && (TAB_IDS as readonly string[]).includes(value);
}

type ToastInput = Omit<Toast, "id">;

/* ------------------------------------------------------------------ util */

const HEALTH_LABEL: Record<FreeCashItem["health"], string> = {
  healthy: "Sehat",
  slow: "Lambat",
  dead: "Mati",
  obsolete: "Usang",
};

const HEALTH_TONE: Record<FreeCashItem["health"], Tone> = {
  healthy: "ok",
  slow: "info",
  dead: "warn",
  obsolete: "danger",
};

const SOURCE_LABEL: Record<RecoveryTask["source"], string> = {
  engine: "Engine",
  ai: "AI",
  manual: "Manual",
};

const SOURCE_TONE: Record<RecoveryTask["source"], Tone> = {
  engine: "info",
  ai: "ok",
  manual: "neutral",
};

function runwayText(days: number): string {
  return Number.isFinite(days) ? `${formatNumber(Math.round(days), 0)} hari` : "∞ (arus positif)";
}

function bandTone(band: RecoveryScore["band"]): Tone {
  return band === "kritis" ? "danger" : band === "waspada" ? "warn" : "ok";
}

/** Nilai KPI tugas bisa berupa rupiah, persen, rasio, atau jumlah unit. */
function formatKpiValue(value: number): string {
  if (Math.abs(value) >= 100_000) return formatRupiah(value);
  if (!Number.isInteger(value)) return formatNumber(value, 2);
  return formatNumber(value, 0);
}

function ProgressBar({
  value,
  max,
  label,
  tone = "accent",
}: {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "warning" | "danger";
}) {
  const pct = max <= 0 ? (value <= 0 ? 100 : 0) : clamp((value / max) * 100, 0, 100);
  const bar = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------ halaman */

export default function RecoveryPage() {
  return (
    <Suspense fallback={<RecoverySkeleton />}>
      <RecoveryScreen />
    </Suspense>
  );
}

function RecoveryScreen() {
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[560px] py-16">
        <Alert
          tone="danger"
          title="Data pemulihan gagal dimuat"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                reset();
                void hydrate();
              }}
            >
              Coba lagi
            </Button>
          }
        >
          {error ?? "Terjadi kesalahan saat mengambil data kas."} Mesin pemulihan butuh data penjualan, stok, dan kas untuk
          menghitung True Burn.
        </Alert>
      </div>
    );
  }

  if (status !== "ready") return <RecoverySkeleton />;

  return <RecoveryEngine />;
}

function RecoverySkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-5" aria-busy="true">
      <p className="sr-only" role="status">
        Memuat mesin pemulihan kas...
      </p>
      <div className="card space-y-3 px-5 py-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3 w-full max-w-[52ch]" />
        <div className="grid gap-4 pt-2 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-[640px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function RecoveryEngine() {
  const data = useData();
  const ctx = useCtx();
  const role = useFrizzy((s) => s.role);
  const userId = useFrizzy((s) => s.userId);
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);
  const searchParams = useSearchParams();

  const paramTab = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(isTabId(paramTab) ? paramTab : "ringkasan");

  useEffect(() => {
    const next = searchParams.get("tab");
    if (isTabId(next)) setTab(next);
  }, [searchParams]);

  const leaks = useMemo(() => detectLeaks(ctx), [ctx]);
  const score = useMemo(() => recoveryScore(ctx), [ctx]);

  const isOwner = role === "owner";
  const actorId: ID =
    userId ?? data.users.find((u) => u.role === "owner")?.id ?? data.users[0]?.id ?? "usr_unknown";

  const k = ctx.kpis;

  const tabs: { id: TabId; label: string; badge?: ReactNode }[] = [
    { id: "ringkasan", label: "Ringkasan" },
    { id: "leak-detector", label: "Leak Detector", badge: leaks.length },
    { id: "bebas-kas", label: "Bebas Kas" },
    { id: "reorder", label: "Reorder" },
    { id: "what-if", label: "What-If" },
    { id: "playbook", label: "Playbook", badge: data.recoveryTasks.filter((t) => t.status === "open").length },
  ];

  function renderTab(): ReactNode {
    if (!isOwner) return <PlaybookTab data={data} mutate={mutate} />;
    switch (tab) {
      case "leak-detector":
        return <LeakTab ctx={ctx} leaks={leaks} />;
      case "bebas-kas":
        return <FreeCashTab ctx={ctx} actorId={actorId} mutate={mutate} toast={toast} />;
      case "reorder":
        return <ReorderTab ctx={ctx} data={data} actorId={actorId} mutate={mutate} toast={toast} />;
      case "what-if":
        return <WhatIfTab ctx={ctx} />;
      case "playbook":
        return <PlaybookTab data={data} mutate={mutate} />;
      default:
        return <RingkasanTab ctx={ctx} score={score} leaks={leaks} />;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-5">
      <header>
        <div className="label-caps mb-1.5">Pemulihan kas</div>
        <h1 className="text-2xl font-semibold tracking-tight text-text md:text-[30px]">Cash Recovery Engine</h1>
        <p className="mt-1.5 text-[14px] text-text-muted">Diagnosis, akar masalah, dan rencana 90 hari.</p>
      </header>

      {isOwner ? (
        <Card>
          <CardBody className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <Gauge value={score.score} label="dari 100" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={bandTone(score.band)}>Skor pemulihan {score.band}</Badge>
                  <span className="num text-[11.5px] text-text-faint">diperbarui {formatDate(data.asOf)}</span>
                </div>
                <p className="measure mt-2 text-[13px] leading-relaxed text-text-muted">
                  {score.band === "kritis"
                    ? "Kas berjalan kehabisan waktu. Kerjakan tahap Stabilkan lebih dulu, lalu bebaskan kas dari stok mati."
                    : score.band === "waspada"
                      ? "Ada kebocoran yang menahan kas. Perbaiki dua komponen terendah minggu ini."
                      : "Struktur kas sehat. Jaga disiplin belanja stok dan prive pemilik."}
                </p>
              </div>
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-x-5 gap-y-3 border-t border-border pt-4 md:grid-cols-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <div>
                <dt className="label-caps">True Burn</dt>
                <dd className="num mt-1 text-[17px] font-semibold text-text">
                  {formatCompact(Math.abs(k.trueBurnPerDay))}
                  <span className="text-[12px] text-text-faint">/hari</span>
                </dd>
              </div>
              <div>
                <dt className="label-caps">Runway</dt>
                <dd className="num mt-1 text-[17px] font-semibold text-text">{runwayText(k.runwayDays)}</dd>
              </div>
              <div>
                <dt className="label-caps">Kas di tangan</dt>
                <dd className="num mt-1 text-[17px] font-semibold text-text">{formatCompact(k.cashOnHand)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="info" title="Peran staf hanya melihat tugas yang ditugaskan">
          Angka laba, kas, dan prive pemilik disembunyikan pada peran staf. Halaman ini hanya menampilkan daftar tugas
          pemulihan yang bisa dikerjakan di konter.
        </Alert>
      )}

      {isOwner ? (
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(id) => {
            if (isTabId(id)) setTab(id);
          }}
        />
      ) : null}

      <div role="tabpanel" aria-label={isOwner ? tab : "playbook"}>
        {renderTab()}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- 1. ringkasan */

type StageMetric = { label: string; value: string; hint?: string };
type Stage = {
  n: string;
  title: string;
  window: string;
  status: string;
  tone: Tone;
  body: string;
  metrics: StageMetric[];
  href: string;
  hrefLabel: string;
};

function RingkasanTab({ ctx, score, leaks }: { ctx: Context; score: RecoveryScore; leaks: LeakFinding[] }) {
  const k = ctx.kpis;
  const freeCash = useMemo(() => buildFreeCashPlan(ctx, 12), [ctx]);
  const plan = useMemo(() => buildReorderPlan(ctx), [ctx]);

  const leakImpact = leaks.reduce((s, l) => s + l.impactPerMonth, 0);
  const severe = leaks.filter((l) => l.severity === "high").length;
  const top = leaks[0] ?? null;
  const cashPotential = freeCash.reduce((s, f) => s + f.expectedCash, 0);
  const sacrificed = freeCash.reduce((s, f) => s + f.marginSacrificed, 0);
  const deadCount = [...ctx.byProduct.values()].filter((m) => m.health === "dead" || m.health === "obsolete").length;

  const stages: Stage[] = [
    {
      n: "1",
      title: "Diagnose",
      window: "Hari ini",
      status: k.runwayState === "critical" ? "Kas kritis" : k.runwayState === "watch" ? "Perlu diawasi" : "Terkendali",
      tone: k.runwayState === "critical" ? "danger" : k.runwayState === "watch" ? "warn" : "ok",
      body: "Ukur defisit tersembunyi dan sisa waktu sebelum kas habis. Tanpa angka ini, semua keputusan belanja jadi tebakan.",
      metrics: [
        {
          label: "True Burn",
          value: `${formatCompact(Math.abs(k.trueBurnPerDay))}/hari`,
          hint:
            k.trueBurnPerDay < 0
              ? `Bulan sebelumnya ${formatCompact(Math.abs(k.trueBurnPrev))}/hari`
              : "Arus kas bersih sudah positif",
        },
        { label: "Runway", value: runwayText(k.runwayDays), hint: `Kas ${formatRupiah(k.cashOnHand)} dibagi laju bakar` },
        {
          label: "Titik impas",
          value: `${formatCompact(k.breakEvenSalesPerDay)}/hari`,
          hint: `Penjualan harian sekarang ${formatCompact(k.avgDailySales)}`,
        },
      ],
      href: "/app/finance?tab=kas",
      hrefLabel: "Buka arus kas",
    },
    {
      n: "2",
      title: "Stop the leak",
      window: "Minggu 1",
      status: leaks.length === 0 ? "Tidak ada temuan" : `${leaks.length} temuan aktif`,
      tone: severe >= 2 ? "danger" : leaks.length > 0 ? "warn" : "ok",
      body: "Tutup kebocoran yang paling mahal lebih dulu. Satu aturan yang ditutup memberi ruang untuk tahap berikutnya.",
      metrics: [
        { label: "Temuan aktif", value: `${formatNumber(leaks.length, 0)} aturan`, hint: `${formatNumber(severe, 0)} tergolong berat` },
        { label: "Dampak / bulan", value: formatRupiah(leakImpact), hint: "Total seluruh temuan yang terdeteksi" },
        {
          label: "Temuan terbesar",
          value: top ? top.rule : "Tidak ada",
          hint: top ? `${formatCompact(top.impactPerMonth)}/bulan` : "Semua ambang terpenuhi",
        },
      ],
      href: "/app/recovery?tab=leak-detector",
      hrefLabel: "Buka Leak Detector",
    },
    {
      n: "3",
      title: "Free trapped cash",
      window: "Minggu 2 - 4",
      status: `${formatCompact(k.deadStockValue)} tertahan`,
      tone: k.deadStockValue > 15_000_000 ? "danger" : k.deadStockValue > 0 ? "warn" : "ok",
      body: "Ubah barang yang tidak bergerak menjadi kas, dengan markdown bertahap yang tidak menjual di bawah harga pokok.",
      metrics: [
        { label: "Nilai stok mati", value: formatCompact(k.deadStockValue), hint: `${formatNumber(deadCount, 0)} SKU tanpa penjualan 60 hari+` },
        { label: "Potensi kas", value: formatCompact(cashPotential), hint: "Bila markdown diterapkan pada 12 item teratas" },
        { label: "Margin dikorbankan", value: formatCompact(sacrificed), hint: "Selisih harga lama ke harga saran" },
      ],
      href: "/app/recovery?tab=bebas-kas",
      hrefLabel: "Buka Bebas Kas",
    },
    {
      n: "4",
      title: "Protect margin",
      window: "Bulan 2",
      status: k.grossMarginPct < 5 ? "Margin tipis" : "Margin terjaga",
      tone: k.grossMarginPct < 5 ? "danger" : k.grossMarginPct < 8 ? "warn" : "ok",
      body: "Perbaiki bauran: aksesori, jasa, dan tukar tambah jauh lebih tebal daripada handset yang diperang harga.",
      metrics: [
        { label: "Margin kotor", value: formatPct(k.grossMarginPct), hint: `Laba kotor 30 hari ${formatCompact(k.grossProfit)}` },
        { label: "Attach rate", value: formatPct(k.attachRatePct), hint: "Aksesori per penjualan handset" },
        {
          label: "Kebocoran diskon",
          value: formatPct(k.discountLeakagePct),
          hint: `Total diskon ${formatCompact(k.discountTotal)}`,
        },
      ],
      href: "/app/reports?report=margin",
      hrefLabel: "Buka laporan margin",
    },
    {
      n: "5",
      title: "Rebuild",
      window: "Bulan 3",
      status: k.replenishmentRatio < 1 ? "Belanja stok terlalu kecil" : "Belanja stok sehat",
      tone: k.replenishmentRatio < 0.9 ? "danger" : k.replenishmentRatio < 1 ? "warn" : "ok",
      body: "Kembalikan stok sebagai mesin penjualan: belanja mengikuti GMROI dan anggaran open-to-buy, bukan barang yang kebetulan habis.",
      metrics: [
        {
          label: "Rasio replenishment",
          value: formatPct(k.replenishmentRatio * 100, 0),
          hint: "Belanja stok dibanding HPP 30 hari",
        },
        { label: "Open-to-buy", value: formatRupiah(plan.openToBuy), hint: `${plan.allocationPct}% kas bebas setelah lantai aman` },
        { label: "GMROI", value: formatNumber(k.gmroi, 2), hint: `DIO ${formatNumber(k.dio, 0)} hari` },
      ],
      href: "/app/recovery?tab=reorder",
      hrefLabel: "Buka Reorder Planner",
    },
  ];

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Loop 90 hari"
        title="Lima tahap, satu urutan"
        hint="Status tiap tahap dihitung dari data hari ini, bukan ditulis manual. Klik tahap untuk membuka alatnya."
      />

      <ol className="space-y-3">
        {stages.map((s) => (
          <li key={s.n}>
            <div className="card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="num mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[12px] text-text-muted">
                    {s.n}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold tracking-tight text-text">{s.title}</h3>
                    <p className="measure mt-0.5 text-[12.5px] leading-snug text-text-muted">{s.body}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.tone}>{s.status}</Badge>
                  <span className="num text-[11px] text-text-faint">{s.window}</span>
                </div>
              </div>

              <dl className="mt-3.5 grid gap-3 border-t border-border pt-3.5 sm:grid-cols-3">
                {s.metrics.map((m) => (
                  <div key={m.label} className="min-w-0">
                    <dt className="label-caps">{m.label}</dt>
                    <dd className="num mt-1 truncate text-[16px] font-semibold text-text" title={m.value}>
                      {m.value}
                    </dd>
                    {m.hint ? <p className="mt-0.5 text-[11.5px] leading-snug text-text-faint">{m.hint}</p> : null}
                  </div>
                ))}
              </dl>

              <div className="mt-3">
                <Link
                  href={s.href}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
                >
                  {s.hrefLabel}
                  <Icon name="ArrowRight" size={14} weight="bold" />
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader
          title="Skor pemulihan"
          hint="Skor berbobot dari lima komponen. Setiap komponen bisa ditelusuri, tidak ada kotak hitam."
          action={<Badge tone={bandTone(score.band)}>{score.band}</Badge>}
        />
        <CardBody className="space-y-4">
          <ul className="divide-y divide-border">
            {score.components.map((c) => (
              <li key={c.key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-text">{c.label}</span>
                  <span className="num text-[13px] text-text">
                    {formatNumber(c.value, 0)}/100
                    <span className="text-text-faint"> x bobot {formatPct(c.weight * 100, 0)}</span>
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={c.value}
                    max={100}
                    label={`${c.label}: ${c.value} dari 100`}
                    tone={c.value < 40 ? "danger" : c.value < 70 ? "warning" : "accent"}
                  />
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-text-faint">{c.detail}</p>
              </li>
            ))}
          </ul>
          <div className="hairline pt-3">
            <DataRow
              strong
              label="Skor akhir"
              value={`${score.score}/100 - ${score.band}`}
              hint="Jumlah dari nilai komponen dikali bobotnya"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="3 aksi teratas"
          hint="Diambil dari tiga komponen dengan nilai terendah, diurutkan dari yang paling menghambat."
        />
        <CardBody>
          {score.topActions.length === 0 ? (
            <EmptyState title="Tidak ada aksi mendesak" body="Semua komponen skor berada di atas ambang nyaman." />
          ) : (
            <ol className="space-y-3">
              {score.topActions.map((action, i) => (
                <li key={`${i}-${action}`} className="flex items-start gap-3">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-medium text-accent">
                    {i + 1}
                  </span>
                  <p className="text-[13px] leading-relaxed text-text-muted">{action}</p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- 2. leak detector */

type MonitoredRule = {
  id: string | null;
  name: string;
  trigger: string;
  action: string;
};

const MONITORED_RULES: MonitoredRule[] = [
  {
    id: "below_cost",
    name: "Jual di bawah harga pokok",
    trigger: "Baris transaksi dengan lineTotal < unitCost x qty, 30 hari terakhir",
    action: "Margin guard: tolak harga di bawah batas tanpa PIN pemilik",
  },
  {
    id: "margin_erosion",
    name: "Erosi margin handset",
    trigger: "Margin handset di bawah 7,5% dari penjualan handset",
    action: "Tinjau harga jual handset dan batasi nego",
  },
  {
    id: "discount",
    name: "Kebocoran diskon",
    trigger: "Diskon di atas 4% dari penjualan kotor 30 hari",
    action: "Wajibkan alasan diskon, kunci batas staf pada 5%",
  },
  {
    id: "owner_draw",
    name: "Prive pemilik berlebih",
    trigger: "Prive 30 hari melebihi batas bulanan di profil toko",
    action: "Ganti prive harian dengan jumlah tetap bulanan",
  },
  {
    id: "replenishment",
    name: "Rasio replenishment di bawah 1",
    trigger: "Belanja stok kurang dari HPP periode yang sama",
    action: "Naikkan belanja stok setelah beban non-stok dipangkas",
  },
  {
    id: "shrinkage",
    name: "Selisih opname",
    trigger: "Selisih fisik di atas 1% nilai persediaan",
    action: "Blind count dan telusuri unit hilang per IMEI",
  },
  {
    id: "voucher_float",
    name: "Float pulsa menahan modal",
    trigger: "Modal voucher di atas Rp 2 juta dengan margin di bawah 3,5%",
    action: "Turunkan nominal stok pulsa, top up lebih sering dengan jumlah kecil",
  },
  {
    id: "receivables",
    name: "Utang pelanggan lewat jatuh tempo",
    trigger: "Bon pelanggan melewati due date dan belum lunas",
    action: "Kirim pengingat terjadwal, hentikan bon baru untuk pelanggan itu",
  },
  {
    id: "expense_spike",
    name: "Lonjakan beban tetap",
    trigger: "Beban tetap bulan ini di atas rata-rata tiga bulan (dipantau manual)",
    action: "Pangkas atau jadwalkan ulang beban yang bisa ditunda",
  },
  {
    id: "shift_variance",
    name: "Tutup kas lambat dan selisih laci",
    trigger: "Total selisih kas saat tutup shift di atas Rp 50.000 per periode",
    action: "Wajib hitung ulang laci saat selisih di atas Rp 20.000",
  },
];

function LeakTab({ ctx, leaks }: { ctx: Context; leaks: LeakFinding[] }) {
  const [threshold, setThreshold] = useState(0);
  const totalImpact = leaks.reduce((s, l) => s + l.impactPerMonth, 0);
  const maxImpact = leaks.reduce((m, l) => Math.max(m, l.impactPerMonth), 0);
  const visible = leaks.filter((l) => l.impactPerMonth >= threshold);
  const visibleImpact = visible.reduce((s, l) => s + l.impactPerMonth, 0);
  const shareOfSales = ctx.kpis.netSales === 0 ? 0 : (totalImpact / ctx.kpis.netSales) * 100;

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Stop the leak"
        title="Leak Detector"
        hint="Mesin aturan berjalan sebelum LLM. Setiap temuan punya dampak rupiah per bulan, bukti transaksinya, dan satu aksi."
      />

      <Card>
        <CardBody className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center">
          <div>
            <div className="label-caps">Total dampak terdeteksi</div>
            <div className="num mt-1 text-[26px] font-semibold text-danger">{formatRupiah(totalImpact)}</div>
            <p className="mt-1 text-[12px] leading-snug text-text-muted">
              per bulan, setara {formatPct(shareOfSales)} dari penjualan 30 hari ({formatCompact(ctx.kpis.netSales)}).
            </p>
          </div>
          <div className="space-y-2">
            <Slider
              label="Ambang dampak minimum"
              value={threshold}
              min={0}
              max={Math.max(1, maxImpact)}
              step={50_000}
              suffix=" Rp"
              onValueChange={setThreshold}
              hint="Sembunyikan temuan yang dampaknya di bawah ambang ini."
            />
            <p className="num text-[12px] text-text-muted">
              {formatNumber(visible.length, 0)} dari {formatNumber(leaks.length, 0)} temuan ditampilkan, dampak{" "}
              {formatRupiah(visibleImpact)}/bulan.
            </p>
          </div>
        </CardBody>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title={leaks.length === 0 ? "Tidak ada kebocoran di atas ambang" : "Semua temuan tersaring"}
            body={
              leaks.length === 0
                ? "Seluruh aturan yang dipantau berada di bawah ambangnya pada periode ini."
                : "Turunkan ambang dampak minimum untuk melihat temuan yang lebih kecil."
            }
            action={
              leaks.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => setThreshold(0)}>
                  Reset ambang
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((l) => (
            <li key={l.id}>
              <div className="card px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Badge tone={l.severity === "high" ? "danger" : l.severity === "medium" ? "warn" : "info"}>
                      {l.severity === "high" ? "Berat" : l.severity === "medium" ? "Sedang" : "Ringan"}
                    </Badge>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold tracking-tight text-text">{l.rule}</h3>
                      <p className="num text-[11.5px] text-text-faint">
                        {formatNumber(l.count, 0)} bukti - aturan {l.id}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[20px] font-semibold text-danger">{formatRupiah(l.impactPerMonth)}</div>
                    <div className="text-[11.5px] text-text-faint">per bulan</div>
                  </div>
                </div>

                <dl className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
                  <div>
                    <dt className="label-caps">Bukti</dt>
                    <dd className="mt-0.5 text-[13px] leading-relaxed text-text-muted">{l.evidence}</dd>
                  </div>
                  <div>
                    <dt className="label-caps">Aksi disarankan</dt>
                    <dd className="mt-0.5 text-[13px] leading-relaxed text-text-muted">{l.action}</dd>
                  </div>
                </dl>

                <div className="mt-3.5">
                  <Link
                    href={l.href}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:bg-surface-2"
                  >
                    Buka bukti
                    <Icon name="ArrowUpRight" size={14} weight="bold" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader
          title="Aturan yang dipantau"
          hint="Sepuluh aturan baseline. Ambangnya nilai awal dan perlu dikalibrasi setelah dua sampai empat minggu data nyata."
        />
        <CardBody className="px-0 py-0">
          <div className="scroll-x">
            <table className="w-full min-w-[760px] text-left">
              <caption className="sr-only">
                Daftar aturan Leak Detector beserta pemicu, tindakan, dan temuan terkini
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="label-caps px-5 py-3">
                    Aturan
                  </th>
                  <th scope="col" className="label-caps px-5 py-3">
                    Pemicu
                  </th>
                  <th scope="col" className="label-caps px-5 py-3">
                    Tindakan
                  </th>
                  <th scope="col" className="label-caps px-5 py-3">
                    Temuan hari ini
                  </th>
                </tr>
              </thead>
              <tbody>
                {MONITORED_RULES.map((rule) => {
                  const finding = rule.id === null ? undefined : leaks.find((l) => l.id === rule.id);
                  return (
                    <tr key={rule.name} className="border-b border-border last:border-0 align-top">
                      <th scope="row" className="px-5 py-3 text-[13px] font-medium text-text">
                        {rule.name}
                      </th>
                      <td className="px-5 py-3 text-[12.5px] leading-snug text-text-muted">{rule.trigger}</td>
                      <td className="px-5 py-3 text-[12.5px] leading-snug text-text-muted">{rule.action}</td>
                      <td className="px-5 py-3">
                        {finding ? (
                          <div className="flex flex-col gap-1">
                            <Badge
                              tone={finding.severity === "high" ? "danger" : finding.severity === "medium" ? "warn" : "info"}
                            >
                              {finding.severity === "high" ? "Berat" : finding.severity === "medium" ? "Sedang" : "Ringan"}
                            </Badge>
                            <span className="num text-[12px] text-text">{formatRupiah(finding.impactPerMonth)}/bulan</span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-text-faint">Di bawah ambang / dipantau manual</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ 3. bebas kas */

function FreeCashTab({
  ctx,
  actorId,
  mutate,
  toast,
}: {
  ctx: Context;
  actorId: ID;
  mutate: (m: Mutation) => void;
  toast: (t: ToastInput) => void;
}) {
  const items = useMemo(() => buildFreeCashPlan(ctx, 12), [ctx]);
  const trapped = items.reduce((s, f) => s + f.trappedCash, 0);
  const cashIn = items.reduce((s, f) => s + f.expectedCash, 0);
  const sacrificed = items.reduce((s, f) => s + f.marginSacrificed, 0);
  const released = items
    .filter((f) => f.product.price <= f.suggestedPrice)
    .reduce((s, f) => s + f.expectedCash, 0);

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Free trapped cash"
        title="Bebas Kas"
        hint="Markdown bertahap untuk barang yang berhenti bergerak. Harga saran tidak pernah turun di bawah harga pokok."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi
          label="Kas yang bisa dibebaskan"
          value={cashIn}
          format="rupiah"
          tone="warn"
          hint="Bila seluruh markdown pada daftar ini diterapkan"
        />
        <Kpi
          label="Modal tertahan sekarang"
          value={trapped}
          format="rupiah"
          hint={`${formatNumber(items.length, 0)} SKU lambat, mati, dan usang`}
        />
        <Kpi
          label="Margin dikorbankan"
          value={sacrificed}
          format="rupiah"
          hint={`Setara ${formatPct(cashIn === 0 ? 0 : (sacrificed / (cashIn + sacrificed)) * 100)} dari harga lama`}
        />
      </div>

      <Card>
        <CardBody className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-text">Kas dibebaskan bulan ini</span>
            <span className="num text-[13px] text-text">
              {formatRupiah(released)} <span className="text-text-faint">dari target {formatRupiah(cashIn)}</span>
            </span>
          </div>
          <ProgressBar
            value={released}
            max={cashIn}
            label={`Kas dibebaskan ${formatRupiah(released)} dari target ${formatRupiah(cashIn)}`}
          />
          <p className="text-[12px] leading-snug text-text-faint">
            Progres bertambah setiap kali harga produk diturunkan ke harga saran. Target adalah total kas yang diharapkan
            masuk setelah markdown.
          </p>
        </CardBody>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="Tidak ada stok yang menahan kas"
            body="Semua produk bergerak dalam 30 hari terakhir, jadi tidak ada markdown yang perlu dijalankan."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Item yang menahan kas"
            hint="Diurutkan dari modal tertahan terbesar. Harga saran dibulatkan ke kelipatan Rp 500."
          />
          <CardBody className="px-0 py-0">
            <div className="scroll-x">
              <table className="w-full min-w-[1040px] text-left">
                <caption className="sr-only">
                  Daftar produk lambat laku dengan modal tertahan, markdown, harga saran, dan kas yang diharapkan
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-5 py-3">
                      Produk
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Qty
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Hari sejak laku
                    </th>
                    <th scope="col" className="label-caps px-3 py-3">
                      Kelas
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Tertahan
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Markdown
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Harga saran
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Kas diharapkan
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Margin dikorbankan
                    </th>
                    <th scope="col" className="label-caps px-3 py-3">
                      Aksi
                    </th>
                    <th scope="col" className="label-caps px-5 py-3">
                      Terapkan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const applied = item.product.price <= item.suggestedPrice;
                    return (
                      <tr key={item.product.id} className="border-b border-border last:border-0 align-top">
                        <th scope="row" className="max-w-[240px] px-5 py-3 text-left">
                          <span className="block truncate text-[13px] font-medium text-text" title={item.product.name}>
                            {item.product.name}
                          </span>
                          <span className="num block text-[11px] text-text-faint">{item.product.sku}</span>
                        </th>
                        <td className="num px-3 py-3 text-right text-[13px] text-text">{formatNumber(item.qty, 0)}</td>
                        <td className="num px-3 py-3 text-right text-[13px] text-text-muted">
                          {item.daysSinceLastSale >= 999 ? "belum pernah" : `${formatNumber(item.daysSinceLastSale, 0)} hari`}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={HEALTH_TONE[item.health]}>{HEALTH_LABEL[item.health]}</Badge>
                        </td>
                        <td className="num px-3 py-3 text-right text-[13px] text-text">{formatRupiah(item.trappedCash)}</td>
                        <td className="num px-3 py-3 text-right text-[13px] text-text-muted">
                          {formatNumber(item.markdownPct, 0)}%
                        </td>
                        <td className="num px-3 py-3 text-right text-[13px] font-medium text-text">
                          {formatRupiah(item.suggestedPrice)}
                        </td>
                        <td className="num px-3 py-3 text-right text-[13px] text-accent">
                          {formatRupiah(item.expectedCash)}
                        </td>
                        <td className="num px-3 py-3 text-right text-[13px] text-warning">
                          {formatRupiah(item.marginSacrificed)}
                        </td>
                        <td className="max-w-[260px] px-3 py-3 text-[12.5px] leading-snug text-text-muted">{item.action}</td>
                        <td className="px-5 py-3">
                          <Button
                            size="sm"
                            variant={applied ? "secondary" : "primary"}
                            disabled={applied}
                            onClick={() => {
                              mutate({
                                type: "apply_markdown",
                                productId: item.product.id,
                                price: item.suggestedPrice,
                                actorId,
                              });
                              toast({
                                title: "Markdown diterapkan",
                                body: `${item.product.name} turun ke ${formatRupiah(item.suggestedPrice)}.`,
                                tone: "ok",
                              });
                            }}
                          >
                            {applied ? "Sudah diterapkan" : "Terapkan markdown"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- 4. reorder */

function supplierName(data: Dataset, supplierId: ID | null): string {
  if (supplierId === null) return "Tanpa supplier";
  return data.suppliers.find((s) => s.id === supplierId)?.name ?? "Supplier tidak dikenal";
}

function ReorderRow({ candidate, data }: { candidate: ReorderCandidate; data: Dataset }) {
  const cover = Number.isFinite(candidate.daysOfCover) ? `${formatNumber(candidate.daysOfCover, 0)} hari` : "∞";
  const payback = candidate.paybackDays >= 999 ? "Tak kembali" : `${formatNumber(candidate.paybackDays, 0)} hari`;
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <th scope="row" className="max-w-[240px] px-5 py-3 text-left">
        <span className="block truncate text-[13px] font-medium text-text" title={candidate.product.name}>
          {candidate.product.name}
        </span>
        <span className="block text-[11.5px] leading-snug text-text-faint">{candidate.note}</span>
      </th>
      <td className="num px-3 py-3 text-right text-[13px] text-text">{formatNumber(candidate.qty, 0)}</td>
      <td className="num px-3 py-3 text-right text-[13px] text-text">{formatRupiah(candidate.totalCost)}</td>
      <td className="num px-3 py-3 text-right text-[13px] text-text-muted">{formatNumber(candidate.gmroi, 2)}</td>
      <td className="num px-3 py-3 text-right text-[13px] text-text-muted">{cover}</td>
      <td className="num px-3 py-3 text-right text-[13px] text-text-muted">{payback}</td>
      <td className="num px-3 py-3 text-right text-[13px] text-text-muted">
        {formatNumber(candidate.leadTimeDays, 0)} hari
      </td>
      <td className="max-w-[200px] px-3 py-3 text-[12.5px] leading-snug text-text-muted">
        {supplierName(data, candidate.supplierId)}
      </td>
      <td className="px-5 py-3">
        <Badge tone={candidate.funded ? "ok" : "neutral"}>{candidate.funded ? "Terdanai" : "Ditunda"}</Badge>
      </td>
    </tr>
  );
}

function ReorderTab({
  ctx,
  data,
  actorId,
  mutate,
  toast,
}: {
  ctx: Context;
  data: Dataset;
  actorId: ID;
  mutate: (m: Mutation) => void;
  toast: (t: ToastInput) => void;
}) {
  const [allocationPct, setAllocationPct] = useState(40);
  const plan = useMemo(() => buildReorderPlan(ctx, { allocationPct }), [ctx, allocationPct]);

  const available = Math.max(0, plan.cashOnHand - plan.safetyFloor - plan.payablesDue);
  const totalNeeded = plan.candidates.reduce((s, c) => s + c.totalCost, 0);
  const deferredValue = plan.deferred.reduce((s, c) => s + c.totalCost, 0);
  const runwayCritical = ctx.kpis.runwayDays < 30;

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Rebuild"
        title="Reorder Planner"
        hint="Knapsack open-to-buy: kandidat diurutkan skor modal kerja, lalu didanai sampai kas terbatas habis."
      />

      <Card>
        <CardBody className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)] md:items-start">
          <div className="rounded-[10px] border border-border bg-surface-2 px-4 py-3.5">
            <div className="label-caps">Rumus open-to-buy</div>
            <p className="num mt-2 text-[12.5px] leading-relaxed text-text-muted">
              kas tersedia = kas di tangan - lantai kas aman - utang jatuh tempo 14 hari
            </p>
            <p className="num mt-1 text-[12.5px] leading-relaxed text-text">
              {formatRupiah(plan.cashOnHand)} - {formatRupiah(plan.safetyFloor)} - {formatRupiah(plan.payablesDue)} ={" "}
              {formatRupiah(available)}
            </p>
            <p className="num mt-3 text-[12.5px] leading-relaxed text-text-muted">
              open-to-buy = kas tersedia x alokasi
            </p>
            <p className="num mt-1 text-[14px] font-semibold leading-relaxed text-text">
              {formatRupiah(available)} x {formatNumber(plan.allocationPct, 0)}% = {formatRupiah(plan.openToBuy)}
            </p>
          </div>
          <div className="space-y-2">
            <Slider
              label="Alokasi kas untuk belanja stok"
              value={allocationPct}
              min={10}
              max={80}
              step={5}
              suffix="%"
              onValueChange={setAllocationPct}
              hint="Sisanya ditahan sebagai bantalan kas dan cadangan utang."
            />
            <p className="text-[12px] leading-snug text-text-faint">
              Lantai kas aman {formatRupiah(plan.safetyFloor)} diambil dari profil toko. Utang yang jatuh tempo dalam 14
              hari selalu dibayar lebih dulu.
            </p>
          </div>
        </CardBody>
      </Card>

      {runwayCritical ? (
        <Alert tone="warn" title="Runway di bawah 30 hari: utamakan konsinyasi dan termin panjang">
          Pada kondisi ini jangan menambah komitmen tunai. Minta supplier memasok dengan titip jual atau termin 21-30 hari,
          supaya belanja stok tidak memakan bantalan kas yang tersisa.
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Open-to-buy" value={plan.openToBuy} format="rupiah" hint={`Alokasi ${plan.allocationPct}%`} />
        <Kpi label="Total kas dibutuhkan" value={totalNeeded} format="rupiah" hint="Seluruh kandidat reorder" />
        <Kpi label="Terdanai" value={plan.totalFunded} format="rupiah" tone="ok" hint={`${plan.funded.length} baris`} />
        <Kpi
          label="Ditunda karena kas terbatas"
          value={deferredValue}
          format="rupiah"
          tone="warn"
          hint={`${plan.deferred.length} baris menunggu kas masuk`}
        />
      </div>

      <Card>
        <CardHeader
          title="Kandidat reorder"
          hint={`Payback rata-rata ${formatNumber(plan.expectedPaybackDays, 0)} hari pada baris yang terdanai.`}
          action={
            <Button
              size="sm"
              variant="primary"
              disabled={plan.funded.length === 0}
              onClick={() => {
                mutate({ type: "approve_reorder", candidateIds: plan.funded.map((c) => c.product.id), actorId });
                toast({
                  title: "Draf PO dibuat",
                  body: `${plan.funded.length} baris reorder senilai ${formatRupiah(plan.totalFunded)} menunggu persetujuan.`,
                  tone: "ok",
                });
              }}
            >
              Buat draf PO
            </Button>
          }
        />
        <CardBody className="px-0 py-0">
          {plan.candidates.length === 0 ? (
            <EmptyState
              title="Tidak ada kandidat reorder"
              body="Semua produk bergerak berada di atas titik pesan ulang, jadi belum ada yang perlu dibeli."
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[1080px] text-left">
                <caption className="sr-only">
                  Kandidat reorder terdanai dan ditunda dengan biaya, GMROI, hari cover, payback, lead time, dan supplier
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-5 py-3">
                      Produk
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Qty
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Biaya
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      GMROI
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Hari cover
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Payback
                    </th>
                    <th scope="col" className="label-caps px-3 py-3 text-right">
                      Lead time
                    </th>
                    <th scope="col" className="label-caps px-3 py-3">
                      Supplier
                    </th>
                    <th scope="col" className="label-caps px-5 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...plan.funded, ...plan.deferred].map((c) => (
                    <ReorderRow key={`${c.product.id}-${c.funded ? "f" : "d"}`} candidate={c} data={data} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- 5. what-if */

const LEVER_DEFAULTS: WhatIfLevers = {
  marginPoints: 3,
  drawCutPct: 40,
  deadStockLiquidatePct: 50,
  discountCutPct: 30,
  attachRatePoints: 10,
  supplierTermDays: 14,
  expenseCut: 1_000_000,
};

const PRESETS: { name: string; hint: string; levers: WhatIfLevers }[] = [
  {
    name: "Konservatif",
    hint: "Perubahan kecil yang realistis dikerjakan minggu ini.",
    levers: {
      marginPoints: 1,
      drawCutPct: 20,
      deadStockLiquidatePct: 25,
      discountCutPct: 15,
      attachRatePoints: 5,
      supplierTermDays: 7,
      expenseCut: 250_000,
    },
  },
  {
    name: "Seimbang",
    hint: "Bauran prive, markdown, dan margin yang paling sering cukup.",
    levers: LEVER_DEFAULTS,
  },
  {
    name: "Agresif",
    hint: "Semua tuas ditarik maksimal untuk menghentikan pendarahan.",
    levers: {
      marginPoints: 5,
      drawCutPct: 60,
      deadStockLiquidatePct: 100,
      discountCutPct: 50,
      attachRatePoints: 20,
      supplierTermDays: 30,
      expenseCut: 3_000_000,
    },
  },
];

function WhatIfTab({ ctx }: { ctx: Context }) {
  const [levers, setLevers] = useState<WhatIfLevers>(LEVER_DEFAULTS);
  const [preset, setPreset] = useState<string | null>("Seimbang");
  const result = useMemo(() => simulate(ctx, levers), [ctx, levers]);

  function patch(next: Partial<WhatIfLevers>) {
    setPreset(null);
    setLevers((prev) => ({ ...prev, ...next }));
  }

  const runwayDelta = result.runwayDays - result.baseRunwayDays;
  const weeklyPoints = result.weekly.map((w) => ({ x: `M${w.week}`, y: w.scenario }));
  const weeklyBand = result.weekly.map((w) => ({
    x: `M${w.week}`,
    low: Math.min(w.base, w.scenario),
    high: Math.max(w.base, w.scenario),
  }));

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Simulasi deterministik"
        title="What-If Simulator"
        hint="Tarik tuasnya, lihat runway dan kas 13 minggu bergerak. Perhitungan murni aritmetika, bukan perkiraan model bahasa."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-caps">Preset</span>
            {PRESETS.map((p) => (
              <Button
                key={p.name}
                size="sm"
                variant={preset === p.name ? "primary" : "secondary"}
                onClick={() => {
                  setLevers(p.levers);
                  setPreset(p.name);
                }}
                title={p.hint}
              >
                {p.name}
              </Button>
            ))}
            <span className="text-[12px] text-text-faint">
              {PRESETS.find((p) => p.name === preset)?.hint ?? "Nilai tuas disesuaikan manual."}
            </span>
          </div>

          <div className="grid gap-x-6 gap-y-5 border-t border-border pt-4 md:grid-cols-2 xl:grid-cols-3">
            <Slider
              label="Naikkan margin"
              value={levers.marginPoints}
              min={0}
              max={5}
              step={0.5}
              suffix=" poin"
              onValueChange={(v) => patch({ marginPoints: v })}
              hint="Geser bauran ke aksesori dan jasa, batasi nego handset."
            />
            <Slider
              label="Potong prive pemilik"
              value={levers.drawCutPct}
              min={0}
              max={60}
              step={5}
              suffix="%"
              onValueChange={(v) => patch({ drawCutPct: v })}
              hint={`Saat ini prive 30 hari ${formatCompact(ctx.kpis.draws)}.`}
            />
            <Slider
              label="Cairkan stok mati"
              value={levers.deadStockLiquidatePct}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onValueChange={(v) => patch({ deadStockLiquidatePct: v })}
              hint={`Nilai stok mati ${formatCompact(ctx.kpis.deadStockValue)}.`}
            />
            <Slider
              label="Kurangi diskon"
              value={levers.discountCutPct}
              min={0}
              max={50}
              step={5}
              suffix="%"
              onValueChange={(v) => patch({ discountCutPct: v })}
              hint={`Kebocoran diskon sekarang ${formatPct(ctx.kpis.discountLeakagePct)}.`}
            />
            <Slider
              label="Naikkan attach rate"
              value={levers.attachRatePoints}
              min={0}
              max={20}
              step={1}
              suffix=" poin"
              onValueChange={(v) => patch({ attachRatePoints: v })}
              hint={`Attach rate sekarang ${formatPct(ctx.kpis.attachRatePct)}.`}
            />
            <Slider
              label="Perpanjang termin supplier"
              value={levers.supplierTermDays}
              min={0}
              max={30}
              step={1}
              suffix=" hari"
              onValueChange={(v) => patch({ supplierTermDays: v })}
              hint="Menahan kas lebih lama di rekening, bukan menambah utang baru."
            />
            <Slider
              label="Potong beban tetap (Rp per bulan)"
              value={levers.expenseCut}
              min={0}
              max={3_000_000}
              step={100_000}
              onValueChange={(v) => patch({ expenseCut: v })}
              hint={`Beban tetap terpantau ${formatCompact(ctx.kpis.monthlyFixedCost)} per bulan.`}
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps">Runway kas</span>
              <Badge tone={result.safe ? "ok" : result.runwayDays >= 60 ? "info" : "danger"}>
                {result.safe ? "Arus positif" : `${runwayDelta >= 0 ? "+" : ""}${formatNumber(runwayDelta, 0)} hari`}
              </Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-[15px] text-text-faint line-through">{formatNumber(result.baseRunwayDays, 0)}</span>
              <span className="num text-[30px] font-semibold text-text" data-testid="whatif-runway">
                {formatNumber(result.runwayDays, 0)}
              </span>
              <span className="text-[12px] text-text-faint">hari</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-text-muted">
              Sebelum vs sesudah tuas. Angka 365 berarti arus kas sudah tidak negatif.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps">True Burn / hari</span>
              <Badge tone={result.trueBurn <= 0 ? "ok" : "danger"}>
                {result.trueBurn <= 0 ? "Tidak membakar kas" : "Masih membakar"}
              </Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-[15px] text-text-faint line-through">
                {formatCompact(Math.abs(result.baseTrueBurn))}
              </span>
              <span className={cn("num text-[30px] font-semibold", result.trueBurn <= 0 ? "text-accent" : "text-danger")}>
                {formatCompact(Math.abs(result.trueBurn))}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-text-muted">
              Impas penjualan {formatCompact(result.breakEvenSalesPerDay)} per hari pada margin proyeksi.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <span className="label-caps">Kas minggu 4 / 8 / 13</span>
            <dl className="mt-2 space-y-1.5">
              {[
                { label: "Minggu 4", value: result.cashWeek4 },
                { label: "Minggu 8", value: result.cashWeek8 },
                { label: "Minggu 13", value: result.cashWeek13 },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12.5px] text-text-muted">{row.label}</dt>
                  <dd className={cn("num text-[15px] font-semibold", row.value < 0 ? "text-danger" : "text-text")}>
                    {formatRupiah(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] leading-snug text-text-muted">
              Kas yang dibebaskan dari stok mati {formatRupiah(result.cashFreed)}.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Proyeksi kas 13 minggu"
          hint="Garis adalah skenario. Pita menunjukkan rentang antara jalur dasar dan jalur skenario."
        />
        <CardBody>
          <LineWithBand points={weeklyPoints} band={weeklyBand} label="Kas 13 minggu, dasar vs proyeksi" />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded-full bg-accent" aria-hidden="true" />
              Kas proyeksi
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-full bg-accent/20" aria-hidden="true" />
              Rentang dasar ke proyeksi
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kombinasi minimum" hint="Langkah paling ringan yang membuat skenario berhenti membakar kas." />
        <CardBody>
          {result.minimumCombination.length === 0 ? (
            <Alert tone="ok" title="True Burn sudah positif">
              Pada tuas saat ini kas bertambah setiap hari. Tidak ada kombinasi darurat yang perlu dijalankan.
            </Alert>
          ) : (
            <ol className="space-y-2.5">
              {result.minimumCombination.map((step, i) => (
                <li key={`${i}-${step}`} className="flex items-start gap-3">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[12px] font-medium text-warning">
                    {i + 1}
                  </span>
                  <p className="text-[13px] leading-relaxed text-text-muted">{step}</p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- 6. playbook */

function kpiProgress(task: RecoveryTask): number {
  if (task.target === 0) return task.current <= 0 ? 100 : 0;
  if (task.target >= task.current) return clamp((task.current / task.target) * 100, 0, 100);
  return clamp((task.target / task.current) * 100, 0, 100);
}

function TaskCard({
  task,
  asOf,
  mutate,
}: {
  task: RecoveryTask;
  asOf: string;
  mutate: (m: Mutation) => void;
}) {
  const progress = kpiProgress(task);
  const daysLeft = daysBetween(asOf, task.due);
  const dueLabel =
    daysLeft < 0
      ? `Lewat tenggat, ${relativeDays(task.due, asOf)}`
      : daysLeft === 0
        ? "Tenggat hari ini"
        : `Tenggat ${formatNumber(daysLeft, 0)} hari lagi`;

  return (
    <div className="card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Badge tone={SOURCE_TONE[task.source]}>{SOURCE_LABEL[task.source]}</Badge>
          <div className="min-w-0">
            <h4 className="text-[14.5px] font-semibold tracking-tight text-text">{task.title}</h4>
            <p className="measure mt-0.5 text-[12.5px] leading-snug text-text-muted">{task.detail}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[14px] font-semibold text-text">{formatRupiah(task.impactPerMonth)}</div>
          <div className="text-[11.5px] text-text-faint">dampak per bulan</div>
        </div>
      </div>

      <div className="mt-3.5 border-t border-border pt-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12.5px] font-medium text-text">{task.kpi}</span>
          <span className="num text-[12.5px] text-text-muted">
            {formatKpiValue(task.current)} <span className="text-text-faint">dari target {formatKpiValue(task.target)}</span>
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar
            value={progress}
            max={100}
            label={`${task.kpi}: ${formatNumber(progress, 0)} persen menuju target`}
            tone={progress >= 100 ? "accent" : progress >= 50 ? "accent" : "warning"}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="num text-[11.5px] text-text-faint">
            {formatNumber(progress, 0)}% - {formatDate(task.due)} - {dueLabel}
          </span>
          <div className="flex items-center gap-2">
            {task.status === "open" ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => mutate({ type: "mark_task", taskId: task.id, status: "done" })}
                >
                  Tandai selesai
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => mutate({ type: "mark_task", taskId: task.id, status: "skipped" })}
                >
                  Lewati
                </Button>
              </>
            ) : (
              <>
                <Badge tone={task.status === "done" ? "ok" : "neutral"}>
                  {task.status === "done" ? "Selesai" : "Dilewati"}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => mutate({ type: "mark_task", taskId: task.id, status: "open" })}
                >
                  Buka lagi
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaybookTab({ data, mutate }: { data: Dataset; mutate: (m: Mutation) => void }) {
  const [phaseFilter, setPhaseFilter] = useState<TaskPhase | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | RecoveryTask["status"]>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | RecoveryTask["source"]>("all");

  const phases: TaskPhase[] = ["stabilize", "free_cash", "margin", "rebuild"];
  const visible = data.recoveryTasks.filter(
    (t) =>
      (phaseFilter === "all" || t.phase === phaseFilter) &&
      (statusFilter === "all" || t.status === statusFilter) &&
      (sourceFilter === "all" || t.source === sourceFilter)
  );

  const total = data.recoveryTasks.length;
  const done = data.recoveryTasks.filter((t) => t.status === "done");
  const doneImpact = done.reduce((s, t) => s + t.impactPerMonth, 0);
  const openImpact = data.recoveryTasks
    .filter((t) => t.status === "open")
    .reduce((s, t) => s + t.impactPerMonth, 0);

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Playbook 90 hari"
        title="Tugas pemulihan"
        hint="Tugas datang dari mesin aturan, AI Analyst, dan input manual. Menandai selesai mengubah data dan tercatat di audit log."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Fase"
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as TaskPhase | "all")}
            >
              <option value="all">Semua fase</option>
              {phases.map((p) => (
                <option key={p} value={p}>
                  {PHASE_LABEL[p]}
                </option>
              ))}
            </Select>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | RecoveryTask["status"])}
            >
              <option value="all">Semua status</option>
              <option value="open">Terbuka</option>
              <option value="done">Selesai</option>
              <option value="skipped">Dilewati</option>
            </Select>
            <Select
              label="Sumber"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "all" | RecoveryTask["source"])}
            >
              <option value="all">Semua sumber</option>
              <option value="engine">Engine</option>
              <option value="ai">AI</option>
              <option value="manual">Manual</option>
            </Select>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-text">Progres playbook</span>
              <span className="num text-[13px] text-text">
                {formatNumber(done.length, 0)}/{formatNumber(total, 0)} tugas selesai
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={done.length}
                max={total}
                label={`${done.length} dari ${total} tugas selesai`}
              />
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="label-caps">Dampak tugas selesai</dt>
                <dd className="num mt-1 text-[16px] font-semibold text-accent">{formatRupiah(doneImpact)}/bulan</dd>
              </div>
              <div>
                <dt className="label-caps">Dampak masih terbuka</dt>
                <dd className="num mt-1 text-[16px] font-semibold text-warning">{formatRupiah(openImpact)}/bulan</dd>
              </div>
            </dl>
          </div>
        </CardBody>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="Tidak ada tugas pada filter ini"
            body="Longgarkan filter fase, status, atau sumber untuk melihat tugas lainnya."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {phases.map((phase) => {
            const list = visible.filter((t) => t.phase === phase);
            if (list.length === 0) return null;
            const phaseImpact = list.reduce((s, t) => s + t.impactPerMonth, 0);
            return (
              <section key={phase} aria-labelledby={`fase-${phase}`} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id={`fase-${phase}`} className="text-[15px] font-semibold tracking-tight text-text">
                    {PHASE_LABEL[phase]}
                  </h3>
                  <span className="num text-[11.5px] text-text-faint">
                    {PHASE_WINDOW[phase]} - {formatNumber(list.length, 0)} tugas - {formatRupiah(phaseImpact)}/bulan
                  </span>
                </div>
                <ul className="space-y-3">
                  {list.map((task) => (
                    <li key={task.id}>
                      <TaskCard task={task} asOf={data.asOf} mutate={mutate} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
