"use client";

/* ============================================================================
   AI Analyst. Pola yang ditunjukkan halaman ini: "AI menjelaskan, aturan
   menghitung". Tidak ada panggilan jaringan dan tidak ada API key. Setiap
   angka diambil dari mesin metrik (src/lib/metrics.ts) dan hanya dinarasikan
   di sini. Jadi jawaban selalu bisa diaudit dan tidak pernah berhalusinasi.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Calculator,
  ChatCircle,
  Lightbulb,
  PaperPlaneTilt,
  Robot,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import type { Dataset } from "@/lib/types";
import { useFrizzy, type Role } from "@/lib/store";
import {
  buildReorderPlan,
  deadStockList,
  detectLeaks,
  factsForAi,
  lowStockList,
  recoveryScore,
  simulate,
  topMovers,
  type Context,
} from "@/lib/metrics";
import { formatDateShort, formatNumber, formatPct, formatRupiah } from "@/lib/money";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { DataRow } from "@/components/ui/Kpi";

/* ------------------------------------------------------------------ tipe */

type CalcRow = { label: string; value: string };

type Answer = {
  body: string;
  points: string[];
  source: string;
  calc: CalcRow[];
};

type Message = { id: string; from: "user" | "assistant"; body: string; answer: Answer | null };

const SUGGESTIONS: string[] = [
  "Kenapa kas turun padahal penjualan tidak turun?",
  "Barang apa yang paling banyak menahan uang?",
  "Kalau prive dipotong 60% dan separuh stok mati cair, runway jadi berapa?",
  "Dengan kas yang ada, sebaiknya belanja apa?",
];

let seq = 0;
function nextId(): string {
  seq += 1;
  return `msg_${seq}`;
}

function money(value: number): string {
  return formatRupiah(Math.round(value));
}

function days(value: number): string {
  return Number.isFinite(value) ? `${formatNumber(Math.round(value))} hari` : "tak terbatas";
}

function lastSoldText(value: number): string {
  return value >= 999 ? "belum pernah terjual" : `terakhir laku ${value} hari lalu`;
}

/* --------------------------------------------------------- mesin jawaban */

function cashAnswer(ctx: Context): Answer {
  const k = ctx.kpis;
  const leaks = detectLeaks(ctx);
  const top = leaks.at(0);
  const net = k.grossProfit - k.opex - k.draws;

  return {
    body:
      `Penjualan 30 hari ${money(k.netSales)} memang tidak turun, jadi penyebabnya bukan omzet. ` +
      `Laba kotor ${money(k.grossProfit)} habis dipakai beban ${money(k.opex)} dan prive ${money(k.draws)}, sehingga arus bersihnya ${money(net)}. ` +
      `Itulah yang membuat True Burn ${money(k.trueBurnPerDay)} per hari, dan kas ${money(k.cashOnHand)} hanya cukup ${days(k.runwayDays)}. ` +
      `Belanja stok juga baru ${formatPct(k.replenishmentRatio * 100, 0)} dari HPP, jadi stok ikut menipis.`,
    points: [
      `Laba kotor ${money(k.grossProfit)} - beban ${money(k.opex)} - prive ${money(k.draws)} = ${money(net)}`,
      `True Burn ${money(k.trueBurnPerDay)}/hari - runway ${days(k.runwayDays)}`,
      top
        ? `Kebocoran terbesar: ${top.rule} (${money(top.impactPerMonth)}/bulan)`
        : "Tidak ada kebocoran besar yang terdeteksi",
    ],
    source: "get_kpis, get_leaks, get_cash_bridge",
    calc: [
      { label: "Penjualan 30 hari", value: money(k.netSales) },
      { label: "HPP 30 hari", value: money(k.cogs) },
      { label: "Laba kotor 30 hari", value: money(k.grossProfit) },
      { label: "Beban operasional 30 hari", value: money(k.opex) },
      { label: "Prive pemilik 30 hari", value: money(k.draws) },
      { label: "Rasio replenishment", value: formatPct(k.replenishmentRatio * 100, 0) },
      { label: "True Burn per hari", value: money(k.trueBurnPerDay) },
      { label: "Kas sekarang", value: money(k.cashOnHand) },
      { label: "Runway", value: days(k.runwayDays) },
    ],
  };
}

function deadStockAnswer(ctx: Context): Answer {
  const k = ctx.kpis;
  const items = deadStockList(ctx, 6);
  const share = k.inventoryValue === 0 ? 0 : (k.deadStockValue / k.inventoryValue) * 100;
  const biggest = items.at(0);

  if (items.length === 0) {
    return {
      body:
        `Tidak ada barang yang benar-benar mati saat ini: nilai stok mati ${money(k.deadStockValue)} dari total persediaan ${money(k.inventoryValue)}. ` +
        `Artinya modal Anda masih berputar, meski stok lambat laku tetap perlu dijaga. ` +
        `Perhatikan barang dengan kesehatan "slow" senilai ${money(k.slowStockValue)} agar tidak menua menjadi stok mati.`,
      points: [
        `Stok mati ${money(k.deadStockValue)} (${formatPct(share, 1)} dari persediaan)`,
        `Stok lambat laku ${money(k.slowStockValue)}`,
        `DIO ${formatNumber(k.dio, 1)} hari - perputaran ${formatNumber(k.turnover, 2)}x per tahun`,
      ],
      source: "get_dead_stock, get_kpis",
      calc: [
        { label: "Nilai persediaan", value: money(k.inventoryValue) },
        { label: "Nilai stok mati", value: money(k.deadStockValue) },
        { label: "Nilai stok lambat laku", value: money(k.slowStockValue) },
        { label: "Porsi stok mati", value: formatPct(share, 1) },
        { label: "DIO", value: `${formatNumber(k.dio, 1)} hari` },
      ],
    };
  }

  return {
    body:
      `${items.length} SKU menahan uang paling banyak, total ${money(k.deadStockValue)} atau ${formatPct(share, 1)} dari nilai persediaan ${money(k.inventoryValue)}. ` +
      (biggest
        ? `Yang teratas ${biggest.product.name} dengan ${formatNumber(biggest.qty)} unit senilai ${money(biggest.trappedCash)}, ${lastSoldText(biggest.daysSinceLastSale)}. `
        : "") +
      `Uang itu tidak hilang, tetapi berhenti berputar: setiap markdown bertahap mengubahnya kembali menjadi kas untuk belanja barang cepat laku.`,
    points: items
      .slice(0, 3)
      .map(
        (m) =>
          `${m.product.name} - ${formatNumber(m.qty)} unit - menahan ${money(m.trappedCash)} (${lastSoldText(m.daysSinceLastSale)})`
      ),
    source: "get_dead_stock, get_kpis",
    calc: [
      { label: "Nilai persediaan", value: money(k.inventoryValue) },
      { label: "Nilai stok mati", value: money(k.deadStockValue) },
      { label: "Porsi stok mati", value: formatPct(share, 1) },
      { label: "Jumlah SKU stok mati", value: formatNumber(items.length) },
      ...items
        .slice(0, 3)
        .map((m) => ({ label: `Kas tertahan: ${m.product.name}`, value: money(m.trappedCash) })),
    ],
  };
}

function runwayAnswer(ctx: Context): Answer {
  const k = ctx.kpis;
  const cut = 60;
  const liquidate = 50;
  const sim = simulate(ctx, {
    marginPoints: 0,
    drawCutPct: cut,
    deadStockLiquidatePct: liquidate,
    discountCutPct: 0,
    attachRatePoints: 0,
    supplierTermDays: 0,
    expenseCut: 0,
  });
  const drawSaving = (k.draws * cut) / 100;

  return {
    body:
      `Dengan prive dipotong ${formatNumber(cut)}% dan separuh stok mati dicairkan, runway berubah dari ${days(sim.baseRunwayDays)} menjadi ${days(sim.runwayDays)}. ` +
      `Pemotongan prive menghemat ${money(drawSaving)} per 30 hari dan likuidasi melepas kas ${money(sim.cashFreed)}. ` +
      `True Burn skenario menjadi ${money(sim.trueBurn)} per hari, dengan kas minggu ke-13 sekitar ${money(sim.cashWeek13)}. ` +
      (sim.safe
        ? "Pada skenario ini kas berhenti bocor, jadi runway tidak lagi berbatas."
        : "Kas masih bocor, jadi pemangkasan beban tetap perlu ditambah."),
    points: [
      `Runway ${days(sim.baseRunwayDays)} -> ${days(sim.runwayDays)}`,
      `Kas bebas dari likuidasi ${formatNumber(liquidate)}% stok mati = ${money(sim.cashFreed)}`,
      `True Burn ${money(sim.baseTrueBurn)}/hari -> ${money(sim.trueBurn)}/hari`,
    ],
    source: "simulate_levers, get_kpis, get_dead_stock",
    calc: [
      { label: "Kas sekarang", value: money(k.cashOnHand) },
      { label: "Prive 30 hari", value: money(k.draws) },
      { label: "Pemotongan prive", value: formatPct(cut, 0) },
      { label: "Penghematan prive", value: money(drawSaving) },
      { label: "Nilai stok mati", value: money(k.deadStockValue) },
      { label: "Porsi stok mati dicairkan", value: formatPct(liquidate, 0) },
      { label: "Kas bebas", value: money(sim.cashFreed) },
      { label: "True Burn 30 hari bergulir", value: money(k.trueBurnPerDay) },
      { label: "True Burn skenario", value: money(sim.trueBurn) },
      { label: "Runway sebelum", value: days(sim.baseRunwayDays) },
      { label: "Runway sesudah", value: days(sim.runwayDays) },
      { label: "Kas minggu ke-13", value: money(sim.cashWeek13) },
    ],
  };
}

function reorderAnswer(ctx: Context): Answer {
  const plan = buildReorderPlan(ctx);
  const picks = plan.funded.length > 0 ? plan.funded : plan.candidates;

  if (picks.length === 0) {
    return {
      body:
        `Dengan kas ${money(plan.cashOnHand)}, lantai kas aman ${money(plan.safetyFloor)}, dan utang jatuh tempo 14 hari ${money(plan.payablesDue)}, belum ada ruang belanja yang aman. ` +
        `Open to buy saat ini ${money(plan.openToBuy)} dan tidak ada kandidat yang lolos syarat permintaan. ` +
        `Cairkan dulu stok mati ${money(ctx.kpis.deadStockValue)} supaya ada kas untuk memutar barang cepat laku.`,
      points: [
        `Kas ${money(plan.cashOnHand)} - lantai aman ${money(plan.safetyFloor)} - utang 14 hari ${money(plan.payablesDue)}`,
        `Open to buy ${money(plan.openToBuy)} (alokasi ${formatNumber(plan.allocationPct)}%)`,
        `Kandidat reorder ${formatNumber(plan.candidates.length)} baris, belum ada yang terdanai`,
      ],
      source: "get_reorder_plan, get_kpis",
      calc: [
        { label: "Kas sekarang", value: money(plan.cashOnHand) },
        { label: "Lantai kas aman", value: money(plan.safetyFloor) },
        { label: "Utang jatuh tempo 14 hari", value: money(plan.payablesDue) },
        { label: "Alokasi belanja", value: formatPct(plan.allocationPct, 0) },
        { label: "Open to buy", value: money(plan.openToBuy) },
      ],
    };
  }

  return {
    body:
      `Kas ${money(plan.cashOnHand)} dikurangi lantai kas aman ${money(plan.safetyFloor)} dan utang jatuh tempo 14 hari ${money(plan.payablesDue)} menyisakan ruang belanja ${money(plan.openToBuy)} (alokasi ${formatNumber(plan.allocationPct)}%). ` +
      `Prioritasnya barang yang perputarannya paling cepat, dipimpin ${picks.at(0)?.product.name ?? "belum ada kandidat"}. ` +
      `Rencana ini memakai ${money(plan.totalFunded)} dengan perkiraan balik modal ${formatNumber(plan.expectedPaybackDays)} hari. ` +
      `Sisa ${formatNumber(plan.deferred.length)} kandidat ditahan sampai kas bertambah.`,
    points: picks
      .slice(0, 3)
      .map(
        (c) =>
          `${c.product.name} - ${formatNumber(c.qty)} unit - ${money(c.totalCost)} - balik modal ${formatNumber(Math.round(c.paybackDays))} hari`
      ),
    source: "get_reorder_plan, get_kpis",
    calc: [
      { label: "Kas sekarang", value: money(plan.cashOnHand) },
      { label: "Lantai kas aman", value: money(plan.safetyFloor) },
      { label: "Utang jatuh tempo 14 hari", value: money(plan.payablesDue) },
      { label: "Alokasi belanja", value: formatPct(plan.allocationPct, 0) },
      { label: "Open to buy", value: money(plan.openToBuy) },
      { label: "Kandidat reorder", value: formatNumber(plan.candidates.length) },
      { label: "Dana terpakai", value: money(plan.totalFunded) },
      { label: "Perkiraan balik modal", value: `${formatNumber(plan.expectedPaybackDays)} hari` },
    ],
  };
}

function discountAnswer(ctx: Context): Answer {
  const k = ctx.kpis;
  const leaks = detectLeaks(ctx).filter((l) => l.id === "discount" || l.id === "below_cost");

  return {
    body:
      `Diskon 30 hari terakhir ${formatPct(k.discountLeakagePct, 1)} dari penjualan kotor, setara ${money(k.discountTotal)}. ` +
      `Ada ${formatNumber(k.belowCostCount)} baris transaksi yang dijual di bawah HPP dengan kerugian ${money(k.belowCostLoss)}. ` +
      (leaks.length > 0
        ? `Temuan aturan: ${leaks.map((l) => l.rule).join(", ")}. `
        : "Tidak ada aturan kebocoran diskon yang aktif saat ini. ") +
      `Margin guard dan PIN pemilik untuk diskon di atas batas adalah penutup kebocoran tercepat.`,
    points: [
      `Kebocoran diskon ${formatPct(k.discountLeakagePct, 1)} di atas ambang 4%`,
      `Total diskon ${money(k.discountTotal)} dari penjualan kotor`,
      `${formatNumber(k.belowCostCount)} baris di bawah HPP - rugi ${money(k.belowCostLoss)}`,
    ],
    source: "get_leaks, get_kpis",
    calc: [
      { label: "Penjualan 30 hari", value: money(k.netSales) },
      { label: "Total diskon 30 hari", value: money(k.discountTotal) },
      { label: "Kebocoran diskon", value: formatPct(k.discountLeakagePct, 2) },
      { label: "Transaksi di bawah HPP", value: formatNumber(k.belowCostCount) },
      { label: "Kerugian di bawah HPP", value: money(k.belowCostLoss) },
      { label: "Margin kotor", value: formatPct(k.grossMarginPct, 1) },
    ],
  };
}

function marginAnswer(ctx: Context): Answer {
  const k = ctx.kpis;
  const movers = topMovers(ctx, 3);

  return {
    body:
      `Margin kotor 30 hari ${formatPct(k.grossMarginPct, 1)} dengan laba kotor ${money(k.grossProfit)} dari penjualan ${money(k.netSales)}. ` +
      `GMROI ${formatNumber(k.gmroi, 2)} berarti setiap rupiah persediaan menghasilkan ${formatNumber(k.gmroi, 2)} laba per tahun, dan attach rate aksesori ${formatPct(k.attachRatePct, 1)}. ` +
      `Titik impas penjualan ${money(k.breakEvenSalesPerDay)} per hari, sementara rata-rata penjualan harian ${money(k.avgDailySales)}. ` +
      `Geser bauran ke aksesori dan jasa yang marginnya lebih tinggi untuk memperbaiki angka ini.`,
    points: [
      `Margin kotor ${formatPct(k.grossMarginPct, 1)} - GMROI ${formatNumber(k.gmroi, 2)}`,
      `Titik impas ${money(k.breakEvenSalesPerDay)}/hari vs penjualan ${money(k.avgDailySales)}/hari`,
      ...movers.slice(0, 1).map((m) => `Penyumbang laba terbesar: ${m.product.name} (${money(m.grossProfit)})`),
    ],
    source: "get_kpis, get_top_movers",
    calc: [
      { label: "Penjualan 30 hari", value: money(k.netSales) },
      { label: "Laba kotor 30 hari", value: money(k.grossProfit) },
      { label: "Margin kotor", value: formatPct(k.grossMarginPct, 2) },
      { label: "GMROI", value: formatNumber(k.gmroi, 2) },
      { label: "Attach rate", value: formatPct(k.attachRatePct, 1) },
      { label: "Titik impas per hari", value: money(k.breakEvenSalesPerDay) },
      ...movers.map((m) => ({ label: `Laba: ${m.product.name}`, value: money(m.grossProfit) })),
    ],
  };
}

function reviewAnswer(ctx: Context): Answer {
  const k = ctx.kpis;

  return {
    body:
      `Permintaan ulasan yang terkirim ${formatNumber(k.reviewRequestsSent)} dan yang diklik ${formatNumber(k.reviewClicks)}, jadi tingkat kliknya ${formatPct(k.reviewClickRatePct, 1)}. ` +
      `Angka ini menunjukkan tautan ulasan sudah sampai, tetapi belum tentu berbuah rating karena pelanggan harus diminta tanpa insentif dan tanpa penyaringan. ` +
      `Yang dilarang tegas: menyaring pelanggan (review gating) dan memberi imbalan atas ulasan. ` +
      `Hormati juga daftar berhenti berlangganan dan cooldown ${formatNumber(ctx.data.profile.reviewCooldownDays)} hari per pelanggan.`,
    points: [
      `Terkirim ${formatNumber(k.reviewRequestsSent)} - diklik ${formatNumber(k.reviewClicks)}`,
      `Tingkat klik ${formatPct(k.reviewClickRatePct, 1)}`,
      `Cooldown ${formatNumber(ctx.data.profile.reviewCooldownDays)} hari per pelanggan`,
    ],
    source: "get_kpis, get_review_requests",
    calc: [
      { label: "Permintaan ulasan terkirim", value: formatNumber(k.reviewRequestsSent) },
      { label: "Klik tautan ulasan", value: formatNumber(k.reviewClicks) },
      { label: "Tingkat klik", value: formatPct(k.reviewClickRatePct, 2) },
      { label: "Cooldown ulasan", value: `${formatNumber(ctx.data.profile.reviewCooldownDays)} hari` },
    ],
  };
}

function helpAnswer(ctx: Context): Answer {
  const k = ctx.kpis;
  const dead = deadStockList(ctx).length;

  return {
    body:
      `Pertanyaan itu belum cocok dengan metrik yang tersedia, jadi saya tidak menebak angkanya. ` +
      `Yang bisa saya jelaskan: arus kas dan runway, stok mati, rencana belanja, prive, diskon, margin, dan ulasan pelanggan. ` +
      `Sebutkan salah satu topik itu, atau klik salah satu pertanyaan saran di bawah. ` +
      `Semua jawaban dihitung mesin metrik, bukan dikira-kira.`,
    points: [
      `Kas sekarang ${money(k.cashOnHand)} dengan runway ${days(k.runwayDays)}`,
      `Stok mati ${money(k.deadStockValue)} dari ${money(k.inventoryValue)} nilai persediaan`,
      `${formatNumber(dead)} SKU stok mati siap dicairkan untuk menambah kas`,
    ],
    source: "get_kpis, get_dead_stock",
    calc: [
      { label: "Kas sekarang", value: money(k.cashOnHand) },
      { label: "Runway", value: days(k.runwayDays) },
      { label: "Nilai persediaan", value: money(k.inventoryValue) },
      { label: "Nilai stok mati", value: money(k.deadStockValue) },
    ],
  };
}

/** Staf hanya boleh menanyakan stok/produk; topik kas, prive, dan laba ditolak. */
function staffRefusal(ctx: Context): Answer {
  const dead = deadStockList(ctx, 12);
  const low = lowStockList(ctx, 12);
  const deadUnits = dead.reduce((total, m) => total + m.qty, 0);

  return {
    body:
      "Di luar wewenang peran staf. Pertanyaan tentang kas, prive, laba, dan margin hanya bisa dijawab untuk pemilik. " +
      "Silakan tanyakan hal yang berkaitan dengan stok dan produk, misalnya barang yang menahan uang atau stok yang menipis. " +
      "Semua pertanyaan tetap tercatat di audit log.",
    points: [
      `${formatNumber(dead.length)} SKU stok mati - ${formatNumber(deadUnits)} unit belum laku 60 hari`,
      `${formatNumber(low.length)} SKU berada di bawah titik pesan ulang`,
      "Minta persetujuan pemilik lewat PIN untuk melihat angka kas",
    ],
    source: "kebijakan peran, get_dead_stock",
    calc: [],
  };
}

type Rule = { test: RegExp; build: (ctx: Context) => Answer };

/** Jawaban terdekat dipilih dari kata kunci, bukan dari model bahasa. */
const RULES: Rule[] = [
  { test: /(stok mati|mati|menahan|obsolete|tidak laku|lama tidak laku)/i, build: deadStockAnswer },
  { test: /(prive|dipotong|potong|simulasi|skenario|what.?if)/i, build: runwayAnswer },
  { test: /(belanja|reorder|restok|kulak|pesan ulang|open to buy|kulakan)/i, build: reorderAnswer },
  { test: /(diskon|potongan harga|bawah hpp|di bawah harga pokok)/i, build: discountAnswer },
  { test: /(margin|laba|untung|gmroi)/i, build: marginAnswer },
  { test: /(ulasan|review|rating|google)/i, build: reviewAnswer },
  { test: /(kas|runway|burn|tunai|kehabisan|uang)/i, build: cashAnswer },
  { test: /(stok|barang|produk|sku|habis|imei|aksesori)/i, build: deadStockAnswer },
];

const SENSITIVE = /(kas|prive|laba|untung|margin|beban|utang|piutang|omset|bank|gaji|pajak|runway|burn)/i;
const STAFF_ALLOWED = /(stok|barang|produk|sku|habis|imei|aksesori|voucher|mati|menahan|reorder|pesan ulang|restok)/i;

function answerFor(ctx: Context, question: string, role: Role): Answer {
  if (role === "staff" && (SENSITIVE.test(question) || !STAFF_ALLOWED.test(question))) {
    return staffRefusal(ctx);
  }
  const rule = RULES.find((r) => r.test.test(question));
  return rule ? rule.build(ctx) : helpAnswer(ctx);
}

/* -------------------------------------------------------------- komponen */

export default function AiAnalystPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const ctx = useFrizzy((s) => s.ctx);
  const data = useFrizzy((s) => s.data);
  const hydrate = useFrizzy((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <SectionTitle
          eyebrow="Analitik"
          title="AI Analyst"
          hint="AI menjelaskan, aturan menghitung. Tanpa API key dan tanpa panggilan jaringan."
        />
        <Alert
          tone="danger"
          title="Data gagal dimuat"
          action={
            <Button variant="secondary" size="sm" onClick={() => void hydrate()}>
              Coba lagi
            </Button>
          }
        >
          {error ?? "Penyebab tidak diketahui."} Semua perhitungan di halaman ini butuh data konter yang sudah dimuat.
        </Alert>
      </div>
    );
  }

  if (status !== "ready" || !ctx || !data) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <SectionTitle
          eyebrow="Analitik"
          title="AI Analyst"
          hint="AI menjelaskan, aturan menghitung. Tanpa API key dan tanpa panggilan jaringan."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Skeleton className="h-[60vh] w-full" />
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return <AiAnalyst ctx={ctx} data={data} />;
}

function AiAnalyst({ ctx, data }: { ctx: Context; data: Dataset }) {
  const role = useFrizzy((s) => s.role);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const recovery = useMemo(() => recoveryScore(ctx), [ctx]);
  const facts = useMemo(() => factsForAi(ctx), [ctx]);
  const asked = useMemo(() => messages.filter((m) => m.from === "user"), [messages]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const send = (text: string) => {
    const question = text.trim();
    if (question.length === 0) return;
    const answer = answerFor(ctx, question, role);
    setMessages((prev) => [
      ...prev,
      { id: nextId(), from: "user", body: question, answer: null },
      { id: nextId(), from: "assistant", body: answer.body, answer },
    ]);
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <SectionTitle
        eyebrow="Analitik"
        title="AI Analyst"
        hint="AI menjelaskan, aturan menghitung. Setiap angka dihitung mesin metrik di perangkat ini, tanpa API key dan tanpa panggilan jaringan."
        right={
          <Badge tone={recovery.band === "sehat" ? "ok" : recovery.band === "waspada" ? "warn" : "danger"}>
            Skor pemulihan {formatNumber(recovery.score)} - {recovery.band}
          </Badge>
        }
      />

      <DailyCashBrief ctx={ctx} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------- panel chat */}
        <Card className="flex min-h-[60vh] flex-col">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ChatCircle size={18} weight="fill" className="text-accent" />
                Tanya data konter
              </span>
            }
            hint="Empat pertanyaan saran di bawah sudah dihitung dari data 30 hari terakhir. Pertanyaan bebas akan dicocokkan ke metrik terdekat."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                disabled={messages.length === 0}
                icon={<Sparkle size={15} />}
              >
                Bersihkan
              </Button>
            }
          />
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Percakapan dengan AI Analyst"
            className="scroll-y min-h-0 flex-1 space-y-3 px-5 py-4"
          >
            {messages.length === 0 ? (
              <EmptyState
                icon={<Robot size={30} />}
                title="Belum ada pertanyaan"
                body="Mulai dari salah satu pertanyaan saran di bawah, atau tulis pertanyaan sendiri tentang kas, stok, belanja, prive, diskon, margin, dan ulasan."
              />
            ) : (
              messages.map((m) =>
                m.from === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-[10px] bg-accent-soft px-4 py-2.5 text-[13.5px] font-medium text-accent">
                      {m.body}
                    </p>
                  </div>
                ) : (
                  <AssistantBubble key={m.id} answer={m.answer ?? { body: m.body, points: [], source: "", calc: [] }} />
                )
              )
            )}
          </div>
          <div className="hairline space-y-3 px-5 py-4">
            {role === "staff" ? (
              <p className="text-[12px] leading-snug text-warning">
                Peran staf: hanya pertanyaan stok dan produk yang dijawab. Pertanyaan tentang kas, prive, dan laba akan ditolak.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-left text-[12px] font-medium text-text-muted transition-colors hover:text-accent"
                >
                  <Lightbulb size={13} className="shrink-0" />
                  {s}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <div className="flex-1">
                <Input
                  label="Pertanyaan bebas"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="mis. kenapa laba kotor turun bulan ini?"
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                aria-label="Kirim pertanyaan"
                disabled={draft.trim().length === 0}
                icon={<PaperPlaneTilt size={16} weight="fill" />}
              >
                Kirim
              </Button>
            </form>
          </div>
        </Card>

        {/* ------------------------------------------------ panel fakta */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Fakta yang dipakai"
              hint="Angka yang dikirim ke narator. AI tidak pernah menghitung, hanya membaca tabel ini."
            />
            <CardBody className="space-y-3">
              <FactTable facts={facts} />
              <div className="rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="label-caps">Pemakaian token</span>
                  <span className="num text-[12px] text-text-muted">1.240 / 4.000 (contoh)</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <div className="h-1.5 rounded-full" style={{ width: "31%", backgroundColor: "var(--accent)" }} />
                </div>
                <p className="mt-2 text-[11.5px] leading-snug text-text-muted">
                  Angka contoh, bukan tagihan nyata. Batas anggaran bisa diatur di halaman Pengaturan.
                </p>
              </div>
              <Alert tone="info" title="AI tidak pernah menghitung angka">
                Semua nilai berasal dari mesin metrik (get_kpis, get_leaks, get_dead_stock, get_reorder_plan,
                simulate_levers). Model bahasa hanya menyusun kalimat, jadi tidak ada angka yang bisa dikarang.
              </Alert>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Riwayat"
              hint="Pertanyaan yang sudah diajukan pada sesi ini."
              action={<Badge tone="neutral">{formatNumber(asked.length)} pertanyaan</Badge>}
            />
            <CardBody className="pt-1">
              {asked.length === 0 ? (
                <p className="py-2 text-[13px] text-text-muted">Belum ada riwayat.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {asked
                    .slice()
                    .reverse()
                    .slice(0, 6)
                    .map((m) => (
                      <li key={m.id} className="flex items-start gap-2 py-2.5 text-[13px] text-text-muted">
                        <ArrowRight size={14} className="mt-0.5 shrink-0 text-text-muted" />
                        <span className="min-w-0">{m.body}</span>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Aturan main" hint="Kenapa pola ini dipakai di konter." />
            <CardBody>
              <ul className="space-y-2 text-[13px] leading-relaxed text-text-muted">
                <li>Angka dihitung mesin metrik dengan aritmetika deterministik, bukan oleh model bahasa.</li>
                <li>Setiap jawaban menyebut alat yang dipakai agar bisa ditelusuri ulang.</li>
                <li>Tombol &quot;Tampilkan perhitungan&quot; membuka nilai input mentah yang dipakai.</li>
                <li>
                  Data konter {data.profile.name} tidak pernah meninggalkan perangkat pada demo ini; di produksi
                  redaksi PII aktif secara default.
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ answer }: { answer: Answer }) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
        aria-hidden="true"
      >
        <Robot size={17} weight="fill" />
      </span>
      <div className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-4 py-3">
        <p className="measure text-[13.5px] leading-relaxed">{answer.body}</p>
        {answer.points.length > 0 ? (
          <ul className="mt-2.5 space-y-1">
            {answer.points.map((p, i) => (
              <li key={`${i}-${p}`} className="num flex gap-2 text-[12.5px] leading-relaxed text-text-muted">
                <span aria-hidden="true" className="shrink-0">
                  &bull;
                </span>
                <span className="min-w-0">{p}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {answer.calc.length > 0 ? (
          <details className="mt-3 rounded-[10px] border border-border px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-medium text-accent">
              Tampilkan perhitungan
            </summary>
            <div className="scroll-x mt-2">
              <table className="w-full min-w-[280px] text-left">
                <caption className="sr-only">Nilai input yang dipakai untuk menghitung jawaban ini</caption>
                <tbody>
                  {answer.calc.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-0">
                      <th scope="row" className="py-1.5 pr-4 text-left text-[12px] font-normal text-text-muted">
                        {row.label}
                      </th>
                      <td className="num py-1.5 text-right text-[12px]">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-text-muted">
          <Calculator size={13} className="shrink-0" />
          Dihitung dari: <span className="num">{answer.source}</span>
        </p>
      </div>
    </div>
  );
}

function DailyCashBrief({ ctx }: { ctx: Context }) {
  const k = ctx.kpis;
  const recovery = recoveryScore(ctx);
  const yesterday = ctx.daily.at(-2);
  const weekAgo = ctx.daily.at(-8);
  const runwayPrev = weekAgo ? weekAgo.runwayDays : k.runwayDays;
  const delta =
    Number.isFinite(k.runwayDays) && Number.isFinite(runwayPrev) ? Math.round(k.runwayDays - runwayPrev) : 0;
  const deadUnits = [...ctx.byProduct.values()].filter((m) => m.health === "dead" || m.health === "obsolete");

  return (
    <Card>
      <CardHeader
        title="Daily Cash Brief"
        hint="Lima baris ringkasan yang sama setiap pagi, semuanya dari metrik yang bisa ditelusuri."
        action={
          <Badge tone={delta < 0 ? "danger" : delta > 0 ? "ok" : "neutral"}>
            {delta === 0 ? "Runway stabil" : delta > 0 ? `Runway +${formatNumber(delta)} hari` : `Runway ${formatNumber(delta)} hari`}
          </Badge>
        }
      />
      <CardBody className="pt-1">
        <DataRow
          label="Penjualan kemarin"
          value={formatRupiah(yesterday ? yesterday.sales : 0)}
          hint={yesterday ? `Hari penuh terakhir, ${formatDateShort(yesterday.date)}` : "Belum ada hari penuh"}
        />
        <DataRow
          label="True Burn"
          value={`${formatRupiah(k.trueBurnPerDay)}/hari`}
          hint="Rata-rata bergulir 30 hari dari laba kotor dikurangi beban dan prive"
        />
        <DataRow
          label="Perubahan runway"
          value={days(k.runwayDays)}
          hint={`${delta >= 0 ? "+" : ""}${formatNumber(delta)} hari dibanding 7 hari lalu (${days(runwayPrev)})`}
        />
        <DataRow
          label="Stok mati"
          value={formatRupiah(k.deadStockValue)}
          hint={`${formatNumber(deadUnits.length)} SKU tanpa penjualan 60 hari atau lebih`}
        />
        <DataRow
          label="3 aksi teratas"
          strong
          value={
            <ol className="space-y-1 text-left">
              {recovery.topActions.map((action, i) => (
                <li key={action} className="text-[12.5px] leading-snug text-text-muted">
                  <span className="num mr-1">{i + 1}.</span>
                  {action}
                </li>
              ))}
            </ol>
          }
        />
      </CardBody>
    </Card>
  );
}

type FactFormat = "rupiah" | "number" | "percent" | "ratio" | "days" | "text";

const FACT_ROWS: { key: string; label: string; format: FactFormat }[] = [
  { key: "kas_sekarang", label: "Kas sekarang", format: "rupiah" },
  { key: "nilai_stok", label: "Nilai stok", format: "rupiah" },
  { key: "stok_mati", label: "Stok mati", format: "rupiah" },
  { key: "true_burn_per_hari", label: "True Burn per hari", format: "rupiah" },
  { key: "runway_hari", label: "Runway", format: "days" },
  { key: "penjualan_30_hari", label: "Penjualan 30 hari", format: "rupiah" },
  { key: "laba_kotor_30_hari", label: "Laba kotor 30 hari", format: "rupiah" },
  { key: "margin_kotor_persen", label: "Margin kotor", format: "percent" },
  { key: "beban_30_hari", label: "Beban 30 hari", format: "rupiah" },
  { key: "prive_30_hari", label: "Prive 30 hari", format: "rupiah" },
  { key: "rasio_replenishment", label: "Rasio replenishment", format: "ratio" },
  { key: "titik_impas_penjualan_per_hari", label: "Titik impas per hari", format: "rupiah" },
  { key: "kebocoran_diskon_persen", label: "Kebocoran diskon", format: "percent" },
  { key: "transaksi_di_bawah_hpp", label: "Transaksi di bawah HPP", format: "number" },
  { key: "dio_hari", label: "DIO", format: "days" },
  { key: "gmroi", label: "GMROI", format: "ratio" },
  { key: "attach_rate_persen", label: "Attach rate", format: "percent" },
  { key: "temuan_kebocoran", label: "Temuan kebocoran", format: "number" },
  { key: "open_to_buy", label: "Open to buy", format: "rupiah" },
  { key: "kandidat_reorder", label: "Kandidat reorder", format: "number" },
];

function formatFact(value: number | string, format: FactFormat): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "rupiah":
      return formatRupiah(value);
    case "percent":
      return formatPct(value, 2);
    case "ratio":
      return value.toLocaleString("id-ID", { maximumFractionDigits: 3 });
    case "days":
      return Number.isFinite(value) ? `${formatNumber(value)} hari` : "tak terbatas";
    case "text":
      return String(value);
    default:
      return formatNumber(value);
  }
}

function FactTable({ facts }: { facts: Record<string, number | string> }) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[280px] text-left">
        <caption className="sr-only">Fakta metrik yang dipakai AI Analyst beserta nilainya</caption>
        <tbody>
          {FACT_ROWS.map((row) => {
            const raw = facts[row.key];
            if (raw === undefined) return null;
            return (
              <tr key={row.key} className="border-b border-border last:border-0">
                <th scope="row" className="py-1.5 pr-4 text-left text-[12px] font-normal text-text-muted">
                  {row.label}
                </th>
                <td className="num py-1.5 text-right text-[12px]">{formatFact(raw, row.format)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
