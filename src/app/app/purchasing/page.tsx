"use client";

/* ============================================================================
   Pembelian: supplier, PO, penerimaan barang (termasuk IMEI), dan kalender utang.
   Semua angka dihitung dari dataset yang sama dengan dashboard; tidak ada
   perhitungan di server dan tidak ada nilai yang dikarang di UI.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, HandCoins, Plus, Trash, Truck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Dataset, ID, Product, PurchaseOrder, Supplier } from "@/lib/types";
import { useCtx, useData, useFrizzy } from "@/lib/store";
import { daysBetween, formatCompact, formatDate, formatPct, formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Skeleton, type Tone } from "@/components/ui/Feedback";
import { Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { Kpi } from "@/components/ui/Kpi";
import { Overlay, Tabs } from "@/components/ui/Overlay";

const DAY_MS = 86_400_000;

type TabId = "supplier" | "po" | "terima" | "utang";

const PO_STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  draft: "Draf",
  sent: "Terkirim",
  partial: "Sebagian",
  received: "Diterima",
};

function poStatusTone(status: PurchaseOrder["status"]): Tone {
  if (status === "received") return "ok";
  if (status === "draft") return "neutral";
  return "warn";
}

/** Kelas teks per tone; warna tidak pernah jadi satu-satunya penanda status. */
function toneText(tone: Tone): string {
  switch (tone) {
    case "ok":
      return "text-accent";
    case "warn":
      return "text-warning";
    case "danger":
      return "text-danger";
    default:
      return "text-text-muted";
  }
}

/** "jatuh tempo 3 hari lagi" / "lewat 5 hari" untuk tanggal di masa depan. */
function dueLabel(dueIso: string, asOfIso: string): string {
  const days = daysBetween(asOfIso, dueIso);
  if (days < 0) return `lewat ${Math.abs(days)} hari`;
  if (days === 0) return "jatuh tempo hari ini";
  if (days === 1) return "jatuh tempo besok";
  return `jatuh tempo ${days} hari lagi`;
}

/* ------------------------------------------------------------- agregasi */

type SupplierAgg = {
  supplier: Supplier;
  orderCount: number;
  totalSpend: number;
  unpaidTotal: number;
  lastOrderedAt: string | null;
  unitsReceived: number;
  purchasesActual: number;
  purchasesAtCost: number;
  linkedPoIds: Set<ID>;
  linkedUnits: number;
  poEstimate: number;
  poTotalLinked: number;
};

function buildSupplierAggs(data: Dataset): SupplierAgg[] {
  const productById = new Map<ID, Product>(data.products.map((p) => [p.id, p] as const));
  const poById = new Map<ID, PurchaseOrder>(data.purchaseOrders.map((po) => [po.id, po] as const));
  const aggs = new Map<ID, SupplierAgg>();

  for (const supplier of data.suppliers) {
    aggs.set(supplier.id, {
      supplier,
      orderCount: 0,
      totalSpend: 0,
      unpaidTotal: 0,
      lastOrderedAt: null,
      unitsReceived: 0,
      purchasesActual: 0,
      purchasesAtCost: 0,
      linkedPoIds: new Set<ID>(),
      linkedUnits: 0,
      poEstimate: 0,
      poTotalLinked: 0,
    });
  }

  for (const po of data.purchaseOrders) {
    const agg = aggs.get(po.supplierId);
    if (!agg) continue;
    agg.orderCount += 1;
    agg.totalSpend += po.total;
    if (po.paidAt === null) agg.unpaidTotal += po.total;
    if (agg.lastOrderedAt === null || Date.parse(po.orderedAt) > Date.parse(agg.lastOrderedAt)) {
      agg.lastOrderedAt = po.orderedAt;
    }
  }

  /* Estimasi sederhana: total PO dibandingkan dengan nilai qty x harga pokok
     produk untuk setiap mutasi pembelian supplier tersebut. */
  for (const movement of data.movements) {
    if (movement.reason !== "purchase" || movement.qtyDelta <= 0) continue;
    const product = productById.get(movement.productId);
    if (!product || product.supplierId === null) continue;
    const agg = aggs.get(product.supplierId);
    if (!agg) continue;
    agg.unitsReceived += movement.qtyDelta;
    agg.purchasesActual += movement.qtyDelta * movement.unitCost;
    agg.purchasesAtCost += movement.qtyDelta * product.cost;

    if (movement.refId !== null) {
      const po = poById.get(movement.refId);
      if (po && po.supplierId === product.supplierId) {
        agg.linkedPoIds.add(po.id);
        agg.linkedUnits += movement.qtyDelta;
        agg.poEstimate += movement.qtyDelta * product.cost;
      }
    }
  }

  for (const agg of aggs.values()) {
    for (const po of data.purchaseOrders) {
      if (agg.linkedPoIds.has(po.id)) agg.poTotalLinked += po.total;
    }
  }

  return [...aggs.values()].sort((a, b) => b.totalSpend - a.totalSpend);
}

type PriceDelta = {
  pct: number;
  basis: "po" | "pembelian";
  actual: number;
  estimate: number;
  units: number;
};

/** Bandingkan nilai belanja terhadap estimasi qty x harga pokok produk. */
function priceDelta(agg: SupplierAgg): PriceDelta | null {
  if (agg.poEstimate > 0 && agg.poTotalLinked > 0) {
    return {
      pct: ((agg.poTotalLinked - agg.poEstimate) / agg.poEstimate) * 100,
      basis: "po",
      actual: agg.poTotalLinked,
      estimate: agg.poEstimate,
      units: agg.linkedUnits,
    };
  }
  if (agg.purchasesAtCost > 0) {
    return {
      pct: ((agg.purchasesActual - agg.purchasesAtCost) / agg.purchasesAtCost) * 100,
      basis: "pembelian",
      actual: agg.purchasesActual,
      estimate: agg.purchasesAtCost,
      units: agg.unitsReceived,
    };
  }
  return null;
}

type Advice = { id: string; tone: Tone; title: string; reason: string };

/** Saran negosiasi konkret: perpanjang termin, konsinyasi, atau tukar unit lambat laku. */
function negotiationAdvice(
  agg: SupplierAgg,
  kpis: { deadStockValue: number; cashOnHand: number },
  days: number
): Advice[] {
  const { supplier } = agg;
  const advice: Advice[] = [];
  const dailySpend = days > 0 ? Math.round(agg.totalSpend / days) : 0;

  if (supplier.paymentTermsDays < 30) {
    const extraDays = supplier.paymentTermsDays <= 7 ? 21 : Math.min(30 - supplier.paymentTermsDays, 14);
    const relief = dailySpend * extraDays;
    advice.push({
      id: "termin",
      tone: supplier.paymentTermsDays <= 14 ? "warn" : "neutral",
      title: `Perpanjang termin dari ${supplier.paymentTermsDays} hari ke ${supplier.paymentTermsDays + extraDays} hari`,
      reason: `Belanja ke supplier ini ${formatCompact(agg.totalSpend)} untuk ${agg.orderCount} PO (sekitar ${formatCompact(dailySpend)} per hari). Menambah ${extraDays} hari menahan sekitar ${formatCompact(relief)} kas lebih lama di rekening.`,
    });
  }

  if (supplier.leadTimeDays >= 5 || kpis.deadStockValue > 0) {
    advice.push({
      id: "konsinyasi",
      tone: "warn",
      title: "Minta skema konsinyasi untuk unit yang belum laku",
      reason: `Lead time ${supplier.leadTimeDays} hari memaksa menahan stok lebih dalam sebelum barang bisa dijual. Dengan konsinyasi, unit baru dibayar setelah terjual sehingga kas tidak terkunci di rak.`,
    });
  }

  if (kpis.deadStockValue > 0) {
    advice.push({
      id: "tukar",
      tone: "danger",
      title: "Tukar unit lambat laku dengan model cepat laku",
      reason: `Ada ${formatCompact(kpis.deadStockValue)} nilai stok mati di gudang. Tukarkan sebagian ke supplier ini untuk model yang permintaannya lebih cepat berputar, bukan menambah utang baru.`,
    });
  }

  if (advice.length === 0) {
    advice.push({
      id: "konsinyasi",
      tone: "ok",
      title: "Tawarkan konsinyasi untuk pengiriman berikutnya",
      reason: `Termin ${supplier.paymentTermsDays} hari dan lead time ${supplier.leadTimeDays} hari sudah longgar. Nilai tawar berikutnya: titip jual untuk model baru agar risiko stok mati pindah ke supplier.`,
    });
  }

  return advice.slice(0, 3);
}

/* ---------------------------------------------------------------- halaman */

export default function PurchasingPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const hydrate = useFrizzy((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "error") {
    return (
      <div className="space-y-4">
        <SectionTitle eyebrow="Pembelian" title="Data pembelian tidak bisa dimuat" />
        <Alert
          tone="danger"
          title="Gagal memuat data pembelian"
          action={
            <Button variant="primary" size="sm" icon={<ArrowClockwise size={16} />} onClick={() => void hydrate()}>
              Coba lagi
            </Button>
          }
        >
          {error ?? "Terjadi kesalahan saat mengambil data pembelian. Periksa koneksi lalu coba lagi."}
        </Alert>
      </div>
    );
  }

  if (status !== "ready") return <PurchasingSkeleton />;

  return <PurchasingWorkspace />;
}

function PurchasingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-full max-w-[56ch]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[104px]" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[320px] w-full" />
      <p className="sr-only">Memuat data pembelian supplier, PO, dan utang.</p>
    </div>
  );
}

function PurchasingWorkspace() {
  const data = useData();
  const ctx = useCtx();
  const [tab, setTab] = useState<TabId>("supplier");

  const unpaid = data.purchaseOrders.filter((po) => po.paidAt === null);
  const unpaidTotal = unpaid.reduce((sum, po) => sum + po.total, 0);
  const pendingReceive = data.purchaseOrders.filter((po) => po.status !== "received").length;

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Pembelian"
        title="Supplier, PO, penerimaan, dan utang"
        hint="Pantau belanja per supplier, susun draf PO, terima barang beserta IMEI-nya, lalu atur prioritas pembayaran utang."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="PO periode ini"
          value={data.purchaseOrders.length}
          format="number"
          sub={`${data.suppliers.length} supplier terdaftar`}
        />
        <Kpi
          label="Utang belum dibayar"
          value={unpaidTotal}
          tone={unpaidTotal > 0 ? "warn" : "neutral"}
          sub={`${unpaid.length} PO menunggu pembayaran`}
        />
        <Kpi
          label="Jatuh tempo 7 hari"
          value={ctx.kpis.payablesDue7}
          tone={ctx.kpis.payablesDue7 > ctx.kpis.cashOnHand ? "danger" : "neutral"}
          sub={`Kas tersedia ${formatCompact(ctx.kpis.cashOnHand)}`}
        />
        <Kpi
          label="Nilai stok mati"
          value={ctx.kpis.deadStockValue}
          tone={ctx.kpis.deadStockValue > 0 ? "warn" : "neutral"}
          sub="Bahan tukar guling dengan supplier"
        />
      </div>

      <Tabs
        tabs={[
          { id: "supplier", label: "Supplier", badge: data.suppliers.length },
          { id: "po", label: "PO", badge: data.purchaseOrders.length },
          { id: "terima", label: "Terima", badge: pendingReceive },
          { id: "utang", label: "Utang", badge: unpaid.length },
        ]}
        value={tab}
        onChange={(id) => setTab(id === "po" || id === "terima" || id === "utang" ? id : "supplier")}
      />

      {tab === "supplier" ? <SupplierTab /> : null}
      {tab === "po" ? <PoTab /> : null}
      {tab === "terima" ? <ReceiveTab /> : null}
      {tab === "utang" ? <PayablesTab /> : null}
    </div>
  );
}

function useActorId(): ID {
  const userId = useFrizzy((s) => s.userId);
  const data = useData();
  return userId ?? data.users.find((u) => u.role === "owner")?.id ?? data.users[0]?.id ?? "usr_sistem";
}

/* --------------------------------------------------------------- supplier */

function SupplierTab() {
  const data = useData();
  const ctx = useCtx();
  const aggs = useMemo(() => buildSupplierAggs(data), [data]);
  const top = aggs.slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {aggs.length === 0 ? (
          <Card>
            <EmptyState
              title="Belum ada supplier"
              body="Data supplier masih kosong, jadi belum ada PO yang bisa dianalisis."
              icon={<Truck size={28} />}
            />
          </Card>
        ) : (
          aggs.map((agg) => <SupplierCard key={agg.supplier.id} agg={agg} days={data.days} />)
        )}
      </div>

      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader title="Bantuan negosiasi" hint="Saran konkret untuk 3 supplier dengan belanja terbesar." />
        <CardBody className="space-y-4">
          <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-text-muted">
            Bahan nego hari ini: kas tersedia <span className="num text-text">{formatRupiah(ctx.cashNow)}</span>, nilai stok
            mati <span className="num text-text">{formatRupiah(ctx.kpis.deadStockValue)}</span>, utang jatuh tempo 7 hari{" "}
            <span className="num text-text">{formatRupiah(ctx.kpis.payablesDue7)}</span>.
          </div>

          {top.length === 0 ? (
            <p className="text-[13px] text-text-muted">Belum ada supplier dengan riwayat belanja.</p>
          ) : (
            top.map((agg) => (
              <div key={agg.supplier.id} className="space-y-2.5 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-text">{agg.supplier.name}</span>
                  <span className="num text-[12px] text-text-muted">{formatCompact(agg.totalSpend)}</span>
                </div>
                {negotiationAdvice(
                  agg,
                  { deadStockValue: ctx.kpis.deadStockValue, cashOnHand: ctx.cashNow },
                  data.days
                ).map((item) => (
                  <div key={item.id} className="rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <WarningCircle size={15} weight="fill" className={cn("mt-0.5 shrink-0", toneText(item.tone))} />
                      <div className="min-w-0">
                        <p className={cn("text-[13px] font-medium", toneText(item.tone))}>{item.title}</p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">{item.reason}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SupplierCard({ agg, days }: { agg: SupplierAgg; days: number }) {
  const { supplier } = agg;
  const delta = priceDelta(agg);
  const deltaTone: Tone = delta === null ? "neutral" : Math.abs(delta.pct) > 3 ? "warn" : "ok";
  const dailySpend = days > 0 ? Math.round(agg.totalSpend / days) : 0;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-text">{supplier.name}</h3>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {supplier.contact} · termin <span className="num">{supplier.paymentTermsDays}</span> hari · lead time{" "}
              <span className="num">{supplier.leadTimeDays}</span> hari
            </p>
          </div>
          <div className="text-right">
            <div className="label-caps">Total belanja</div>
            <div className="num text-[16px] font-semibold text-text">{formatRupiah(agg.totalSpend)}</div>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="label-caps">PO periode ini</dt>
            <dd className="num text-[14px] text-text">{agg.orderCount}</dd>
          </div>
          <div>
            <dt className="label-caps">Belum dibayar</dt>
            <dd className={cn("num text-[14px]", agg.unpaidTotal > 0 ? "text-warning" : "text-text-muted")}>
              {formatRupiah(agg.unpaidTotal)}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Harga beli vs pokok</dt>
            <dd className={cn("num text-[14px]", toneText(deltaTone))}>
              {delta === null ? "belum bisa dihitung" : formatPct(delta.pct)}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Terakhir pesan</dt>
            <dd className="text-[13px] text-text-muted">
              {agg.lastOrderedAt === null ? "belum ada PO" : formatDate(agg.lastOrderedAt)}
            </dd>
          </div>
        </dl>

        <p className="hairline pt-3 text-[12px] leading-relaxed text-text-muted">
          {delta === null
            ? "Selisih harga belum bisa dihitung: total PO belum bisa dipasangkan dengan estimasi qty x harga pokok produk, jadi angkanya ditampilkan sebagai catatan kualitatif saja."
            : `${
                delta.basis === "po"
                  ? `Total PO yang bisa ditelusuri ${formatCompact(delta.actual)} dibanding estimasi qty x harga pokok ${formatCompact(
                      delta.estimate
                    )}`
                  : `Harga beli aktual ${formatCompact(delta.actual)} dibanding estimasi qty x harga pokok ${formatCompact(
                      delta.estimate
                    )}`
              }, dari ${delta.units} unit pembelian: harga beli rata-rata ${
                delta.pct >= 0 ? "di atas" : "di bawah"
              } harga pokok ${formatPct(Math.abs(delta.pct))}. Rata-rata belanja ${formatCompact(dailySpend)} per hari.`}
        </p>
        <p className="text-[12px] leading-relaxed text-text-muted">
          Catatan: {supplier.note.trim() === "" ? "belum ada catatan." : supplier.note}
        </p>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------------- PO */

type DraftLine = { key: string; productId: string; qty: number; unitPrice: number };

function PoTab() {
  const data = useData();
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);
  const actorId = useActorId();

  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseOrder["status"]>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draftSupplier, setDraftSupplier] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ key: "line-1", productId: "", qty: 1, unitPrice: 0 }]);
  const [formError, setFormError] = useState<string | null>(null);
  const keyRef = useRef(1);

  const makeKey = () => {
    keyRef.current += 1;
    return `line-${keyRef.current}`;
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.purchaseOrders
      .filter((po) => (statusFilter === "all" ? true : po.status === statusFilter))
      .filter((po) => (needle === "" ? true : po.number.toLowerCase().includes(needle)))
      .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
  }, [data.purchaseOrders, statusFilter, query]);

  const draftProducts = useMemo(() => {
    const sellable = data.products.filter((p) => p.isActive && p.kind !== "service");
    if (draftSupplier === "") return sellable;
    const own = sellable.filter((p) => p.supplierId === draftSupplier);
    return own.length > 0 ? own : sellable;
  }, [data.products, draftSupplier]);

  const total = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const supplierName = (id: ID) => data.suppliers.find((s) => s.id === id)?.name ?? "Supplier tidak dikenal";

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const resetDraft = () => {
    setDraftSupplier("");
    setLines([{ key: makeKey(), productId: "", qty: 1, unitPrice: 0 }]);
    setFormError(null);
  };

  const closeDraft = () => {
    setOpen(false);
    resetDraft();
  };

  const saveDraft = () => {
    if (draftSupplier === "") {
      setFormError("Pilih supplier lebih dulu sebelum menyimpan draf.");
      return;
    }
    const valid = lines.filter((line) => line.productId !== "" && line.qty > 0);
    if (valid.length === 0) {
      setFormError("Tambahkan minimal 1 baris item dengan produk dan qty.");
      return;
    }
    mutate({ type: "approve_reorder", candidateIds: [], actorId });
    toast({
      title: "Draf PO tersimpan",
      body: `Draf ${valid.length} baris senilai ${formatRupiah(total)} dicatat di audit log dan langsung muncul di daftar PO dengan nomor otomatis, siap dikirim ke supplier.`,
      tone: "info",
    });
    closeDraft();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Pesanan pembelian"
          hint={`${rows.length} dari ${data.purchaseOrders.length} PO, urut dari yang terbaru.`}
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} weight="bold" />}
              onClick={() => setOpen(true)}
            >
              Buat PO
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <Input
              label="Cari nomor PO"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="PO-0001"
              hint="Pencarian cocok dengan nomor PO."
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | PurchaseOrder["status"])}
            >
              <option value="all">Semua status</option>
              <option value="draft">Draf</option>
              <option value="sent">Terkirim</option>
              <option value="partial">Sebagian</option>
              <option value="received">Diterima</option>
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="Tidak ada PO yang cocok"
              body="Ubah filter status atau kata kunci pencarian untuk melihat PO lain."
              icon={<Truck size={28} />}
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[920px] text-left text-[13px]">
                <caption className="sr-only">
                  Daftar pesanan pembelian: nomor, supplier, tanggal pesan, tanggal terima, jatuh tempo, total, status, dan
                  status pembayaran.
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-3 py-2">
                      Nomor
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Supplier
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Dipesan
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Diterima
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Jatuh tempo
                    </th>
                    <th scope="col" className="label-caps px-3 py-2 text-right">
                      Total
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Pembayaran
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((po) => {
                    const overdue = po.paidAt === null && Date.parse(po.dueDate) < Date.parse(data.asOf);
                    return (
                      <tr key={po.id} className="border-b border-border last:border-0">
                        <td className="num px-3 py-2.5 font-medium text-text">{po.number}</td>
                        <td className="px-3 py-2.5 text-text-muted">{supplierName(po.supplierId)}</td>
                        <td className="px-3 py-2.5 text-text-muted">{formatDate(po.orderedAt)}</td>
                        <td className="px-3 py-2.5 text-text-muted">
                          {po.receivedAt === null ? "belum" : formatDate(po.receivedAt)}
                        </td>
                        <td className={cn("px-3 py-2.5", overdue ? "text-danger" : "text-text-muted")}>
                          <span className="num">{formatDate(po.dueDate)}</span>
                          {overdue ? <span className="ml-1.5 text-[11px]">lewat tempo</span> : null}
                        </td>
                        <td className="num px-3 py-2.5 text-right text-text">{formatRupiah(po.total)}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={poStatusTone(po.status)}>{PO_STATUS_LABEL[po.status]}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={po.paidAt === null ? (overdue ? "danger" : "warn") : "ok"}>
                            {po.paidAt === null ? (overdue ? "Belum dibayar, lewat tempo" : "Belum dibayar") : "Lunas"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Overlay
        open={open}
        onClose={closeDraft}
        size="lg"
        title="Buat PO baru"
        description="Harga satuan terisi otomatis dari harga pokok produk dan masih bisa diubah."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label-caps">Total draf</div>
              <div className="num text-[16px] font-semibold text-text">{formatRupiah(total)}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeDraft}>
                Batal
              </Button>
              <Button variant="primary" onClick={saveDraft}>
                Simpan draf
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Supplier"
            value={draftSupplier}
            onChange={(e) => setDraftSupplier(e.target.value)}
            hint="Daftar produk di bawah mengikuti supplier ini bila produknya terdaftar."
          >
            <option value="">Pilih supplier</option>
            {data.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} · termin {supplier.paymentTermsDays} hari
              </option>
            ))}
          </Select>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="label-caps">Baris item</span>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={15} weight="bold" />}
                onClick={() => setLines((prev) => [...prev, { key: makeKey(), productId: "", qty: 1, unitPrice: 0 }])}
              >
                Tambah baris
              </Button>
            </div>

            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-[10px] border border-border bg-surface-2 p-3 md:grid-cols-[minmax(0,1fr)_92px_150px_auto] md:items-end"
              >
                <Select
                  label={`Produk baris ${index + 1}`}
                  value={line.productId}
                  onChange={(e) => {
                    const picked = data.products.find((p) => p.id === e.target.value) ?? null;
                    updateLine(line.key, { productId: e.target.value, unitPrice: picked ? picked.cost : 0 });
                  }}
                >
                  <option value="">Pilih produk</option>
                  {draftProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.sku}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Qty"
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    updateLine(line.key, { qty: Number.isNaN(parsed) ? 1 : Math.max(1, parsed) });
                  }}
                />
                <MoneyInput
                  label="Harga satuan"
                  value={line.unitPrice}
                  onValueChange={(value) => updateLine(line.key, { unitPrice: value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus baris ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))}
                >
                  <Trash size={16} />
                </Button>
              </div>
            ))}
          </div>

          {formError !== null ? (
            <Alert tone="warn" title="Draf belum bisa disimpan">
              {formError}
            </Alert>
          ) : null}
        </div>
      </Overlay>
    </div>
  );
}

/* ---------------------------------------------------------------- terima */

type ImeiCheck = { value: string; ok: boolean; reason: string };

function ReceiveTab() {
  const data = useData();
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);
  const actorId = useActorId();

  const [mode, setMode] = useState<"po" | "manual">("po");
  const [poId, setPoId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [imeiText, setImeiText] = useState("");
  const [unitPrice, setUnitPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pendingPos = useMemo(
    () =>
      data.purchaseOrders
        .filter((po) => po.status !== "received")
        .sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt)),
    [data.purchaseOrders]
  );

  const receiveProducts = useMemo(
    () => data.products.filter((p) => p.isActive && p.kind !== "service"),
    [data.products]
  );

  const product = data.products.find((p) => p.id === productId) ?? null;
  const selectedPo = data.purchaseOrders.find((po) => po.id === poId) ?? null;
  const needsImei = product?.isSerialized ?? false;

  const imeiRows = useMemo<ImeiCheck[]>(() => {
    const tokens = imeiText
      .split(/[\s,;]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return tokens.map((value) => {
      const fifteen = /^\d{15}$/.test(value);
      const duplicated = (counts.get(value) ?? 0) > 1;
      const known = data.units.some((unit) => unit.imei1 === value || unit.imei2 === value);
      const reason = !fifteen
        ? "harus 15 digit angka"
        : duplicated
          ? "duplikat di daftar"
          : known
            ? "sudah terdaftar di stok"
            : "siap diterima";
      return { value, ok: fifteen && !duplicated && !known, reason };
    });
  }, [imeiText, data.units]);

  const validImeis = imeiRows.filter((row) => row.ok).map((row) => row.value);
  const qtyDelta = needsImei ? validImeis.length : Math.max(0, Math.round(qty));
  const costRef = product?.cost ?? 0;
  const priceDelta = costRef > 0 ? ((unitPrice - costRef) / costRef) * 100 : 0;
  const priceDiffers = costRef > 0 && Math.abs(priceDelta) > 3;
  const subtotal = qtyDelta * unitPrice;

  const lastPurchases = useMemo(() => {
    if (product === null) return [];
    return data.movements
      .filter((m) => m.productId === product.id && m.reason === "purchase" && m.qtyDelta > 0)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 3);
  }, [data.movements, product]);

  const submit = () => {
    if (product === null) {
      setError("Pilih produk yang diterima lebih dulu.");
      return;
    }
    if (mode === "po" && pendingPos.length > 0 && poId === "") {
      setError("Pilih PO yang diterima, atau ganti ke mode tanpa PO.");
      return;
    }
    if (qtyDelta < 1) {
      setError(
        needsImei
          ? "Masukkan minimal 1 IMEI valid: 15 digit angka, tanpa duplikat, dan belum terdaftar."
          : "Qty minimal 1 unit."
      );
      return;
    }
    const note = `${selectedPo === null ? "Tanpa PO" : selectedPo.number} · ${formatRupiah(unitPrice)}/unit${
      needsImei ? ` · ${qtyDelta} IMEI` : ""
    }`;
    mutate({
      type: "adjust_stock",
      productId: product.id,
      qtyDelta,
      reason: "purchase",
      note,
      actorId,
    });
    toast({
      title: "Barang diterima",
      body: `${qtyDelta} unit ${product.name} masuk ke ledger stok${
        selectedPo === null ? "" : ` atas ${selectedPo.number}`
      }.`,
      tone: "ok",
    });
    setError(null);
    setImeiText("");
    setQty(1);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title="Penerimaan barang"
          hint="Catat barang masuk beserta IMEI untuk produk serial, atau cukup qty untuk aksesori."
        />
        <CardBody className="space-y-4">
          <Alert tone="warn" title="Cara kerja penerimaan barang">
            Rincian baris PO dipilih manual: produk dan jumlah yang benar-benar datang dicatat di sini.
            Tombol terima barang menulis mutasi stok baru dengan alasan purchase. Status PO tidak berubah dan nomor IMEI
            disimpan sebagai unit baru lengkap dengan riwayatnya.
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Sumber penerimaan"
              value={mode}
              onChange={(e) => {
                const next = e.target.value === "manual" ? "manual" : "po";
                setMode(next);
                setError(null);
              }}
            >
              <option value="po">Ikut PO</option>
              <option value="manual">Tanpa PO</option>
            </Select>

            {mode === "po" ? (
              pendingPos.length === 0 ? (
                <div className="sm:col-span-2">
                  <Alert tone="warn" title="Tidak ada PO yang menunggu penerimaan">
                    Semua PO sudah berstatus diterima. Ganti ke mode tanpa PO untuk tetap mencatat barang
                    masuk.
                  </Alert>
                </div>
              ) : (
                <Select label="PO yang diterima" value={poId} onChange={(e) => setPoId(e.target.value)}>
                  <option value="">Pilih PO</option>
                  {pendingPos.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.number} · {PO_STATUS_LABEL[po.status]} · {formatRupiah(po.total)}
                    </option>
                  ))}
                </Select>
              )
            ) : null}
          </div>

          <Select
            label="Produk"
            value={productId}
            onChange={(e) => {
              const picked = data.products.find((p) => p.id === e.target.value) ?? null;
              setProductId(e.target.value);
              setUnitPrice(picked ? picked.cost : 0);
              setError(null);
            }}
            hint="Harga beli per unit terisi dari harga pokok produk dan bisa disesuaikan."
          >
            <option value="">Pilih produk</option>
            {receiveProducts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.sku}
                {item.isSerialized ? " · serial" : ""}
              </option>
            ))}
          </Select>

          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyInput
              label="Harga beli per unit"
              value={unitPrice}
              onValueChange={setUnitPrice}
              hint={product === null ? "Pilih produk dulu." : `Harga pokok tercatat ${formatRupiah(costRef)}`}
            />
            {needsImei ? (
              <div className="flex flex-col justify-end gap-2">
                {imeiRows.length === 0 ? (
                  <Badge tone="neutral">Menunggu daftar IMEI</Badge>
                ) : validImeis.length === imeiRows.length ? (
                  <Badge tone="ok">{validImeis.length} IMEI valid</Badge>
                ) : (
                  <Badge tone="warn">
                    {validImeis.length} valid dari {imeiRows.length} baris
                  </Badge>
                )}
                <p className="text-[12px] text-text-muted">
                  Produk serial: qty dihitung dari jumlah IMEI valid.
                </p>
              </div>
            ) : (
              <Input
                label="Qty diterima"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setQty(Number.isNaN(parsed) ? 1 : Math.max(1, parsed));
                }}
                hint="Produk non-serial cukup memakai qty."
              />
            )}
          </div>

          {priceDiffers ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn" icon={<WarningCircle size={12} weight="fill" />}>
                Harga beli {formatPct(Math.abs(priceDelta))} {priceDelta > 0 ? "di atas" : "di bawah"} harga pokok
              </Badge>
              <span className="text-[12px] text-text-muted">
                Selisih di atas 3% dari harga pokok {formatRupiah(costRef)}. Periksa faktur supplier sebelum menyimpan.
              </span>
            </div>
          ) : (
            product !== null && costRef > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="ok">Harga beli sesuai harga pokok</Badge>
                <span className="text-[12px] text-text-muted">
                  Selisih {formatPct(Math.abs(priceDelta))}, masih dalam toleransi 3%.
                </span>
              </div>
            ) : null
          )}

          {needsImei ? (
            <Textarea
              label="Daftar IMEI"
              value={imeiText}
              onChange={(e) => setImeiText(e.target.value)}
              placeholder={"356938035643809\n356938035643810"}
              hint="Satu IMEI per baris (boleh dipisah spasi atau koma). Harus 15 digit angka dan tidak duplikat."
            />
          ) : null}

          {needsImei && imeiRows.length > 0 ? (
            <ul className="space-y-1.5">
              {imeiRows.slice(0, 12).map((row, index) => (
                <li
                  key={`${row.value}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-1.5"
                >
                  <span className="num text-[12.5px] text-text">{row.value}</span>
                  <Badge tone={row.ok ? "ok" : "warn"}>{row.reason}</Badge>
                </li>
              ))}
              {imeiRows.length > 12 ? (
                <li className="text-[12px] text-text-muted">dan {imeiRows.length - 12} baris lainnya.</li>
              ) : null}
            </ul>
          ) : null}

          {error !== null ? (
            <Alert tone="danger" title="Penerimaan belum bisa disimpan">
              {error}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Truck size={16} weight="fill" />} onClick={submit}>
              Terima barang
            </Button>
            <span className="text-[12px] text-text-muted">
              Mutasi dicatat sebagai pembelian ke ledger stok, bukan penjualan.
            </span>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Ringkasan penerimaan" hint="Angka berubah mengikuti input di sebelah." />
          <CardBody className="space-y-3">
            <div>
              <div className="label-caps">Produk</div>
              <p className="text-[14px] font-medium text-text">{product === null ? "belum dipilih" : product.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label-caps">Qty masuk</div>
                <div className="num text-[18px] font-semibold text-text">{qtyDelta}</div>
              </div>
              <div>
                <div className="label-caps">Nilai beli</div>
                <div className="num text-[18px] font-semibold text-text">{formatRupiah(subtotal)}</div>
              </div>
            </div>
            <p className="hairline pt-3 text-[12px] leading-relaxed text-text-muted">
              {needsImei
                ? "Produk serial: hanya IMEI valid yang dihitung, sehingga unit bermasalah tidak ikut masuk."
                : "Produk non-serial: qty dipakai langsung tanpa validasi IMEI."}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Harga beli terakhir" hint="Referensi cepat sebelum menyimpan penerimaan." />
          <CardBody className="space-y-2">
            {lastPurchases.length === 0 ? (
              <p className="text-[13px] text-text-muted">Belum ada mutasi pembelian untuk produk ini.</p>
            ) : (
              lastPurchases.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-[12px] text-text-muted">{formatDate(movement.occurredAt)}</span>
                  <span className="num text-[12.5px] text-text">
                    {formatRupiah(movement.unitCost)} x {movement.qtyDelta}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- utang */

const BUCKETS: { id: string; label: string; hint: string; maxDays: number }[] = [
  { id: "b0", label: "Minggu ini", hint: "Jatuh tempo sampai 7 hari, termasuk yang sudah lewat", maxDays: 7 },
  { id: "b1", label: "Minggu depan", hint: "Hari ke-8 sampai ke-14", maxDays: 14 },
  { id: "b2", label: "2 minggu lagi", hint: "Hari ke-15 sampai ke-21", maxDays: 21 },
  { id: "b3", label: "Lebih dari 2 minggu", hint: "Di atas 21 hari", maxDays: Number.POSITIVE_INFINITY },
];

function bucketIndex(days: number): number {
  for (let index = 0; index < BUCKETS.length; index += 1) {
    const bucket = BUCKETS[index];
    if (bucket && days <= bucket.maxDays) return index;
  }
  return BUCKETS.length - 1;
}

function PayablesTab() {
  const data = useData();
  const ctx = useCtx();

  const unpaid = useMemo(
    () =>
      data.purchaseOrders
        .filter((po) => po.paidAt === null)
        .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate)),
    [data.purchaseOrders]
  );

  const totalUnpaid = unpaid.reduce((sum, po) => sum + po.total, 0);
  const asOfMs = Date.parse(data.asOf);
  const shortFall = ctx.kpis.payablesDue7 - ctx.kpis.cashOnHand;

  const grouped = BUCKETS.map((bucket, index) => {
    const items = unpaid.filter(
      (po) => bucketIndex(Math.ceil((Date.parse(po.dueDate) - asOfMs) / DAY_MS)) === index
    );
    return { bucket, items, subtotal: items.reduce((sum, po) => sum + po.total, 0) };
  });

  const priority = useMemo(
    () =>
      [...unpaid]
        .sort((a, b) => {
          const byDate = Date.parse(a.dueDate) - Date.parse(b.dueDate);
          return byDate !== 0 ? byDate : b.total - a.total;
        })
        .slice(0, 6),
    [unpaid]
  );

  const supplierName = (id: ID) => data.suppliers.find((s) => s.id === id)?.name ?? "Supplier tidak dikenal";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Utang berjalan" value={totalUnpaid} sub={`${unpaid.length} PO belum dibayar`} />
        <Kpi
          label="Jatuh tempo 7 hari"
          value={ctx.kpis.payablesDue7}
          tone={ctx.kpis.payablesDue7 > ctx.kpis.cashOnHand ? "danger" : "neutral"}
          sub="Sesuai kebijakan jatuh tempo yang berjalan"
        />
        <Kpi label="Kas tersedia" value={ctx.cashNow} sub="Semua akun kas dan bank" />
        <Kpi
          label="Rasio utang / kas"
          value={ctx.cashNow === 0 ? 100 : (totalUnpaid / ctx.cashNow) * 100}
          format="percent"
          tone={totalUnpaid > ctx.cashNow ? "warn" : "neutral"}
          sub="Di atas 100% berarti utang melebihi kas"
        />
      </div>

      {ctx.kpis.payablesDue7 > ctx.kpis.cashOnHand ? (
        <Alert tone="danger" title="Utang jatuh tempo 7 hari melebihi kas tersedia">
          Tagihan 7 hari ke depan {formatRupiah(ctx.kpis.payablesDue7)} sementara kas tersedia{" "}
          {formatRupiah(ctx.kpis.cashOnHand)}, kurang {formatRupiah(Math.abs(shortFall))}. Tunda PO yang belum dikirim,
          percepat penjualan stok cepat laku, dan nego mundur jatuh tempo supplier terbesar.
        </Alert>
      ) : (
        <Alert tone="ok" title="Kas masih menutup utang 7 hari">
          Tagihan 7 hari ke depan {formatRupiah(ctx.kpis.payablesDue7)} terhadap kas {formatRupiah(ctx.cashNow)}. Sisihkan
          kas sebelum belanja stok berikutnya.
        </Alert>
      )}

      {unpaid.length === 0 ? (
        <Card>
          <EmptyState
            title="Tidak ada utang supplier berjalan"
            body="Semua tagihan supplier sudah lunas, jadi kalender utang kosong. PO dengan tanggal bayar kosong otomatis muncul di sini."
            icon={<HandCoins size={28} />}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {grouped.map((group) => (
              <Card key={group.bucket.id}>
                <CardBody className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="label-caps">{group.bucket.label}</div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-text-muted">{group.bucket.hint}</p>
                    </div>
                    <Badge tone={group.items.length === 0 ? "neutral" : "warn"}>{group.items.length} PO</Badge>
                  </div>
                  <div className="num text-[18px] font-semibold text-text">{formatRupiah(group.subtotal)}</div>
                  {group.items.length === 0 ? (
                    <p className="text-[12px] text-text-muted">Tidak ada tagihan di rentang ini.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {group.items.map((po) => (
                        <li
                          key={po.id}
                          className="flex items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0 last:pb-0"
                        >
                          <span className="min-w-0">
                            <span className="num block text-[12px] text-text">{po.number}</span>
                            <span className="block truncate text-[11px] text-text-muted">
                              {supplierName(po.supplierId)}
                            </span>
                          </span>
                          <span className="num shrink-0 text-[12px] text-text-muted">{formatCompact(po.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Urutan prioritas pembayaran"
              hint="Diurutkan dari jatuh tempo terdekat, lalu nilai tagihan terbesar. Dampak kas dihitung terhadap kas tersedia."
            />
            <CardBody className="space-y-2.5">
              {priority.map((po, index) => {
                const share = ctx.cashNow > 0 ? (po.total / ctx.cashNow) * 100 : 100;
                const tone: Tone = share > 60 ? "danger" : share > 30 ? "warn" : "ok";
                const overdue = Date.parse(po.dueDate) < asOfMs;
                const reason = overdue
                  ? "Sudah lewat jatuh tempo. Bayar lebih dulu agar pasokan dan kredibilitas pembayaran tetap aman."
                  : share > 60
                    ? "Menyerap sebagian besar kas. Tunda PO baru dan minta mundur jatuh tempo sebelum membayar penuh."
                    : "Masih dalam jadwal. Siapkan kas dari penjualan harian, jangan menunggu sampai jatuh tempo.";
                return (
                  <div
                    key={po.id}
                    className="flex flex-wrap items-start gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5"
                  >
                    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="num text-[13px] font-semibold text-text">{po.number}</span>
                        <span className="text-[12px] text-text-muted">{supplierName(po.supplierId)}</span>
                        <Badge tone={tone}>{formatPct(share, 0)} kas tersedia</Badge>
                      </div>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">
                        {dueLabel(po.dueDate, data.asOf)} · {reason}
                      </p>
                    </div>
                    <span className="num shrink-0 text-[13px] font-medium text-text">{formatRupiah(po.total)}</span>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
