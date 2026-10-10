"use client";

/* ============================================================================
   /app/inventory - Stok.
   Lima cara melihat persediaan yang sama: level, ledger, unit IMEI, opname,
   penyesuaian, dan rencana belanja (open-to-buy).
   ========================================================================= */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  Barcode,
  Calculator,
  ClipboardText,
  MagnifyingGlass,
  Package,
  Plus,
  Stack,
  Warehouse,
} from "@phosphor-icons/react/dist/ssr";
import { PRODUCT_KIND_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime, formatNumber, formatPct, formatRupiah } from "@/lib/money";
import { buildReorderPlan } from "@/lib/metrics";
import type { ProductMetric, ReorderCandidate, ReorderPlan } from "@/lib/metrics";
import { useFrizzy, useUi, type Mutation } from "@/lib/store";
import type { ID, MovementReason, UnitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, Badge, EmptyState, Skeleton, type Tone } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Input, MoneyInput, Select, Slider } from "@/components/ui/Field";
import { DataRow, Kpi, MiniBar } from "@/components/ui/Kpi";
import { Overlay, Tabs } from "@/components/ui/Overlay";

/* ------------------------------------------------------------ tipe internal */

type TabId = "level" | "movement" | "unit" | "opname" | "adjust" | "reorder";

const TAB_IDS: TabId[] = ["level", "movement", "unit", "opname", "adjust", "reorder"];

type Health = "healthy" | "slow" | "dead" | "obsolete";

const HEALTH_LABEL: Record<Health, string> = {
  healthy: "Sehat",
  slow: "Lambat",
  dead: "Mati",
  obsolete: "Usang",
};

const HEALTH_TONE: Record<Health, Tone> = {
  healthy: "ok",
  slow: "warn",
  dead: "danger",
  obsolete: "danger",
};

const MOVEMENT_REASON_LABEL: Record<MovementReason, string> = {
  purchase: "Pembelian",
  sale: "Penjualan",
  return: "Retur",
  adjust: "Penyesuaian",
  opname: "Opname",
  transfer: "Transfer",
  damage: "Rusak",
  tradein: "Tukar tambah",
};

const REF_TYPE_LABEL: Record<string, string> = {
  sale: "Struk",
  po: "PO",
  opname: "Opname",
  manual: "Manual",
  service: "Servis",
};

const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  in_stock: "Siap jual",
  reserved: "Dipesan",
  sold: "Terjual",
  returned: "Retur",
  service: "Servis",
};

const UNIT_STATUS_TONE: Record<UnitStatus, Tone> = {
  in_stock: "ok",
  reserved: "info",
  sold: "neutral",
  returned: "warn",
  service: "warn",
};

const MOVEMENT_REASONS: MovementReason[] = [
  "purchase",
  "sale",
  "return",
  "adjust",
  "opname",
  "transfer",
  "damage",
  "tradein",
];

/** Hanya alasan yang memang ada di tipe MovementReason (kerusakan, opname, koreksi, retur). */
const ADJUST_REASONS: MovementReason[] = ["damage", "opname", "adjust", "return"];

const MOVEMENT_PAGE = 200;
const LEVEL_PAGE = 60;
const UNIT_PAGE = 50;

/* --------------------------------------------------------------- halaman */

/**
 * useSearchParams membaca parameter URL pada render pertama, jadi ia harus
 * berada di dalam Suspense supaya halaman tidak diprerender sebelum data ada.
 */
export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryLoading />}>
      <InventoryWorkspace />
    </Suspense>
  );
}

function InventoryWorkspace() {
  const searchParams = useSearchParams();
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);
  const role = useFrizzy((s) => s.role);
  const toast = useFrizzy((s) => s.toast);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const openAddStock = useUi((s) => s.openAddStock);

  const paramTab = searchParams.get("tab");
  const initialTab: TabId =
    paramTab !== null && (TAB_IDS as string[]).includes(paramTab) ? (paramTab as TabId) : "level";
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const changeTab = useCallback((id: string) => {
    if (!(TAB_IDS as string[]).includes(id)) return;
    const next = id as TabId;
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const metrics = useMemo(() => {
    if (!ctx) return [];
    return [...ctx.byProduct.values()].sort((a, b) => b.stockValue - a.stockValue);
  }, [ctx]);

  if (status === "loading" || status === "idle") {
    return <InventoryLoading />;
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[1100px]">
        <Alert
          tone="danger"
          title="Gagal memuat data stok"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                reset();
                void useFrizzy.getState().hydrate();
              }}
            >
              Coba lagi
            </Button>
          }
        >
          {error ?? "Ledger stok tidak dapat diambil dari server."}
        </Alert>
      </div>
    );
  }

  const k = ctx?.kpis;
  const totalSku = metrics.filter((m) => m.product.kind !== "service").length;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <SectionTitle
        eyebrow="Operasional"
        title="Stok"
        right={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 text-[12px] text-text-muted">
              <Stack size={16} />
              {formatNumber(totalSku)} SKU aktif
            </span>
            <Button
              variant="primary"
              icon={<Plus size={16} weight="bold" />}
              onClick={openAddStock}
              data-testid="inventory-add-stock"
            >
              Tambah stok
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Nilai stok"
          value={k?.inventoryValue ?? 0}
          format="rupiah"
          hint="Qty tersedia dikali harga pokok per SKU."
          sub={`DIO ${k ? `${k.dio.toFixed(1)} hari` : "-"}`}
        />
        <Kpi
          label="SKU terpantau"
          value={totalSku}
          format="number"
          subject="SKU"
          hint="Produk non-jasa yang punya baris stok."
          sub={`Turnover ${k ? `${k.turnover.toFixed(2)}x per tahun` : "-"}`}
        />
        <Kpi
          label="Nilai stok mati"
          value={k?.deadStockValue ?? 0}
          format="rupiah"
          tone="danger"
          hint="Stok tanpa penjualan 60 hari atau lebih."
          sub={`Lambat bergerak ${k ? formatRupiah(k.slowStockValue) : "-"}`}
        />
        <Kpi
          label="Selisih opname"
          value={k?.shrinkagePct ?? 0}
          format="percent"
          tone={(k?.shrinkagePct ?? 0) > 1 ? "danger" : "ok"}
          hint="Nilai selisih fisik terhadap nilai persediaan."
          sub={`${formatNumber(data?.opnameLines.filter((l) => l.variance !== 0).length ?? 0)} baris berbeda`}
        />
      </div>

      <Tabs
        value={tab}
        onChange={changeTab}
        tabs={[
          { id: "level", label: "Level stok" },
          { id: "movement", label: "Ledger", badge: formatNumber(data?.movements.length ?? 0) },
          { id: "unit", label: "Unit IMEI", badge: formatNumber(data?.units.length ?? 0) },
          { id: "opname", label: "Opname", badge: formatNumber(data?.opnameSessions.length ?? 0) },
          { id: "adjust", label: "Penyesuaian" },
          { id: "reorder", label: "Rencana belanja" },
        ]}
      />

      {tab === "level" ? <LevelTab metrics={metrics} kpis={k} /> : null}
      {tab === "movement" ? <MovementTab /> : null}
      {tab === "unit" ? <UnitTab /> : null}
      {tab === "opname" ? <OpnameTab /> : null}
      {tab === "adjust" ? <AdjustTab role={role} toast={toast} requestApproval={requestApproval} /> : null}
      {tab === "reorder" ? <ReorderTab toast={toast} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ LEVEL */

function LevelTab({
  metrics,
  kpis,
}: {
  metrics: ProductMetric[];
  kpis: { inventoryValue: number; deadStockValue: number } | undefined;
}) {
  const data = useFrizzy((s) => s.data);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [health, setHealth] = useState<string>("all");
  const [visible, setVisible] = useState(LEVEL_PAGE);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return metrics.filter((m) => {
      if (kind !== "all" && m.product.kind !== kind) return false;
      if (health !== "all" && m.health !== health) return false;
      if (needle.length > 0) {
        const haystack = `${m.product.name} ${m.product.sku} ${m.product.barcode}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [metrics, kind, health, query]);

  const shown = rows.slice(0, visible);
  const maxValue = rows.reduce((max, m) => Math.max(max, m.stockValue), 1);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Input
              label="Cari produk"
              placeholder="Nama, SKU, atau barcode"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(LEVEL_PAGE);
              }}
            />
          </div>
          <div className="lg:col-span-3">
            <Select
              label="Jenis produk"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setVisible(LEVEL_PAGE);
              }}
            >
              <option value="all">Semua jenis</option>
              {Object.entries(PRODUCT_KIND_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-3">
            <Select
              label="Kesehatan stok"
              value={health}
              onChange={(e) => {
                setHealth(e.target.value);
                setVisible(LEVEL_PAGE);
              }}
            >
              <option value="all">Semua status</option>
              <option value="healthy">Sehat</option>
              <option value="slow">Lambat</option>
              <option value="dead">Mati</option>
              <option value="obsolete">Usang</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={<Package size={30} />}
            title="Tidak ada produk yang cocok"
            body="Ubah kata kunci, jenis produk, atau status kesehatan stok untuk melihat baris lain."
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <caption className="sr-only">
                Level stok per produk: qty, nilai, harga jual, margin, status kesehatan, kelas ABC/XYZ, dan hari cover
              </caption>
              <thead>
                <tr className="border-b border-border text-text-faint">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Jenis
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Nilai
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Harga jual
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Margin
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    ABC/XYZ
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Hari cover
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const margin = m.product.price === 0 ? 0 : ((m.product.price - m.product.cost) / m.product.price) * 100;
                  return (
                    <tr key={m.product.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text">{m.product.name}</div>
                        <div className="num text-[11.5px] text-text-faint">
                          {m.product.sku} - {m.product.brand}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {PRODUCT_KIND_LABEL[m.product.kind] ?? m.product.kind}
                      </td>
                      <td className="num px-4 py-3 text-right">
                        <span className="block text-[14px] font-medium text-text">{formatNumber(m.qty)}</span>
                        <span className="block text-[10.5px] text-text-faint">
                          min {formatNumber(m.product.reorderPoint)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="num text-text">{formatRupiah(m.stockValue)}</div>
                        <div className="mt-1 flex justify-end">
                          <MiniBar value={m.stockValue} max={maxValue} tone={m.health === "healthy" ? "accent" : "danger"} />
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-right text-text">{formatRupiah(m.product.price)}</td>
                      <td className={cn("num px-4 py-3 text-right", margin < 0 ? "text-danger" : "text-text")}>
                        {formatPct(margin)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={HEALTH_TONE[m.health]}>{HEALTH_LABEL[m.health]}</Badge>
                      </td>
                      <td className="num px-4 py-3 text-text-muted">
                        {m.abc}/{m.xyz}
                      </td>
                      <td className="num px-4 py-3 text-right text-text-muted">
                        {Number.isFinite(m.daysOfCover) ? `${Math.round(m.daysOfCover)} hari` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-2">
                  <th scope="row" className="px-4 py-3 text-left text-[12px] font-semibold text-text">
                    Ringkasan ({formatNumber(rows.length)} baris)
                  </th>
                  <td className="num px-4 py-3 text-right text-[12px] text-text-muted">
                    {formatNumber(rows.reduce((sum, m) => sum + m.qty, 0))}
                  </td>
                  <td className="num px-4 py-3 text-right text-[12px] font-semibold text-text">
                    {formatRupiah(rows.reduce((sum, m) => sum + m.stockValue, 0))}
                  </td>
                  <td colSpan={6} className="px-4 py-3 text-[12px] text-text-muted">
                    {formatNumber(totalKindRows(rows))} SKU non-jasa. Nilai stok mati toko{" "}
                    {kpis ? formatRupiah(kpis.deadStockValue) : "-"} dari total{" "}
                    {kpis ? formatRupiah(kpis.inventoryValue) : "-"}.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rows.length > shown.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-[12px] text-text-muted">
              Menampilkan {formatNumber(shown.length)} dari {formatNumber(rows.length)} SKU
            </span>
            <Button variant="secondary" size="sm" onClick={() => setVisible((value) => value + LEVEL_PAGE)}>
              Muat {LEVEL_PAGE} lagi
            </Button>
          </div>
        ) : null}
      </Card>

      {data ? (
        <p className="text-[11.5px] text-text-faint">
          Hari cover = qty tersedia dibagi rata-rata permintaan harian 42 hari terakhir. Angka "-" berarti belum ada penjualan.
        </p>
      ) : null}
    </div>
  );
}

function totalKindRows(rows: { product: { kind: string } }[]): number {
  return rows.filter((m) => m.product.kind !== "service").length;
}

/* --------------------------------------------------------------- MOVEMENT */

function MovementTab() {
  const data = useFrizzy((s) => s.data);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<string>("all");
  const [visible, setVisible] = useState(MOVEMENT_PAGE);

  const rows = useMemo(() => {
    if (!data) return [];
    const productName = new Map(data.products.map((p) => [p.id, p.name]));
    const userName = new Map(data.users.map((u) => [u.id, u.name]));
    const needle = query.trim().toLowerCase();
    return data.movements
      .slice()
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .filter((m) => {
        if (reason !== "all" && m.reason !== reason) return false;
        if (needle.length > 0) {
          const haystack = `${productName.get(m.productId) ?? ""} ${m.note}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .map((m) => ({
        movement: m,
        productName: productName.get(m.productId) ?? m.productId,
        actorName: userName.get(m.actorId) ?? m.actorId,
      }));
  }, [data, query, reason]);

  const shown = rows.slice(0, visible);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Input
              label="Cari pergerakan"
              placeholder="Nama produk atau catatan"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(MOVEMENT_PAGE);
              }}
            />
          </div>
          <div className="lg:col-span-3">
            <Select
              label="Alasan"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setVisible(MOVEMENT_PAGE);
              }}
            >
              <option value="all">Semua alasan</option>
              {MOVEMENT_REASONS.map((id) => (
                <option key={id} value={id}>
                  {MOVEMENT_REASON_LABEL[id]}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-3 flex items-end">
            <p className="text-[12px] leading-snug text-text-faint">
              Ledger bersifat append-only: setiap koreksi meninggalkan baris baru, bukan menimpa yang lama.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={<ClipboardText size={30} />}
            title="Tidak ada pergerakan yang cocok"
            body="Coba ubah alasan atau kata kunci pencarian untuk melihat baris ledger lain."
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1040px] text-left text-[13px]">
              <caption className="sr-only">
                Ledger pergerakan stok: waktu, produk, perubahan qty, alasan, referensi, aktor, dan catatan
              </caption>
              <thead>
                <tr className="border-b border-border text-text-faint">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Waktu
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Alasan
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Referensi
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Aktor
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Catatan
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ movement, productName, actorName }) => (
                  <tr key={movement.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="num px-4 py-3 whitespace-nowrap text-text-muted">
                      {formatDateTime(movement.occurredAt)}
                    </td>
                    <td className="px-4 py-3 text-text">{productName}</td>
                    <td
                      className={cn(
                        "num px-4 py-3 text-right font-medium",
                        movement.qtyDelta < 0 ? "text-danger" : "text-accent"
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {movement.qtyDelta < 0 ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                        {movement.qtyDelta > 0 ? "+" : ""}
                        {formatNumber(movement.qtyDelta)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={movement.qtyDelta < 0 ? "warn" : "ok"}>
                        {MOVEMENT_REASON_LABEL[movement.reason]}
                      </Badge>
                    </td>
                    <td className="num px-4 py-3 text-text-muted">
                      {REF_TYPE_LABEL[movement.refType] ?? movement.refType}
                      {movement.refId ? ` - ${shortId(movement.refId)}` : ""}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{actorName}</td>
                    <td className="px-4 py-3 text-text-muted">{movement.note.length > 0 ? movement.note : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > shown.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-[12px] text-text-muted">
              Menampilkan {formatNumber(shown.length)} dari {formatNumber(rows.length)} baris ledger
            </span>
            <Button variant="secondary" size="sm" onClick={() => setVisible((value) => value + MOVEMENT_PAGE)}>
              Muat {MOVEMENT_PAGE} lagi
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------- UNIT */

function UnitTab() {
  const data = useFrizzy((s) => s.data);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(UNIT_PAGE);

  const rows = useMemo(() => {
    if (!data) return [];
    const productName = new Map(data.products.map((p) => [p.id, p.name]));
    const needle = query.trim().toLowerCase();
    return data.units
      .filter((unit) => {
        if (needle.length === 0) return true;
        const haystack = `${unit.imei1} ${unit.imei2 ?? ""} ${unit.serial ?? ""} ${productName.get(unit.productId) ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      })
      .map((unit) => ({
        unit,
        productName: productName.get(unit.productId) ?? unit.productId,
        expiresAt: warrantyEnd(unit.receivedAt, unit.warrantyMonths),
      }))
      .sort((a, b) => (a.unit.receivedAt < b.unit.receivedAt ? 1 : -1));
  }, [data, query]);

  const shown = rows.slice(0, visible);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Input
              label="Cari unit"
              placeholder="IMEI, nomor seri, atau nama produk"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(UNIT_PAGE);
              }}
              hint="Tempel IMEI lengkap dari kotak atau nota untuk melacak unit tertentu."
            />
          </div>
          <div className="lg:col-span-6 flex items-end justify-start gap-2 lg:justify-end">
            <Badge tone="ok">{formatNumber(rows.filter((r) => r.unit.status === "in_stock").length)} siap jual</Badge>
            <Badge tone="info">{formatNumber(rows.filter((r) => r.unit.status === "reserved").length)} dipesan</Badge>
            <Badge tone="warn">{formatNumber(rows.filter((r) => r.unit.status === "service").length)} servis</Badge>
            <Badge tone="neutral">{formatNumber(rows.filter((r) => r.unit.status === "sold").length)} terjual</Badge>
          </div>
        </div>
      </Card>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={<Barcode size={30} />}
            title="Unit tidak ditemukan"
            body="Periksa kembali IMEI atau nomor seri. Pencarian mencakup IMEI1, IMEI2, nomor seri, dan nama produk."
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1040px] text-left text-[13px]">
              <caption className="sr-only">
                Unit terserialisasi: IMEI1, IMEI2, produk, status, akhir garansi, tanggal masuk, dan tanggal jual
              </caption>
              <thead>
                <tr className="border-b border-border text-text-faint">
                  <th scope="col" className="px-4 py-3 font-medium">
                    IMEI 1
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    IMEI 2 / seri
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Garansi berakhir
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Masuk
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Terjual
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ unit, productName, expiresAt }) => (
                  <tr key={unit.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="num px-4 py-3 text-text">{unit.imei1}</td>
                    <td className="num px-4 py-3 text-text-muted">{unit.imei2 ?? unit.serial ?? "-"}</td>
                    <td className="px-4 py-3 text-text-muted">{productName}</td>
                    <td className="px-4 py-3">
                      <Badge tone={UNIT_STATUS_TONE[unit.status]}>{UNIT_STATUS_LABEL[unit.status]}</Badge>
                    </td>
                    <td className="num px-4 py-3 text-text-muted">
                      {formatDate(expiresAt)}
                      <span className="ml-1 text-[11px] text-text-faint">{unit.warrantyMonths} bln</span>
                    </td>
                    <td className="num px-4 py-3 text-text-muted">{formatDate(unit.receivedAt)}</td>
                    <td className="num px-4 py-3 text-text-muted">
                      {unit.soldAt ? formatDate(unit.soldAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > shown.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-[12px] text-text-muted">
              Menampilkan {formatNumber(shown.length)} dari {formatNumber(rows.length)} unit
            </span>
            <Button variant="secondary" size="sm" onClick={() => setVisible((value) => value + UNIT_PAGE)}>
              Muat {UNIT_PAGE} lagi
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- OPNAME */

function OpnameTab() {
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const toast = useFrizzy((s) => s.toast);
  const [sessionId, setSessionId] = useState<ID | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<ID, number>>({});

  const sessions = useMemo(() => {
    if (!data) return [];
    return data.opnameSessions.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }, [data]);

  const activeId = sessionId ?? sessions[0]?.id ?? null;
  const activeSession = activeId === null ? null : sessions.find((s) => s.id === activeId) ?? null;

  const lines = useMemo(() => {
    if (!data || activeId === null) return [];
    const productName = new Map(data.products.map((p) => [p.id, p.name]));
    return data.opnameLines
      .filter((line) => line.sessionId === activeId)
      .map((line) => ({
        line,
        productName: productName.get(line.productId) ?? line.productId,
      }));
  }, [data, activeId]);

  const systemQty = (productId: ID): number => ctx?.byProduct.get(productId)?.qty ?? 0;

  const summary = useMemo(() => {
    let units = 0;
    let value = 0;
    for (const line of data?.opnameLines ?? []) {
      units += line.variance;
      value += line.varianceValue;
    }
    const inventoryValue = ctx?.kpis.inventoryValue ?? 0;
    return {
      units,
      value,
      pct: inventoryValue === 0 ? 0 : (Math.abs(value) / inventoryValue) * 100,
    };
  }, [data, ctx]);

  const countingProducts = useMemo(() => {
    if (!ctx) return [];
    return [...ctx.byProduct.values()]
      .filter((m) => m.product.kind !== "service")
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 12)
      .map((m) => m.product);
  }, [ctx]);

  const liveVariance = useMemo(() => {
    let units = 0;
    let value = 0;
    for (const product of countingProducts) {
      const counted = counts[product.id] ?? systemQty(product.id);
      const diff = counted - systemQty(product.id);
      units += diff;
      value += diff * product.cost;
    }
    return { units, value };
  }, [countingProducts, counts, ctx]);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Selisih unit"
          value={summary.units}
          format="number"
          subject="unit"
          tone={summary.units < 0 ? "danger" : "ok"}
          hint="Total selisih fisik semua sesi opname."
        />
        <Kpi
          label="Nilai selisih"
          value={summary.value}
          format="rupiah"
          tone={summary.value < 0 ? "danger" : "ok"}
          hint="Selisih unit dikali harga pokok masing-masing produk."
        />
        <Kpi
          label="Porsi terhadap stok"
          value={summary.pct}
          format="percent"
          tone={summary.pct > 1 ? "danger" : "ok"}
          hint="Ambang perhatian pemilik adalah 1% dari nilai persediaan."
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-text">Sesi opname</h3>
            <p className="mt-0.5 text-[13px] text-text-muted">
              Blind count disarankan: hitung fisik tanpa melihat angka sistem lebih dulu.
            </p>
          </div>
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => setNewOpen(true)}>
            Mulai opname baru
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {sessions.map((session) => {
            const active = session.id === activeId;
            const sessionLines = data.opnameLines.filter((line) => line.sessionId === session.id);
            const variance = sessionLines.reduce((sum, line) => sum + line.variance, 0);
            const counter = data.users.find((u) => u.id === session.countedBy)?.name ?? session.countedBy;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => setSessionId(session.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left transition-colors",
                    active ? "bg-accent-soft" : "hover:bg-surface-2"
                  )}
                >
                  <span className="num text-[13px] font-medium text-text">{session.code}</span>
                  <Badge tone={session.status === "open" ? "warn" : session.status === "approved" ? "ok" : "neutral"}>
                    {session.status === "open" ? "Berjalan" : session.status === "approved" ? "Disetujui" : "Ditutup"}
                  </Badge>
                  <span className="text-[12.5px] text-text-muted">{formatDateTime(session.startedAt)}</span>
                  <span className="text-[12.5px] text-text-faint">oleh {counter}</span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className={cn("num text-[12.5px]", variance === 0 ? "text-text-muted" : "text-danger")}>
                      {variance > 0 ? "+" : ""}
                      {formatNumber(variance)} unit
                    </span>
                    <span className="text-[11.5px] text-text-faint">{sessionLines.length} baris</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {activeSession ? (
        <Card>
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-[15px] font-semibold text-text">
              Baris hitung {activeSession.code}
            </h3>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {activeSession.note.length > 0 ? activeSession.note : "Tanpa catatan pembuka."}
            </p>
          </div>

          {activeSession.status === "open" ? (
            <div className="border-b border-border px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Badge tone="warn">Form hitung terbuka</Badge>
                <span className="text-[12px] text-text-muted">
                  Selisih sementara:{" "}
                  <span className={cn("num", liveVariance.units === 0 ? "text-text" : "text-danger")}>
                    {liveVariance.units > 0 ? "+" : ""}
                    {formatNumber(liveVariance.units)} unit - {formatRupiah(liveVariance.value)}
                  </span>
                </span>
              </div>
              <div className="scroll-x">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <caption className="sr-only">
                    Form hitung opname: qty sistem, qty fisik hasil hitung, dan selisih per produk
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-text-faint">
                      <th scope="col" className="px-2 py-2.5 font-medium">
                        Produk
                      </th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">
                        Qty sistem
                      </th>
                      <th scope="col" className="px-2 py-2.5 font-medium">
                        Qty fisik
                      </th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">
                        Selisih
                      </th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">
                        Nilai
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {countingProducts.map((product) => {
                      const system = systemQty(product.id);
                      const counted = counts[product.id] ?? system;
                      const diff = counted - system;
                      return (
                        <tr key={product.id} className="border-b border-border last:border-0">
                          <td className="px-2 py-2 text-text">{product.name}</td>
                          <td className="num px-2 py-2 text-right text-text-muted">{formatNumber(system)}</td>
                          <td className="px-2 py-2">
                            <label className="sr-only" htmlFor={`opname-${product.id}`}>
                              Qty fisik {product.name}
                            </label>
                            <input
                              id={`opname-${product.id}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={counted}
                              onChange={(e) => {
                                const parsed = Number.parseInt(e.target.value, 10);
                                setCounts((prev) => ({
                                  ...prev,
                                  [product.id]: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                                }));
                              }}
                              className="num w-24 rounded-[10px] border border-border-strong bg-surface px-2 py-1.5 text-right text-[13px] text-text focus:border-accent focus:outline-none"
                            />
                          </td>
                          <td className={cn("num px-2 py-2 text-right", diff === 0 ? "text-text-muted" : "text-danger")}>
                            {diff > 0 ? "+" : ""}
                            {formatNumber(diff)}
                          </td>
                          <td className={cn("num px-2 py-2 text-right", diff === 0 ? "text-text-muted" : "text-danger")}>
                            {formatRupiah(diff * product.cost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast({
                      title: "Hitungan disimpan sementara",
                      body: "Form hitung opname tersimpan di perangkat ini sampai sesi ditutup pemilik.",
                      tone: "ok",
                    })
                  }
                >
                  Simpan hitungan
                </Button>
                <span className="text-[11.5px] text-text-faint">
                  Variance dihitung langsung di klien terhadap qty sistem.
                </span>
              </div>
            </div>
          ) : null}

          {lines.length === 0 ? (
            <EmptyState
              icon={<ClipboardText size={28} />}
              title="Sesi ini belum punya baris"
              body="Belum ada hasil hitung yang tersimpan untuk sesi opname ini."
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <caption className="sr-only">
                  Hasil opname per produk: qty sistem, qty fisik, selisih unit, dan nilai selisih
                </caption>
                <thead>
                  <tr className="border-b border-border text-text-faint">
                    <th scope="col" className="px-5 py-3 font-medium">
                      Produk
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Qty sistem
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Qty fisik
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Selisih
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Nilai selisih
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(({ line, productName }) => (
                    <tr key={line.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-5 py-3 text-text">{productName}</td>
                      <td className="num px-5 py-3 text-right text-text-muted">{formatNumber(line.systemQty)}</td>
                      <td className="num px-5 py-3 text-right text-text-muted">{formatNumber(line.countedQty)}</td>
                      <td
                        className={cn(
                          "num px-5 py-3 text-right font-medium",
                          line.variance === 0 ? "text-text-muted" : "text-danger"
                        )}
                      >
                        {line.variance > 0 ? "+" : ""}
                        {formatNumber(line.variance)}
                      </td>
                      <td
                        className={cn(
                          "num px-5 py-3 text-right",
                          line.varianceValue === 0 ? "text-text-muted" : "text-danger"
                        )}
                      >
                        {formatRupiah(line.varianceValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<ClipboardText size={30} />}
            title="Belum ada sesi opname"
            body="Mulai opname baru untuk mencatat hitung fisik pertama konter ini."
            action={
              <Button variant="primary" icon={<Plus size={17} />} onClick={() => setNewOpen(true)}>
                Mulai opname baru
              </Button>
            }
          />
        </Card>
      )}

      <Overlay
        open={newOpen}
        onClose={() => setNewOpen(false)}
        size="sm"
        title="Mulai opname baru"
        description="Catatan sesi membantu penelusuran selisih di kemudian hari."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setNewOpen(false);
                setNote("");
                toast({
                  title: "Sesi opname tercatat",
                  body: "Lembar hitung siap dipakai. Cetak form dan hitung fisik per IMEI.",
                  tone: "ok",
                });
              }}
            >
              Catat sesi
            </Button>
          </div>
        }
      >
        <Input
          label="Catatan sesi"
          placeholder="Contoh: opname bulanan, fokus rak handset"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          hint="Catatan ikut tercetak di lembar hitung."
        />
      </Overlay>
    </div>
  );
}

/* ----------------------------------------------------------------- ADJUST */

function AdjustTab({
  role,
  toast,
  requestApproval,
}: {
  role: "owner" | "staff";
  toast: (t: { title: string; body: string; tone: "ok" | "warn" | "danger" | "info" }) => void;
  requestApproval: (req: { kind: "discount" | "below_min" | "void" | "draw" | "sensitive"; message: string; onApprove: () => void }) => void;
}) {
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const [productId, setProductId] = useState<ID>("");
  const [qtyDelta, setQtyDelta] = useState(0);
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [reason, setReason] = useState<MovementReason>("damage");
  const [note, setNote] = useState("");

  const products = useMemo(() => {
    if (!ctx) return [];
    return [...ctx.byProduct.values()]
      .map((m) => m.product)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ctx]);

  const activeProduct = productId.length > 0 ? products.find((p) => p.id === productId) ?? null : null;
  const systemQty = activeProduct ? ctx?.byProduct.get(activeProduct.id)?.qty ?? 0 : 0;
  const signedDelta = direction === "out" ? -Math.abs(qtyDelta) : Math.abs(qtyDelta);

  const recentManual = useMemo(() => {
    if (!data) return [];
    const productName = new Map(data.products.map((p) => [p.id, p.name]));
    const userName = new Map(data.users.map((u) => [u.id, u.name]));
    return data.movements
      .filter((m) => m.refType === "manual")
      .slice()
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, 10)
      .map((m) => ({
        movement: m,
        productName: productName.get(m.productId) ?? m.productId,
        actorName: userName.get(m.actorId) ?? m.actorId,
      }));
  }, [data]);

  const run = () => {
    if (!activeProduct) {
      toast({ title: "Pilih produk dulu", body: "Penyesuaian butuh produk dan jumlah yang jelas.", tone: "warn" });
      return;
    }
    if (signedDelta === 0) {
      toast({ title: "Qty masih nol", body: "Isi jumlah unit yang disesuaikan.", tone: "warn" });
      return;
    }
    const actorId = useFrizzy.getState().userId;
    if (actorId === null) {
      toast({ title: "Tidak bisa menyimpan", body: "Sesi pengguna tidak dikenali.", tone: "danger" });
      return;
    }
    const label = MOVEMENT_REASON_LABEL[reason];
    const mutation: Mutation = {
      type: "adjust_stock",
      productId: activeProduct.id,
      qtyDelta: signedDelta,
      reason,
      note: note.trim().length > 0 ? note.trim() : `Penyesuaian ${label.toLowerCase()}`,
      actorId,
    };

    if (role !== "owner") {
      requestApproval({
        kind: "sensitive",
        message: `Penyesuaian stok ${activeProduct.name} sebesar ${signedDelta > 0 ? "+" : ""}${signedDelta} unit (${label}) memerlukan persetujuan pemilik.`,
        onApprove: () => {
          useFrizzy.getState().mutate(mutation);
          useFrizzy.getState().toast({
            title: "Penyesuaian disetujui",
            body: `${activeProduct.name} ${signedDelta > 0 ? "+" : ""}${signedDelta} unit tercatat di ledger.`,
            tone: "ok",
          });
        },
      });
      toast({
        title: "Menunggu persetujuan",
        body: "Permintaan penyesuaian dikirim ke pemilik. Ledger berubah setelah disetujui.",
        tone: "warn",
      });
      return;
    }

    useFrizzy.getState().mutate(mutation);
    setQtyDelta(0);
    setNote("");
    toast({
      title: "Penyesuaian tersimpan",
      body: `${activeProduct.name} ${signedDelta > 0 ? "+" : ""}${signedDelta} unit (${label}) masuk ledger.`,
      tone: "ok",
    });
  };

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold text-text">Penyesuaian stok</h3>
          <p className="mt-0.5 text-[13px] text-text-muted">
            Setiap penyesuaian meninggalkan baris ledger baru beserta aktor dan alasannya.
          </p>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-4">
          <Select
            label="Produk"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            hint={activeProduct ? `Qty sistem saat ini ${formatNumber(systemQty)} unit.` : "Pilih produk yang dihitung ulang."}
          >
            <option value="">Pilih produk</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - {product.sku}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Arah"
              value={direction}
              onChange={(e) => setDirection(e.target.value === "in" ? "in" : "out")}
            >
              <option value="out">Kurangi stok (-)</option>
              <option value="in">Tambah stok (+)</option>
            </Select>
            <Input
              label="Jumlah unit"
              type="number"
              inputMode="numeric"
              min={0}
              value={qtyDelta === 0 ? "" : String(qtyDelta)}
              placeholder="0"
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                setQtyDelta(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
              }}
              hint={activeProduct ? `Stok setelah: ${formatNumber(systemQty + signedDelta)} unit` : undefined}
            />
          </div>

          <Select
            label="Alasan"
            value={reason}
            onChange={(e) => {
              const next = e.target.value;
              const found = MOVEMENT_REASONS.find((id) => id === next);
              setReason(found ?? "adjust");
            }}
          >
            {ADJUST_REASONS.map((id) => (
              <option key={id} value={id}>
                {MOVEMENT_REASON_LABEL[id]}
              </option>
            ))}
          </Select>

          <Input
            label="Catatan"
            placeholder="Contoh: layar pecah saat dipajang"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={run}>
              Simpan penyesuaian
            </Button>
            {role !== "owner" ? (
              <span className="text-[11.5px] text-text-faint">Staf mengirim permintaan persetujuan ke pemilik.</span>
            ) : null}
          </div>

          {activeProduct ? (
            <div className="rounded-[10px] bg-surface-2 px-4 py-3">
              <DataRow
                label="Dampak nilai"
                value={formatRupiah(signedDelta * activeProduct.cost)}
                hint={`Harga pokok ${formatRupiah(activeProduct.cost)} per unit`}
              />
              <DataRow label="Qty sistem" value={`${formatNumber(systemQty)} unit`} />
              <DataRow label="Qty setelah" value={`${formatNumber(systemQty + signedDelta)} unit`} strong />
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold text-text">10 penyesuaian manual terakhir</h3>
          <p className="mt-0.5 text-[13px] text-text-muted">
            Hanya baris dengan referensi manual, bukan penjualan atau pembelian.
          </p>
        </div>
        {recentManual.length === 0 ? (
          <EmptyState
            icon={<ArrowCounterClockwise size={28} />}
            title="Belum ada penyesuaian manual"
            body="Penyesuaian yang Anda simpan akan muncul di sini sebagai riwayat."
          />
        ) : (
          <ul className="divide-y divide-border">
            {recentManual.map(({ movement, productName, actorName }) => (
              <li key={movement.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text">{productName}</p>
                  <p className="text-[11.5px] text-text-muted">
                    {MOVEMENT_REASON_LABEL[movement.reason]} - {actorName} - {formatDateTime(movement.occurredAt)}
                  </p>
                  <p className="text-[11.5px] text-text-faint">{movement.note}</p>
                </div>
                <span
                  className={cn(
                    "num shrink-0 text-[13px] font-medium",
                    movement.qtyDelta < 0 ? "text-danger" : "text-accent"
                  )}
                >
                  {movement.qtyDelta > 0 ? "+" : ""}
                  {formatNumber(movement.qtyDelta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- REORDER */

function ReorderTab({
  toast,
}: {
  toast: (t: { title: string; body: string; tone: "ok" | "warn" | "danger" | "info" }) => void;
}) {
  const ctx = useFrizzy((s) => s.ctx);
  const [allocationPct, setAllocationPct] = useState(40);
  const [selected, setSelected] = useState<Record<ID, boolean>>({});

  const plan: ReorderPlan | null = useMemo(
    () => (ctx ? buildReorderPlan(ctx, { allocationPct }) : null),
    [ctx, allocationPct]
  );

  if (!ctx || !plan) return null;

  const deferredTotal = plan.deferred.reduce((sum, c) => sum + c.totalCost, 0);
  const allTotal = plan.candidates.reduce((sum, c) => sum + c.totalCost, 0);
  const chosen = plan.funded.filter((c) => selected[c.product.id] !== false);

  return (
    <div className="flex flex-col gap-4">
      <Card className="px-5 py-4">
        <h3 className="text-[15px] font-semibold text-text">Rumus open-to-buy</h3>
        <p className="measure mt-1 text-[13px] leading-relaxed text-text-muted">
          (Kas - lantai aman - utang jatuh tempo) x alokasi%. Kas dipakai hanya sebesar bagian yang boleh
          dibelanjakan; sisanya tetap di laci untuk beban dan prive.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[10px] bg-surface-2 px-4 py-3">
            <p className="label-caps">Kas saat ini</p>
            <p className="num mt-1 text-[15px] text-text">{formatRupiah(plan.cashOnHand)}</p>
          </div>
          <div className="rounded-[10px] bg-surface-2 px-4 py-3">
            <p className="label-caps">Lantai aman</p>
            <p className="num mt-1 text-[15px] text-text">{formatRupiah(plan.safetyFloor)}</p>
          </div>
          <div className="rounded-[10px] bg-surface-2 px-4 py-3">
            <p className="label-caps">Utang jatuh tempo</p>
            <p className="num mt-1 text-[15px] text-text">{formatRupiah(plan.payablesDue)}</p>
          </div>
          <div className="rounded-[10px] bg-accent-soft px-4 py-3">
            <p className="label-caps">Open-to-buy</p>
            <p className="num mt-1 text-[15px] font-medium text-accent">{formatRupiah(plan.openToBuy)}</p>
          </div>
        </div>
        <div className="mt-4 max-w-[520px]">
          <Slider
            label="Alokasi kas untuk belanja stok"
            value={allocationPct}
            min={10}
            max={80}
            step={5}
            suffix="%"
            onValueChange={setAllocationPct}
            hint={`Alokasi ${allocationPct}% memberi open-to-buy ${formatRupiah(plan.openToBuy)} dari kas yang tersedia.`}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Total dana disarankan"
          value={plan.totalFunded}
          format="rupiah"
          hint="Jumlah biaya kandidat yang masuk anggaran open-to-buy."
          sub={`${plan.funded.length} dari ${plan.candidates.length} kandidat didanai`}
        />
        <Kpi
          label="Ditunda"
          value={deferredTotal}
          format="rupiah"
          tone={deferredTotal > 0 ? "warn" : "ok"}
          hint="Kandidat yang menunggu kas berikutnya."
          sub={`${plan.deferred.length} kandidat belum masuk anggaran`}
        />
        <Kpi
          label="Payback rata-rata"
          value={plan.expectedPaybackDays}
          format="days"
          tone={plan.expectedPaybackDays > 90 ? "warn" : "ok"}
          hint="Rata-rata tertimbang hari balik modal dari kandidat yang didanai."
          sub={`Kebutuhan seluruh kandidat ${formatRupiah(allTotal)}`}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-text">Kandidat belanja</h3>
            <p className="mt-0.5 text-[13px] text-text-muted">
              Diurutkan dari skor laba harian per rupiah modal. Centang untuk menyertakan dalam draf PO.
            </p>
          </div>
          <Button
            variant="primary"
            icon={<Calculator size={17} />}
            disabled={chosen.length === 0}
            onClick={() => {
              const actorId = useFrizzy.getState().userId;
              if (actorId === null) {
                toast({ title: "Tidak bisa membuat PO", body: "Sesi pengguna tidak dikenali.", tone: "danger" });
                return;
              }
              const mutation: Mutation = {
                type: "approve_reorder",
                candidateIds: chosen.map((c) => c.product.id),
                actorId,
              };
              useFrizzy.getState().mutate(mutation);
              toast({
                title: "Draf PO dibuat",
                body: `${chosen.length} baris reorder senilai ${formatRupiah(plan.totalFunded)} masuk draf pembelian.`,
                tone: "ok",
              });
            }}
          >
            Buat draf PO ({chosen.length})
          </Button>
        </div>

        {plan.candidates.length === 0 ? (
          <EmptyState
            icon={<Warehouse size={30} />}
            title="Tidak ada kandidat belanja"
            body="Semua stok masih di atas titik pesan ulang, atau belum ada permintaan yang cukup untuk dihitung."
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <caption className="sr-only">
                Kandidat reorder: qty disarankan, biaya, GMROI, hari cover, payback, lead time, dan status pendanaan
              </caption>
              <thead>
                <tr className="border-b border-border text-text-faint">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Sertakan
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Biaya
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    GMROI
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Hari cover
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Payback
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Lead time
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.candidates.map((candidate: ReorderCandidate) => {
                  const isFunded = plan.funded.some((f) => f.product.id === candidate.product.id);
                  const checked = selected[candidate.product.id] !== false && isFunded;
                  return (
                    <tr key={candidate.product.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!isFunded}
                          aria-label={`Sertakan ${candidate.product.name} dalam draf PO`}
                          onChange={(e) =>
                            setSelected((prev) => ({ ...prev, [candidate.product.id]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded-[5px] border-border-strong accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-text">{candidate.product.name}</div>
                        <div className="num text-[11.5px] text-text-faint">
                          {candidate.product.sku} - {candidate.note}
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-right text-text">
                        {formatNumber(candidate.qty)}
                        <span className="ml-1 text-[11px] text-text-faint">
                          {candidate.avgDailyDemand.toFixed(2)}/hari
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="num text-text">{formatRupiah(candidate.totalCost)}</div>
                        <div className="num text-[11px] text-text-faint">
                          {formatRupiah(candidate.unitCost)}/unit
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-right text-text-muted">{candidate.gmroi.toFixed(2)}</td>
                      <td className="num px-4 py-3 text-right text-text-muted">
                        {Number.isFinite(candidate.daysOfCover) ? `${Math.round(candidate.daysOfCover)} hari` : "-"}
                      </td>
                      <td
                        className={cn(
                          "num px-4 py-3 text-right",
                          candidate.paybackDays > 90 ? "text-warning" : "text-text-muted"
                        )}
                      >
                        {Math.round(candidate.paybackDays)} hari
                      </td>
                      <td className="num px-4 py-3 text-right text-text-muted">{candidate.leadTimeDays} hari</td>
                      <td className="px-4 py-3">
                        <Badge tone={isFunded ? "ok" : "warn"}>{isFunded ? "Didanai" : "Ditunda"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-border px-5 py-3.5">
          <p className="text-[12.5px] text-text-muted">
            Total kas yang dibutuhkan untuk kandidat didanai {formatRupiah(plan.totalFunded)} dan yang ditunda{" "}
            {formatRupiah(deferredTotal)}. Open-to-buy saat ini {formatRupiah(plan.openToBuy)} pada alokasi{" "}
            {plan.allocationPct}%.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ util */

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 10)}...`;
}

/** Akhir garansi = tanggal masuk + masa garansi bulan (kalender, bukan 30 hari). */
function warrantyEnd(receivedAt: string, months: number): string {
  const base = new Date(receivedAt);
  const end = new Date(base.getTime());
  end.setMonth(end.getMonth() + months);
  return end.toISOString();
}

function InventoryLoading() {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="px-5 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-36" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-11 w-full" />
      <Card className="p-4">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <Skeleton key={index} className="mt-2 h-9" />
        ))}
      </Card>
    </div>
  );
}
