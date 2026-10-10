"use client";

/* ============================================================================
   /app/sales - Riwayat penjualan.
   Semua angka dihitung di klien dari dataset yang sama dengan mesin metrik.
   Tidak ada library tabel baru: tabel HTML biasa agar mudah diaudit.
   ========================================================================= */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  CaretRight,
  DownloadSimple,
  EnvelopeSimple,
  Funnel,
  MagnifyingGlass,
  Printer,
  Prohibit,
  Receipt,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { PAYMENT_LABEL } from "@/lib/constants";
import { daysBetween, formatDate, formatDateTime, formatNumber, formatPct, formatRupiah } from "@/lib/money";
import { useFrizzy, type Mutation } from "@/lib/store";
import type { ID, PaymentMethod, Sale, SaleItem, SaleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/Feedback";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { Kpi } from "@/components/ui/Kpi";
import { Overlay } from "@/components/ui/Overlay";

/* ------------------------------------------------------------ tipe internal */

type RangeId = "7" | "30" | "90" | "all";
type StatusFilter = "all" | "completed" | "void" | "refunded";

type RangeOption = { id: RangeId; label: string; days: number | null };

const RANGES: RangeOption[] = [
  { id: "7", label: "7 hari", days: 7 },
  { id: "30", label: "30 hari", days: 30 },
  { id: "90", label: "90 hari", days: 90 },
  { id: "all", label: "Semua", days: null },
];

const STATUS_LABEL: Record<SaleStatus, string> = {
  completed: "Selesai",
  pending: "Tertunda",
  void: "Void",
  refunded: "Refund",
};

const STATUS_TONE: Record<SaleStatus, Tone> = {
  completed: "ok",
  pending: "warn",
  void: "danger",
  refunded: "danger",
};

const DELIVERY_LABEL: Record<string, string> = {
  queued: "Menunggu antrean",
  sent: "Terkirim",
  opened: "Dibuka pelanggan",
  failed: "Gagal kirim",
};

const DELIVERY_CHANNEL: Record<string, string> = {
  email: "Email",
  print: "Cetak",
  whatsapp_link: "Tautan WhatsApp",
  qr: "QR",
};

type Row = {
  sale: Sale;
  items: SaleItem[];
  lineCount: number;
  qtyCount: number;
  cashierName: string;
  customerName: string;
  customerId: ID | null;
  payments: PaymentMethod[];
  methodsLabel: string;
  margin: number;
  belowCost: boolean;
};

const PAGE_SIZE = 100;

/* --------------------------------------------------------------- halaman */

export default function SalesPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);
  const toasts = useFrizzy((s) => s.toasts);
  const toast = useFrizzy((s) => s.toast);
  const role = useFrizzy((s) => s.role);
  const requestApproval = useFrizzy((s) => s.requestApproval);

  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeId>("30");
  const [cashier, setCashier] = useState<string>("all");
  const [payment, setPayment] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [belowCostOnly, setBelowCostOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [detailId, setDetailId] = useState<ID | null>(null);
  const [voidId, setVoidId] = useState<ID | null>(null);
  const [voidReason, setVoidReason] = useState("");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const resetFilters = useCallback(() => {
    setQuery("");
    setRange("30");
    setCashier("all");
    setPayment("all");
    setStatusFilter("all");
    setBelowCostOnly(false);
    setVisible(PAGE_SIZE);
  }, []);

  const baseRows = useMemo<Row[]>(() => {
    if (!data) return [];
    const userName = new Map(data.users.map((u) => [u.id, u.name]));
    const customerName = new Map(data.customers.map((c) => [c.id, c.name]));
    const itemsBySale = new Map<ID, SaleItem[]>();
    for (const item of data.saleItems) {
      const list = itemsBySale.get(item.saleId);
      if (list) list.push(item);
      else itemsBySale.set(item.saleId, [item]);
    }
    const paymentsBySale = new Map<ID, PaymentMethod[]>();
    for (const p of data.payments) {
      const list = paymentsBySale.get(p.saleId);
      if (list) {
        if (!list.includes(p.method)) list.push(p.method);
      } else {
        paymentsBySale.set(p.saleId, [p.method]);
      }
    }

    return data.sales
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((sale) => {
        const items = itemsBySale.get(sale.id) ?? [];
        const methods = paymentsBySale.get(sale.id) ?? [];
        const margin = items.reduce((sum, it) => sum + it.margin, 0);
        const belowCost = items.some((it) => it.lineTotal < it.unitCost * it.qty);
        const qtyCount = items.reduce((sum, it) => sum + it.qty, 0);
        const customerLabel = sale.customerId === null ? "Pelanggan umum" : customerName.get(sale.customerId) ?? "Pelanggan umum";
        const methodsLabel =
          methods.length === 0
            ? "-"
            : methods.map((m) => PAYMENT_LABEL[m] ?? m).join(" + ");
        return {
          sale,
          items,
          lineCount: items.length,
          qtyCount,
          cashierName: userName.get(sale.userId) ?? "Kasir",
          customerName: customerLabel,
          customerId: sale.customerId,
          payments: methods,
          methodsLabel,
          margin,
          belowCost,
        };
      });
  }, [data]);

  const cutoff = useMemo(() => {
    if (!ctx) return null;
    const option = RANGES.find((r) => r.id === range);
    const days = option?.days ?? null;
    if (days === null) return null;
    return Date.parse(ctx.data.asOf) - days * 86_400_000;
  }, [ctx, range]);

  const filtered = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase();
    return baseRows.filter((row) => {
      if (cutoff !== null && Date.parse(row.sale.createdAt) < cutoff) return false;
      if (cashier !== "all" && row.sale.userId !== cashier) return false;
      if (payment !== "all" && !row.payments.includes(payment as PaymentMethod)) return false;
      if (statusFilter !== "all" && row.sale.status !== statusFilter) return false;
      if (belowCostOnly && !row.belowCost) return false;
      if (needle.length > 0) {
        const haystack = [
          row.sale.receiptNo,
          row.customerName,
          row.cashierName,
          ...row.items.map((it) => it.name),
          ...row.items.map((it) => it.imei ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [baseRows, cutoff, cashier, payment, statusFilter, belowCostOnly, query]);

  const metrics = useMemo(() => {
    let omzet = 0;
    let laba = 0;
    let struk = 0;
    for (const row of filtered) {
      struk += 1;
      if (row.sale.status === "void") continue;
      omzet += row.sale.grandTotal;
      laba += row.margin;
    }
    const average = struk === 0 ? 0 : Math.round(omzet / struk);
    return { omzet, laba, struk, average };
  }, [filtered]);

  const detailRow = useMemo(() => {
    if (detailId === null) return null;
    return baseRows.find((row) => row.sale.id === detailId) ?? null;
  }, [baseRows, detailId]);

  const auditForDetail = useMemo(() => {
    if (!data || !detailRow) return [];
    return data.auditLog
      .filter((entry) => entry.entityId === detailRow.sale.id)
      .slice()
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [data, detailRow]);

  const exportCsv = useCallback(() => {
    const escape = (value: string | number): string => {
      const text = String(value);
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = [
      "No Struk",
      "Tanggal",
      "Kasir",
      "Pelanggan",
      "Item",
      "Subtotal",
      "Diskon",
      "Total",
      "HPP",
      "Laba",
      "Metode",
      "Status",
    ];
    const lines = filtered.map((row) =>
      [
        row.sale.receiptNo,
        formatDateTime(row.sale.createdAt),
        row.cashierName,
        row.customerName,
        row.items.map((it) => `${it.name} x${it.qty}`).join(" | "),
        row.sale.subtotal,
        row.sale.discountTotal,
        row.sale.grandTotal,
        row.sale.cogsTotal,
        row.margin,
        row.methodsLabel,
        STATUS_LABEL[row.sale.status],
      ]
        .map(escape)
        .join(";")
    );
    const csv = [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `riwayat-penjualan-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Ekspor selesai",
      body: `${filtered.length} struk ditulis ke berkas CSV.`,
      tone: "ok",
    });
  }, [filtered, toast]);

  const askVoid = useCallback(
    (sale: Sale) => {
      if (role !== "owner") {
        requestApproval({
          kind: "void",
          message: `Void struk ${sale.receiptNo} senilai ${formatRupiah(sale.grandTotal)} memerlukan persetujuan pemilik. Stok dan kas akan dikembalikan setelah disetujui.`,
          onApprove: () => {
            /* Persetujuan pemilik dijalankan dari layar persetujuan; tidak ada mutasi di sini. */
          },
        });
        return;
      }
      setVoidReason("");
      setVoidId(sale.id);
    },
    [requestApproval, role]
  );

  const askRefund = useCallback(
    (sale: Sale) => {
      if (role !== "owner") {
        requestApproval({
          kind: "void",
          message: `Refund struk ${sale.receiptNo} senilai ${formatRupiah(sale.grandTotal)} memerlukan persetujuan pemilik. Unit yang dikembalikan akan masuk status returned.`,
          onApprove: () => {
            /* Menunggu tindakan pemilik. */
          },
        });
        return;
      }
      const actorId = useFrizzy.getState().userId;
      if (actorId === null) {
        toast({ title: "Tidak bisa refund", body: "Sesi pengguna tidak dikenali.", tone: "danger" });
        return;
      }
      const mutation: Mutation = {
        type: "refund_sale",
        saleId: sale.id,
        reason: "Refund dari riwayat penjualan",
        actorId,
      };
      useFrizzy.getState().mutate(mutation);
      toast({ title: "Refund tercatat", body: `${sale.receiptNo} ditandai refund dan stok dikembalikan.`, tone: "warn" });
    },
    [requestApproval, role, toast]
  );

  const confirmVoid = useCallback(() => {
    if (voidId === null) return;
    const actorId = useFrizzy.getState().userId;
    if (actorId === null) {
      toast({ title: "Tidak bisa void", body: "Sesi pengguna tidak dikenali.", tone: "danger" });
      return;
    }
    const reason = voidReason.trim().length > 0 ? voidReason.trim() : "Void tanpa catatan";
    const mutation: Mutation = { type: "void_sale", saleId: voidId, reason, actorId };
    useFrizzy.getState().mutate(mutation);
    setVoidId(null);
    setVoidReason("");
    toast({ title: "Struk di-void", body: "Stok dikembalikan dan kas dicatat sebagai kas keluar.", tone: "warn" });
  }, [toast, voidId, voidReason]);

  const activeFilterCount =
    (query.trim().length > 0 ? 1 : 0) +
    (range === "30" ? 0 : 1) +
    (cashier === "all" ? 0 : 1) +
    (payment === "all" ? 0 : 1) +
    (statusFilter === "all" ? 0 : 1) +
    (belowCostOnly ? 1 : 0);

  if (status === "loading" || status === "idle") {
    return <SalesLoading />;
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[1100px]">
        <Alert
          tone="danger"
          title="Gagal memuat riwayat penjualan"
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
          {error ?? "Data penjualan tidak dapat diambil dari server."}
        </Alert>
      </div>
    );
  }

  const shown = filtered.slice(0, visible);
  const k = ctx?.kpis;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <SectionTitle
        eyebrow="Operasional"
        title="Penjualan"
        hint="Riwayat struk, IMEI yang terjual, laba per transaksi, dan status pengiriman struk."
        right={
          <Button
            variant="secondary"
            icon={<DownloadSimple size={17} />}
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            Ekspor CSV
          </Button>
        }
      />

      {/* ---------------------------------------------------------- KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Jumlah struk"
          value={metrics.struk}
          format="number"
          subject="struk"
          hint={`${formatNumber(filtered.length)} struk lolos filter dari ${formatNumber(baseRows.length)} total struk.`}
          sub={`Periode ${k ? `${k.days} hari terakhir` : "berjalan"}`}
        />
        <Kpi
          label="Omzet bersih"
          value={metrics.omzet}
          format="rupiah"
          tone="ok"
          hint="Total struk dikurangi struk berstatus void."
          sub={`Rata-rata harian ${k ? formatRupiah(k.avgDailySales) : "-"}`}
        />
        <Kpi
          label="Laba kotor"
          value={metrics.laba}
          format="rupiah"
          tone={metrics.laba < 0 ? "danger" : "ok"}
          hint="Jumlah margin baris penjualan pada struk yang difilter."
          sub={k ? `Margin kotor toko ${formatPct(k.grossMarginPct)}` : undefined}
        />
        <Kpi
          label="Rata-rata nilai struk"
          value={metrics.average}
          format="rupiah"
          hint="Omzet bersih dibagi jumlah struk yang difilter."
          sub={k ? `${formatPct(k.attachRatePct, 0)} struk handset disertai aksesori` : undefined}
        />
      </div>

      {/* ------------------------------------------------------- filter */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Input
              label="Cari"
              placeholder="No struk, nama item, IMEI, pelanggan"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
            />
          </div>
          <div className="lg:col-span-2">
            <Select
              label="Rentang tanggal"
              value={range}
              onChange={(e) => {
                const next = e.target.value;
                setRange(next === "7" || next === "30" || next === "90" || next === "all" ? next : "30");
                setVisible(PAGE_SIZE);
              }}
            >
              {RANGES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Select
              label="Kasir"
              value={cashier}
              onChange={(e) => {
                setCashier(e.target.value);
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="all">Semua kasir</option>
              {data?.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Select
              label="Metode bayar"
              value={payment}
              onChange={(e) => {
                setPayment(e.target.value);
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="all">Semua metode</option>
              {Object.entries(PAYMENT_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Select
              label="Status struk"
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(
                  next === "completed" || next === "void" || next === "refunded" ? next : "all"
                );
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="all">Semua status</option>
              <option value="completed">Selesai</option>
              <option value="void">Void</option>
              <option value="refunded">Refund</option>
            </Select>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
          <button
            type="button"
            aria-pressed={belowCostOnly}
            onClick={() => {
              setBelowCostOnly((value) => !value);
              setVisible(PAGE_SIZE);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              belowCostOnly
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-border bg-surface-2 text-text-muted hover:text-text"
            )}
          >
            <WarningCircle size={15} weight={belowCostOnly ? "fill" : "regular"} />
            Hanya di bawah HPP
          </button>
          {belowCostOnly ? (
            <span className="text-[12px] text-text-faint">
              {k ? `${k.belowCostCount} baris di bawah HPP, kerugian ${formatRupiah(k.belowCostLoss)}` : ""}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2 text-[12px] text-text-muted">
            <Funnel size={15} />
            {activeFilterCount === 0 ? "Tanpa filter tambahan" : `${activeFilterCount} filter aktif`}
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset filter
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------- tabel */}
      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={<Receipt size={30} />}
            title="Tidak ada struk yang cocok"
            body="Ubah kata kunci, rentang tanggal, atau status. Filter bisa direset untuk melihat semua penjualan."
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Reset filter
              </Button>
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <caption className="sr-only">
                Riwayat penjualan: nomor struk, kasir, pelanggan, jumlah item, total, laba, metode bayar, dan status
              </caption>
              <thead>
                <tr className="border-b border-border text-text-faint">
                  <th scope="col" className="px-4 py-3 font-medium">
                    No struk
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Kasir
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Pelanggan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Item
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Laba
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Metode
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr
                    key={row.sale.id}
                    onClick={() => setDetailId(row.sale.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="num font-medium text-text">{row.sale.receiptNo}</div>
                      <div className="text-[11.5px] text-text-faint">
                        {formatDateTime(row.sale.createdAt)} - {relativeLabel(row.sale.createdAt, ctx?.data.asOf)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{row.cashierName}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {row.customerName}
                      {row.belowCost ? (
                        <span className="ml-2">
                          <Badge tone="danger">Di bawah HPP</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-4 py-3 text-right text-text-muted">
                      {row.qtyCount}
                      <span className="ml-1 text-[11.5px] text-text-faint">
                        {row.lineCount} baris
                      </span>
                    </td>
                    <td className="num px-4 py-3 text-right font-medium text-text">
                      {formatRupiah(row.sale.grandTotal)}
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-3 text-right font-medium",
                        row.margin < 0 ? "text-danger" : "text-text"
                      )}
                    >
                      {formatRupiah(row.margin)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{row.methodsLabel}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.sale.status]}>{STATUS_LABEL[row.sale.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(row.sale.id);
                        }}
                        aria-label={`Buka detail struk ${row.sale.receiptNo}`}
                      >
                        Detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > shown.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-[12px] text-text-muted">
              Menampilkan {formatNumber(shown.length)} dari {formatNumber(filtered.length)} struk
            </span>
            <Button variant="secondary" size="sm" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
              Muat 100 lagi
            </Button>
          </div>
        ) : null}
      </Card>

      {/* -------------------------------------------------------- drawer */}
      <Overlay
        open={detailRow !== null}
        onClose={() => setDetailId(null)}
        variant="drawer"
        title={detailRow ? `Struk ${detailRow.sale.receiptNo}` : "Detail struk"}
        description={
          detailRow
            ? `${formatDateTime(detailRow.sale.createdAt)} - kasir ${detailRow.cashierName}`
            : undefined
        }
        footer={
          detailRow ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer size={16} />}
                onClick={() =>
                  toast({
                    title: "Perintah cetak dikirim",
                    body: `Struk ${detailRow.sale.receiptNo} dikirim ke printer termal kasir.`,
                    tone: "ok",
                  })
                }
              >
                Cetak ulang
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<EnvelopeSimple size={16} />}
                onClick={() =>
                  toast({
                    title: "Email struk diantrekan",
                    body: detailRow.sale.customerId
                      ? "Struk akan dikirim ke email pelanggan yang terdaftar."
                      : "Tidak ada email pelanggan; struk hanya bisa dicetak.",
                    tone: detailRow.sale.customerId ? "ok" : "warn",
                  })
                }
              >
                Kirim ulang email
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Prohibit size={16} />}
                disabled={detailRow.sale.status === "void"}
                onClick={() => askVoid(detailRow.sale)}
              >
                Void struk
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowCounterClockwise size={16} />}
                disabled={detailRow.sale.status === "refunded"}
                onClick={() => askRefund(detailRow.sale)}
              >
                Refund
              </Button>
              {role !== "owner" ? (
                <span className="text-[11.5px] text-text-faint">
                  Aksi void dan refund butuh persetujuan pemilik.
                </span>
              ) : null}
            </div>
          ) : null
        }
      >
        {detailRow ? (
          <SalesDetail
            row={detailRow}
            asOf={ctx?.data.asOf ?? ""}
            data={data}
            audit={auditForDetail}
          />
        ) : null}
      </Overlay>

      {/* --------------------------------------------------- modal void */}
      <Overlay
        open={voidId !== null}
        onClose={() => setVoidId(null)}
        size="sm"
        title="Void struk"
        description="Stok dikembalikan ke rak dan kas dicatat sebagai uang keluar. Tindakan ini masuk jejak audit."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVoidId(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={confirmVoid}>
              Void sekarang
            </Button>
          </div>
        }
      >
        <Input
          label="Alasan void"
          placeholder="Contoh: salah input IMEI"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          hint="Alasan disimpan pada struk dan jejak audit."
        />
      </Overlay>

      {/* toast ringkas agar halaman tetap mandiri tanpa shell */}
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed bottom-4 right-4 flex w-[min(360px,90vw)] flex-col gap-2" aria-live="polite">
          {toasts.map((item) => (
            <div key={item.id} className="card px-4 py-3 shadow-overlay">
              <p className="text-[13px] font-semibold text-text">{item.title}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- sub-komponen */

function SalesDetail({
  row,
  asOf,
  data,
  audit,
}: {
  row: Row;
  asOf: string;
  data: ReturnType<typeof useFrizzy.getState>["data"];
  audit: { id: ID; action: string; detail: string; at: string; actorId: ID }[];
}) {
  if (!data) return null;
  const customer = row.customerId === null ? null : data.customers.find((c) => c.id === row.customerId) ?? null;
  const deliveries = data.receiptDeliveries.filter((d) => d.saleId === row.sale.id);
  const reviews = data.reviewRequests.filter((r) => r.saleId === row.sale.id);
  const actorName = (actorId: ID) => data.users.find((u) => u.id === actorId)?.name ?? "Sistem";

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="label-caps mb-2">Ringkasan</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <Detail label="Tanggal" value={formatDateTime(row.sale.createdAt)} />
          <Detail label="Umur struk" value={relativeLabel(row.sale.createdAt, asOf)} />
          <Detail label="Status" value={STATUS_LABEL[row.sale.status]} />
          <Detail label="Kasir" value={row.cashierName} />
          <Detail
            label="Pelanggan"
            value={
              customer
                ? `${customer.name} - ${customer.phone}`
                : row.sale.customerId === null
                  ? "Pelanggan umum"
                  : row.customerName
            }
          />
          <Detail label="Metode bayar" value={row.methodsLabel} />
          {row.sale.discountReason.length > 0 ? (
            <Detail label="Alasan diskon" value={row.sale.discountReason} />
          ) : null}
          {row.sale.note.length > 0 ? <Detail label="Catatan struk" value={row.sale.note} /> : null}
        </dl>
      </section>

      <section>
        <h3 className="label-caps mb-2">Item ({row.items.length} baris)</h3>
        <ul className="flex flex-col gap-2">
          {row.items.map((item) => {
            const below = item.lineTotal < item.unitCost * item.qty;
            return (
              <li key={item.id} className="rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text">
                      {item.name}
                      {item.lineType === "tradein" ? (
                        <span className="ml-2">
                          <Badge tone="info">Tukar tambah</Badge>
                        </span>
                      ) : null}
                      {item.lineType === "service" ? (
                        <span className="ml-2">
                          <Badge tone="neutral">Jasa</Badge>
                        </span>
                      ) : null}
                    </p>
                    <p className="num mt-0.5 text-[11.5px] text-text-faint">
                      {item.qty} x {formatRupiah(item.unitPrice)}
                      {item.discount > 0 ? ` - diskon ${formatRupiah(item.discount)}` : ""}
                    </p>
                    {item.imei ? (
                      <p className="num mt-0.5 text-[11.5px] text-text-muted">
                        IMEI {item.imei}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-[13px] font-medium text-text">{formatRupiah(item.lineTotal)}</p>
                    <p className={cn("num text-[11.5px]", item.margin < 0 ? "text-danger" : "text-text-muted")}>
                      laba {formatRupiah(item.margin)}
                    </p>
                    {below ? (
                      <p className="text-[11px] font-medium text-danger">
                        di bawah HPP {formatRupiah(item.unitCost * item.qty)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="label-caps mb-2">Rincian pembayaran</h3>
        <ul className="flex flex-col">
          <Line label="Subtotal" value={formatRupiah(row.sale.subtotal)} />
          <Line label="Diskon" value={`- ${formatRupiah(row.sale.discountTotal)}`} />
          <Line label="Total tagihan" value={formatRupiah(row.sale.grandTotal)} strong />
          <Line label="HPP barang" value={formatRupiah(row.sale.cogsTotal)} />
          <Line label="Laba kotor" value={formatRupiah(row.margin)} strong />
        </ul>
        <ul className="mt-2 flex flex-col">
          {row.payments.length === 0 ? (
            <Line label="Pembayaran" value="Belum ada pembayaran tercatat" />
          ) : (
            row.payments.map((method) => {
              const total = data.payments
                .filter((p) => p.saleId === row.sale.id && p.method === method)
                .reduce((sum, p) => sum + p.amount, 0);
              return (
                <Line
                  key={method}
                  label={PAYMENT_LABEL[method] ?? method}
                  value={formatRupiah(total)}
                />
              );
            })
          )}
        </ul>
      </section>

      <section>
        <h3 className="label-caps mb-2">Pengiriman struk</h3>
        {deliveries.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">Belum ada pengiriman struk tercatat.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-text-muted">
                  {DELIVERY_CHANNEL[delivery.channel] ?? delivery.channel}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={delivery.status === "failed" ? "danger" : delivery.status === "queued" ? "warn" : "ok"}>
                    {DELIVERY_LABEL[delivery.status] ?? delivery.status}
                  </Badge>
                  <span className="num text-text-faint">
                    {delivery.sentAt ? formatDateTime(delivery.sentAt) : "belum terkirim"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="label-caps mb-2">Permintaan ulasan</h3>
        {reviews.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">
            {row.sale.customerId === null
              ? "Pelanggan umum tanpa izin email, tidak ada permintaan ulasan."
              : "Belum ada permintaan ulasan untuk struk ini."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {reviews.map((review) => (
              <li key={review.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="num text-text-muted">Kode {review.shortCode}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={review.clickedAt ? "ok" : review.sentAt ? "info" : "warn"}>
                    {review.clickedAt ? "Diklik" : review.sentAt ? "Terkirim" : "Dijadwalkan"}
                  </Badge>
                  <span className="num text-text-faint">{formatDateTime(review.scheduledAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="label-caps mb-2">Jejak audit</h3>
        {audit.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">Belum ada catatan audit untuk struk ini.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {audit.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 text-[12.5px]">
                <CaretRight size={13} className="mt-1 shrink-0 text-text-faint" />
                <div className="min-w-0">
                  <p className="num text-text">{entry.action}</p>
                  <p className="text-text-muted">{entry.detail}</p>
                  <p className="text-[11.5px] text-text-faint">
                    {actorName(entry.actorId)} - {formatDateTime(entry.at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-text-faint">{label}</dt>
      <dd className="text-[13px] text-text">{value}</dd>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className={cn("text-[13px]", strong ? "font-semibold text-text" : "text-text-muted")}>{label}</span>
      <span className={cn("num text-[13px]", strong ? "font-semibold text-text" : "text-text")}>{value}</span>
    </li>
  );
}

function SalesLoading() {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="px-5 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-3 h-3 w-40" />
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className={cn("h-16", index === 0 ? "lg:col-span-4" : "lg:col-span-2")} />
          ))}
        </div>
      </Card>
      <Card className="p-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
          <Skeleton key={index} className="mt-2 h-9" />
        ))}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ util */

function relativeLabel(iso: string, asOf: string | undefined): string {
  if (!asOf) return formatDate(iso);
  const days = daysBetween(iso, asOf);
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  if (days < 30) return `${days} hari lalu`;
  return `${Math.round(days / 30)} bulan lalu`;
}

