"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  CaretRight,
  CheckCircle,
  MagnifyingGlass,
  Minus,
  Plus,
  Printer,
  Receipt,
  Storefront,
  Trash,
  WarningCircle,
  X,
  EnvelopeSimple,
  QrCode,
  PauseCircle,
  ArrowCounterClockwise,
} from "@phosphor-icons/react/dist/ssr";
import { useFrizzy, cartTotals, type CartLine } from "@/lib/store";
import { useCtx } from "@/lib/store";
import { formatCompact, formatRupiah, formatDateTime } from "@/lib/money";
import { PAYMENT_LABEL, PRODUCT_KIND_LABEL, SHOP } from "@/lib/constants";
import type { Customer, InventoryUnit, PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { MoneyInput, Select, Checkbox } from "@/components/ui/Field";
import { Overlay } from "@/components/ui/Overlay";
import { Icon } from "@/components/ui/Icon";

type PaymentLine = { method: PaymentMethod; amount: number };

export default function PosPage() {
  const status = useFrizzy((s) => s.status);
  const hydrate = useFrizzy((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status !== "ready") return <PosSkeleton />;
  return <PosWorkspace />;
}

function PosSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-12" aria-busy="true">
      <div className="space-y-3 lg:col-span-7">
        <Skeleton className="h-12 w-full rounded-[10px]" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="space-y-3 lg:col-span-5">
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    </div>
  );
}

function PosWorkspace() {
  const ctx = useCtx();
  const data = ctx.data;
  const role = useFrizzy((s) => s.role);
  const cart = useFrizzy((s) => s.cart);
  const cartCustomerId = useFrizzy((s) => s.cartCustomerId);
  const cartDiscountPct = useFrizzy((s) => s.cartDiscountPct);
  const heldCarts = useFrizzy((s) => s.heldCarts);
  const addToCart = useFrizzy((s) => s.addToCart);
  const removeLine = useFrizzy((s) => s.removeLine);
  const setQty = useFrizzy((s) => s.setQty);
  const setLinePrice = useFrizzy((s) => s.setLinePrice);
  const setLineDiscount = useFrizzy((s) => s.setLineDiscount);
  const clearCart = useFrizzy((s) => s.clearCart);
  const setCartCustomer = useFrizzy((s) => s.setCartCustomer);
  const setCartDiscountPct = useFrizzy((s) => s.setCartDiscountPct);
  const holdCart = useFrizzy((s) => s.holdCart);
  const resumeCart = useFrizzy((s) => s.resumeCart);
  const dropHeld = useFrizzy((s) => s.dropHeld);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const completeSale = useFrizzy((s) => s.completeSale);
  const toast = useFrizzy((s) => s.toast);
  const userId = useFrizzy((s) => s.userId);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "handset" | "accessory" | "voucher" | "service">("all");
  const [imeiProduct, setImeiProduct] = useState<Product | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "cash", amount: 0 }]);
  const [cashTendered, setCashTendered] = useState(0);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [receiptFor, setReceiptFor] = useState<{ id: string; items: typeof data.saleItems } | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const totals = cartTotals(cart, cartDiscountPct);
  const customer = data.customers.find((c) => c.id === cartCustomerId) ?? null;

  /* stok tersedia per produk (memperhitungkan isi keranjang) */
  const availableQty = useMemo(() => {
    const inCart = new Map<string, number>();
    for (const l of cart) inCart.set(l.productId, (inCart.get(l.productId) ?? 0) + l.qty);
    const map = new Map<string, number>();
    for (const m of ctx.byProduct.values()) {
      map.set(m.product.id, Math.max(0, m.qty - (inCart.get(m.product.id) ?? 0)));
    }
    return map;
  }, [cart, ctx.byProduct]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const products = data.products.filter((p) => p.isActive);
    const filtered = products.filter((p) => {
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.barcode.includes(q)
      );
    });
    return filtered.slice(0, 60);
  }, [data.products, kindFilter, query]);

  const marginGuard = useMemo(() => {
    return cart.map((l) => {
      const lineTotal = l.unitPrice * l.qty - l.discount;
      const margin = lineTotal - l.unitCost * l.qty;
      const marginPct = lineTotal === 0 ? 0 : (margin / lineTotal) * 100;
      const product = data.products.find((p) => p.id === l.productId);
      const belowMinPrice = product ? l.unitPrice < product.minPrice : false;
      const belowMinMargin = marginPct < (product?.minMarginPct ?? data.profile.minMarginPct);
      return { key: l.key, margin, marginPct, belowMinPrice, belowMinMargin, blocked: belowMinPrice || belowMinMargin };
    });
  }, [cart, data.products, data.profile.minMarginPct]);

  const blocked = marginGuard.filter((g) => g.blocked);
  const belowCost = marginGuard.filter((g) => g.margin < 0);
  const discountOverLimit = cartDiscountPct > data.profile.staffDiscountLimitPct;

  /* pintasan papan ketik */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F4" && cart.length > 0) {
        e.preventDefault();
        setPayOpen(true);
      }
      if (e.key === "Escape" && !payOpen) {
        setImeiProduct(null);
        setCustomerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length, payOpen]);

  const pickProduct = (product: Product) => {
    const stock = availableQty.get(product.id) ?? 0;
    if (product.kind === "service") {
      addToCart(product);
      return;
    }
    if (stock <= 0) {
      toast({
        title: "Stok tidak tersedia",
        body: `${product.name} sedang kosong. Catat di daftar pesanan ulang.`,
        tone: "warn",
      });
      return;
    }
    if (product.isSerialized) {
      const unit = data.units.find((u) => u.productId === product.id && u.status === "in_stock");
      if (!unit) {
        toast({ title: "Tidak ada IMEI siap jual", body: "Semua unit produk ini sudah terjual.", tone: "warn" });
        return;
      }
      setImeiProduct(product);
      return;
    }
    addToCart(product);
  };

  const openPayment = () => {
    if (cart.length === 0) return;
    if (role === "staff" && blocked.length > 0) {
      requestApproval({
        kind: blocked.some((b) => b.belowMinPrice) ? "below_min" : "discount",
        message: `${blocked.length} baris di bawah batas margin minimum. Minta pemilik menyetujui sebelum pembayaran.`,
        onApprove: () => {
          setPayOpen(true);
          toast({ title: "Disetujui", body: "Transaksi boleh dilanjutkan dengan harga khusus.", tone: "ok" });
        },
      });
      return;
    }
    if (role === "staff" && discountOverLimit) {
      requestApproval({
        kind: "discount",
        message: `Diskon ${cartDiscountPct}% melebihi batas staf (${data.profile.staffDiscountLimitPct}%).`,
        onApprove: () => setPayOpen(true),
      });
      return;
    }
    setPayments([{ method: "cash", amount: totals.total }]);
    setCashTendered(0);
    setPayOpen(true);
  };

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const change = payments.some((p) => p.method === "cash") ? Math.max(0, paidTotal - totals.total) : 0;

  const finalize = () => {
    if (!userId) return;
    if (paidTotal < totals.total) {
      toast({ title: "Pembayaran kurang", body: `Masih kurang ${formatRupiah(totals.total - paidTotal)}.`, tone: "warn" });
      return;
    }
    const result = completeSale({
      payments,
      userId,
      customerId: cartCustomerId,
      discountReason: discountOverLimit ? "Disetujui pemilik di atas batas staf" : "Nego di konter",
      note: "",
    });
    if (!result) return;
    setPayOpen(false);
    setMobileCartOpen(false);
    setReceiptFor({ id: result.sale.id, items: result.items });
  };

  const saleCustomer = receiptFor ? data.customers.find((c) => c.id === data.sales.find((s) => s.id === receiptFor.id)?.customerId) : null;
  const receiptSale = receiptFor ? data.sales.find((s) => s.id === receiptFor.id) : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text md:text-2xl">POS</h1>
          <p className="text-[13px] text-text-muted">
            {role === "owner" ? "Akses penuh, termasuk harga pokok dan override." : "Mode staf: harga pokok disembunyikan."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {heldCarts.length > 0 ? (
            <div className="flex items-center gap-2">
              <Badge tone="info" icon={<PauseCircle size={13} />}>
                {heldCarts.length} keranjang ditahan
              </Badge>
              {heldCarts.map((h) => (
                <div key={h.id} className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
                  <span className="num text-[11.5px] text-text-muted">{h.label}</span>
                  <button
                    type="button"
                    onClick={() => resumeCart(h.id)}
                    className="rounded-full p-1 text-accent hover:bg-accent-soft"
                    aria-label={`Lanjutkan keranjang ${h.label}`}
                  >
                    <ArrowCounterClockwise size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => dropHeld(h.id)}
                    className="rounded-full p-1 text-text-faint hover:text-danger"
                    aria-label={`Buang keranjang ${h.label}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <Badge tone="ok" icon={<CheckCircle size={13} weight="fill" />}>
            Online
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* ------------------------------------------------------ katalog */}
        <section className="lg:col-span-7">
          <div className="card px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-10 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3">
                  <Barcode size={18} className="text-text-faint" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Scan barcode / IMEI, atau cari nama, SKU, merek"
                    className="h-10 w-full min-w-0 bg-transparent text-[14px] text-text outline-none placeholder:text-text-faint md:w-[420px]"
                    aria-label="Cari produk"
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery("")} className="text-text-faint hover:text-text" aria-label="Bersihkan pencarian">
                      <X size={15} />
                    </button>
                  ) : null}
                </span>
                <span className="num hidden items-center gap-1 rounded border border-border px-2 py-1 text-[10.5px] text-text-faint md:flex">
                  F2 cari - F4 bayar
                </span>
              </div>

              <div className="scroll-x flex items-center gap-2">
                {(
                  [
                    ["all", "Semua"],
                    ["handset", "Handset"],
                    ["accessory", "Aksesori"],
                    ["voucher", "Voucher"],
                    ["service", "Jasa"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={kindFilter === id}
                    onClick={() => setKindFilter(id)}
                    className={cn(
                      "h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                      kindFilter === id
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-text-muted hover:bg-surface-2"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {results.map((p) => {
              const stock = availableQty.get(p.id) ?? 0;
              const metric = ctx.byProduct.get(p.id);
              const empty = p.kind !== "service" && stock <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className={cn(
                    "card flex flex-col gap-1.5 px-3.5 py-3 text-left transition-all hover:border-border-strong active:translate-y-[1px]",
                    empty && "opacity-55"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="label-caps">{PRODUCT_KIND_LABEL[p.kind]}</span>
                    <span
                      className={cn(
                        "num text-[11px]",
                        empty ? "text-danger" : stock <= (metric?.reorderPoint ?? 0) ? "text-warning" : "text-text-faint"
                      )}
                    >
                      {p.kind === "service" ? "jasa" : `stok ${stock}`}
                    </span>
                  </div>
                  <span className="line-clamp-2 min-h-[38px] text-[13.5px] font-medium leading-snug text-text">{p.name}</span>
                  <span className="num text-[15px] font-semibold text-text">{formatRupiah(p.price)}</span>
                  <div className="flex items-center justify-between">
                    <span className="num text-[11px] text-text-faint">{p.sku}</span>
                    {role === "owner" ? (
                      <span className="num text-[11px] text-accent">margin {formatCompact(p.price - p.cost)}</span>
                    ) : metric ? (
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          p.price >= p.minPrice ? "text-accent" : "text-danger"
                        )}
                      >
                        {p.price >= p.minPrice ? "margin aman" : "di bawah batas"}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {results.length === 0 ? (
            <div className="card mt-3">
              <EmptyState
                icon={<MagnifyingGlass size={26} />}
                title="Produk tidak ditemukan"
                body="Coba kata kunci lain, scan barcode, atau ubah filter jenis produk."
                action={
                  <Button variant="secondary" onClick={() => { setQuery(""); setKindFilter("all"); }}>
                    Reset pencarian
                  </Button>
                }
              />
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------------ keranjang */}
        <aside className="hidden lg:col-span-5 lg:block">
          <CartPanel
            cart={cart}
            totals={totals}
            role={role}
            marginGuard={marginGuard}
            customer={customer}
            onRemove={removeLine}
            onQty={setQty}
            onPrice={setLinePrice}
            onLineDiscount={setLineDiscount}
            onClear={clearCart}
            onHold={() => holdCart(`Meja ${heldCarts.length + 1}`)}
            onCustomer={() => setCustomerOpen(true)}
            onClearCustomer={() => setCartCustomer(null)}
            onDiscountPct={setCartDiscountPct}
            discountPct={cartDiscountPct}
            onPay={openPayment}
            limit={data.profile.staffDiscountLimitPct}
          />
        </aside>
      </div>

      {/* bilah keranjang ponsel */}
      {cart.length > 0 ? (
        <div className="fixed bottom-14 left-0 right-0 border-t border-border bg-surface px-4 py-2.5 lg:hidden" style={{ zIndex: 20 }}>
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="flex w-full items-center justify-between"
            aria-label="Buka keranjang"
          >
            <span className="flex items-center gap-2 text-[13px] font-medium text-text">
              <Receipt size={18} /> {totals.units} item
            </span>
            <span className="num text-[15px] font-semibold text-text">{formatRupiah(totals.total)}</span>
            <span className="inline-flex items-center gap-1 rounded-[10px] bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent">
              Bayar <CaretRight size={14} weight="bold" />
            </span>
          </button>
        </div>
      ) : null}

      {mobileCartOpen ? (
        <div className="fixed inset-0 bg-[rgb(9_9_11_/_0.5)] lg:hidden" style={{ zIndex: 40 }}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-hidden rounded-t-[20px] border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[15px] font-semibold text-text">Keranjang</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileCartOpen(false)} aria-label="Tutup keranjang">
                <X size={18} />
              </Button>
            </div>
            <div className="scroll-y max-h-[70dvh]">
              <CartPanel
                cart={cart}
                totals={totals}
                role={role}
                marginGuard={marginGuard}
                customer={customer}
                onRemove={removeLine}
                onQty={setQty}
                onPrice={setLinePrice}
                onLineDiscount={setLineDiscount}
                onClear={clearCart}
                onHold={() => holdCart(`Meja ${heldCarts.length + 1}`)}
                onCustomer={() => setCustomerOpen(true)}
                onClearCustomer={() => setCartCustomer(null)}
                onDiscountPct={setCartDiscountPct}
                discountPct={cartDiscountPct}
                onPay={() => {
                  setMobileCartOpen(false);
                  openPayment();
                }}
                limit={data.profile.staffDiscountLimitPct}
                bordered={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------- pilih IMEI */}
      <Overlay
        open={imeiProduct !== null}
        onClose={() => setImeiProduct(null)}
        title="Pilih unit (IMEI)"
        description={imeiProduct?.name}
        size="md"
      >
        {imeiProduct ? <ImeiPicker product={imeiProduct} onPick={(unit) => { addToCart(imeiProduct, { unit }); setImeiProduct(null); }} /> : null}
      </Overlay>

      {/* -------------------------------------------------------- pelanggan */}
      <Overlay open={customerOpen} onClose={() => setCustomerOpen(false)} title="Pilih pelanggan" description="Opsional, untuk struk email dan permintaan ulasan." size="md">
        <div className="space-y-3">
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder="Cari nama atau nomor telepon"
            className="h-10 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-[14px] text-text outline-none placeholder:text-text-faint"
            aria-label="Cari pelanggan"
          />
          <ul className="max-h-[46vh] divide-y divide-border overflow-y-auto rounded-[10px] border border-border">
            {data.customers
              .filter((c) =>
                customerQuery.trim() === ""
                  ? true
                  : c.name.toLowerCase().includes(customerQuery.toLowerCase()) || c.phone.includes(customerQuery)
              )
              .slice(0, 40)
              .map((c: Customer) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCartCustomer(c.id);
                      setCustomerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span>
                      <span className="block text-[13.5px] text-text">{c.name}</span>
                      <span className="num block text-[11.5px] text-text-faint">{c.phone}</span>
                    </span>
                    <Badge tone={c.consentEmail ? "ok" : "neutral"}>{c.consentEmail ? "boleh email" : "tanpa email"}</Badge>
                  </button>
                </li>
              ))}
          </ul>
          <p className="text-[12px] text-text-faint">
            Permintaan ulasan hanya dikirim bila pelanggan memberi persetujuan. Tidak ada penyaringan pelanggan.
          </p>
        </div>
      </Overlay>

      {/* ------------------------------------------------------- pembayaran */}
      <Overlay
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pembayaran"
        description={`${totals.units} item - total ${formatRupiah(totals.total)}`}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12.5px] text-text-muted">
              Dibayar <span className="num font-medium text-text">{formatRupiah(paidTotal)}</span>
              {change > 0 ? (
                <>
                  {" "}
                  - kembalian <span className="num font-medium text-accent">{formatRupiah(change)}</span>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPayOpen(false)}>
                Batal
              </Button>
              <Button variant="primary" size="lg" onClick={finalize} disabled={paidTotal < totals.total}>
                Selesaikan transaksi
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {role === "staff" && belowCost.length > 0 ? (
            <Alert tone="danger" title="Ada baris di bawah harga pokok">
              {belowCost.length} baris dijual di bawah modal. Pemilik harus menyetujui sebelum transaksi disimpan.
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="label-caps">Metode pembayaran</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => {
                  const active = payments.some((p) => p.method === m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setPayments([{ method: m, amount: totals.total }]);
                        if (m === "cash") setCashTendered(0);
                      }}
                      className={cn(
                        "flex h-11 items-center justify-between rounded-[10px] border px-3 text-[13px] font-medium transition-colors",
                        active ? "border-accent bg-accent-soft text-accent" : "border-border text-text-muted hover:bg-surface-2"
                      )}
                    >
                      {PAYMENT_LABEL[m]}
                      {m === "credit" ? <span className="text-[11px] text-text-faint">butuh pemilik</span> : null}
                    </button>
                  );
                })}
              </div>

              <div className="hairline space-y-3 pt-3">
                <p className="label-caps">Pembayaran campuran</p>
                {payments.map((p, idx) => (
                  <div key={`${p.method}-${idx}`} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select
                        label={`Baris ${idx + 1}`}
                        value={p.method}
                        onChange={(e) => {
                          const next = [...payments];
                          next[idx] = { ...p, method: e.target.value as PaymentMethod };
                          setPayments(next);
                        }}
                      >
                        {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_LABEL[m]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-[160px]">
                      <MoneyInput
                        label="Jumlah"
                        value={p.amount}
                        onValueChange={(v) => {
                          const next = [...payments];
                          next[idx] = { ...p, amount: v };
                          setPayments(next);
                        }}
                      />
                    </div>
                    {payments.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                        aria-label="Hapus baris pembayaran"
                      >
                        <Trash size={16} />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={15} />}
                  onClick={() => setPayments([...payments, { method: "qris", amount: Math.max(0, totals.total - paidTotal) }])}
                >
                  Tambah baris
                </Button>
              </div>

              {payments.some((p) => p.method === "cash") ? (
                <div className="hairline space-y-3 pt-3">
                  <MoneyInput label="Uang diterima" value={cashTendered} onValueChange={(v) => {
                    setCashTendered(v);
                    setPayments((prev) => prev.map((p) => (p.method === "cash" ? { ...p, amount: v || totals.total } : p)));
                  }} hint="Kosongkan untuk uang pas." />
                  {cashTendered > 0 ? (
                    <p className="text-[12.5px] text-text-muted">
                      Kembalian <span className="num font-medium text-text">{formatRupiah(Math.max(0, cashTendered - totals.total))}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-[10px] bg-surface-2 px-4 py-3.5">
                <dl className="space-y-1.5 text-[13px]">
                  <Line label="Subtotal" value={formatRupiah(totals.subtotal)} />
                  <Line label="Diskon baris" value={`- ${formatRupiah(totals.lineDiscount)}`} />
                  <Line label={`Diskon transaksi ${cartDiscountPct}%`} value={`- ${formatRupiah(totals.pctValue)}`} />
                  <div className="hairline mt-1.5 flex items-baseline justify-between pt-2">
                    <dt className="font-medium text-text">Total</dt>
                    <dd className="num text-[18px] font-semibold text-text">{formatRupiah(totals.total)}</dd>
                  </div>
                  {role === "owner" ? (
                    <Line label="Laba kotor" value={formatRupiah(totals.margin)} tone={totals.margin < 0 ? "danger" : "accent"} />
                  ) : null}
                </dl>
              </div>

              <div className="space-y-2">
                <label htmlFor="disc-pct" className="text-[13px] font-medium text-text">
                  Diskon transaksi (%)
                </label>
                <input
                  id="disc-pct"
                  type="number"
                  min={0}
                  max={60}
                  value={cartDiscountPct}
                  onChange={(e) => setCartDiscountPct(Number(e.target.value))}
                  className="num h-10 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-[14px] text-text outline-none"
                />
                <p className="text-[12px] text-text-faint">
                  Batas staf {data.profile.staffDiscountLimitPct}%. Di atas itu butuh PIN pemilik dan tercatat di audit log.
                </p>
              </div>

              {customer ? (
                <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text">{customer.name}</p>
                    <p className="num text-[11.5px] text-text-faint">{customer.phone}</p>
                  </div>
                  <Checkbox label="Struk email" checked={customer.consentEmail} onChange={() => undefined} />
                </div>
              ) : (
                <p className="text-[12.5px] text-text-muted">Tanpa pelanggan: struk hanya untuk cetak.</p>
              )}
            </div>
          </div>
        </div>
      </Overlay>

      {/* ----------------------------------------------------------- struk */}
      <Overlay
        open={receiptSale !== null}
        onClose={() => setReceiptFor(null)}
        title="Transaksi selesai"
        description={receiptSale ? `${receiptSale.receiptNo} - ${formatDateTime(receiptSale.createdAt)}` : ""}
        size="md"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<Printer size={16} />} onClick={() => toast({ title: "Struk dikirim ke printer", body: "Di produksi perintah cetak dikirim ke printer termal 58/80mm.", tone: "ok" })}>
              Cetak struk
            </Button>
            <Button
              variant="secondary"
              icon={<EnvelopeSimple size={16} />}
              disabled={!saleCustomer?.email || !saleCustomer.consentEmail}
              onClick={() => toast({ title: "Struk email dijadwalkan", body: "Antrean kirim ulang berjalan dengan percobaan bertahap.", tone: "ok" })}
            >
              Kirim email
            </Button>
            <Button variant="secondary" icon={<QrCode size={16} />} onClick={() => toast({ title: "Tautan ulasan disiapkan", body: "Tautan dikirim setelah 3 jam, tanpa menyaring pelanggan.", tone: "ok" })}>
              Minta ulasan
            </Button>
            <Button variant="primary" onClick={() => setReceiptFor(null)} className="ml-auto">
              Transaksi baru
            </Button>
          </div>
        }
      >
        {receiptSale && receiptFor ? (
          <ReceiptPreview
            sale={receiptSale}
            items={receiptFor.items}
            customer={saleCustomer ?? null}
          />
        ) : null}
      </Overlay>
    </div>
  );
}

/* ------------------------------------------------------------ sub komponen */

function Line({ label, value, tone }: { label: string; value: string; tone?: "accent" | "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={cn("num", tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : "text-text")}>{value}</dd>
    </div>
  );
}

function CartPanel({
  cart,
  totals,
  role,
  marginGuard,
  customer,
  onRemove,
  onQty,
  onPrice,
  onLineDiscount,
  onClear,
  onHold,
  onCustomer,
  onClearCustomer,
  onDiscountPct,
  discountPct,
  onPay,
  limit,
  bordered = true,
}: {
  cart: CartLine[];
  totals: ReturnType<typeof cartTotals>;
  role: "owner" | "staff";
  marginGuard: { key: string; margin: number; marginPct: number; blocked: boolean }[];
  customer: Customer | null;
  onRemove: (key: string) => void;
  onQty: (key: string, qty: number) => void;
  onPrice: (key: string, price: number) => void;
  onLineDiscount: (key: string, value: number) => void;
  onClear: () => void;
  onHold: () => void;
  onCustomer: () => void;
  onClearCustomer: () => void;
  onDiscountPct: (pct: number) => void;
  discountPct: number;
  onPay: () => void;
  limit: number;
  bordered?: boolean;
}) {
  const guardFor = (key: string) => marginGuard.find((g) => g.key === key);

  return (
    <div className={cn(bordered && "card sticky top-20", "flex flex-col")}>
      {bordered ? (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-text">
            <Storefront size={18} /> Keranjang
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onHold} disabled={cart.length === 0}>
              Tahan
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={cart.length === 0}>
              Kosongkan
            </Button>
          </div>
        </div>
      ) : null}

      <div className="scroll-y max-h-[46vh] min-h-[140px] flex-1 divide-y divide-border">
        {cart.length === 0 ? (
          <EmptyState
            icon={<Barcode size={26} />}
            title="Belum ada item"
            body="Scan produk untuk mulai. Keranjang bisa ditahan lalu dilanjutkan di perangkat lain."
          />
        ) : (
          cart.map((l) => {
            const g = guardFor(l.key);
            return (
              <div key={l.key} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-text">{l.name}</p>
                    {l.imei ? <p className="num text-[11.5px] text-text-faint">IMEI {l.imei}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(l.key)}
                    className="shrink-0 rounded p-1 text-text-faint hover:text-danger"
                    aria-label={`Hapus ${l.name} dari keranjang`}
                  >
                    <Trash size={15} />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!l.serialized ? (
                    <div className="flex h-8 items-center rounded-[10px] border border-border">
                      <button
                        type="button"
                        onClick={() => onQty(l.key, l.qty - 1)}
                        className="h-8 w-8 text-text-muted hover:text-text"
                        aria-label="Kurangi jumlah"
                      >
                        <Minus size={13} className="mx-auto" />
                      </button>
                      <span className="num w-8 text-center text-[13px] text-text">{l.qty}</span>
                      <button
                        type="button"
                        onClick={() => onQty(l.key, l.qty + 1)}
                        className="h-8 w-8 text-text-muted hover:text-text"
                        aria-label="Tambah jumlah"
                      >
                        <Plus size={13} className="mx-auto" />
                      </button>
                    </div>
                  ) : (
                    <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] text-text-muted">1 unit IMEI</span>
                  )}

                  <div className="flex h-8 items-center gap-1 rounded-[10px] border border-border px-2">
                    <span className="text-[11px] text-text-faint">Rp</span>
                    <input
                      value={l.unitPrice.toLocaleString("id-ID")}
                      onChange={(e) => onPrice(l.key, Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
                      className="num h-7 w-[86px] bg-transparent text-right text-[12.5px] text-text outline-none"
                      aria-label={`Harga satuan ${l.name}`}
                    />
                  </div>

                  <button
                    type="button"
                    className={cn(
                      "num h-8 rounded-full px-2.5 text-[11.5px] font-medium",
                      g?.blocked ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
                    )}
                    onClick={() => onLineDiscount(l.key, l.discount > 0 ? 0 : Math.round(l.unitPrice * l.qty * 0.03))}
                    aria-label={`Diskon baris ${l.name}`}
                  >
                    {g?.blocked ? "di bawah batas" : l.discount > 0 ? `diskon ${formatCompact(l.discount)}` : "beri diskon"}
                  </button>
                </div>

                <div className="mt-1.5 flex items-center justify-between">
                  <span className="num text-[13px] font-medium text-text">
                    {formatRupiah(l.unitPrice * l.qty - l.discount)}
                  </span>
                  {role === "owner" ? (
                    <span className={cn("num text-[11.5px]", (g?.margin ?? 0) < 0 ? "text-danger" : "text-text-faint")}>
                      laba {formatCompact(g?.margin ?? 0)} ({g?.marginPct.toFixed(1)}%)
                    </span>
                  ) : (
                    <span className={cn("text-[11.5px] font-medium", g?.blocked ? "text-danger" : "text-accent")}>
                      {g?.blocked ? "perlu izin" : "margin aman"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCustomer}
            className="truncate text-[12.5px] font-medium text-accent hover:underline"
          >
            {customer ? customer.name : "Tambah pelanggan"}
          </button>
          {customer ? (
            <button type="button" onClick={onClearCustomer} className="text-[11.5px] text-text-faint hover:text-text">
              hapus
            </button>
          ) : null}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[12px] text-text-muted">Diskon</span>
          <input
            type="range"
            min={0}
            max={30}
            value={discountPct}
            onChange={(e) => onDiscountPct(Number(e.target.value))}
            className="h-1.5 flex-1 accent-[var(--accent)]"
            aria-label="Diskon transaksi"
          />
          <span className={cn("num text-[12.5px]", discountPct > limit ? "text-warning" : "text-text")}>{discountPct}%</span>
        </div>

        <dl className="mt-3 space-y-1 text-[12.5px]">
          <Line label="Subtotal" value={formatRupiah(totals.subtotal)} />
          {totals.discount > 0 ? <Line label="Diskon" value={`- ${formatRupiah(totals.discount)}`} /> : null}
          <div className="hairline mt-1.5 flex items-baseline justify-between pt-2">
            <dt className="font-medium text-text">Total</dt>
            <dd className="num text-[20px] font-semibold text-text">{formatRupiah(totals.total)}</dd>
          </div>
        </dl>

        <Button variant="primary" size="lg" block className="mt-3" onClick={onPay} disabled={cart.length === 0}>
          Bayar {cart.length > 0 ? formatRupiah(totals.total) : ""}
        </Button>
        <p className="mt-2 text-center text-[11px] text-text-faint">F4 untuk membuka pembayaran</p>
      </div>
    </div>
  );
}

function ImeiPicker({ product, onPick }: { product: Product; onPick: (unit: InventoryUnit) => void }) {
  const ctx = useCtx();
  const [q, setQ] = useState("");
  const units = useMemo(
    () =>
      ctx.data.units
        .filter((u) => u.productId === product.id && u.status === "in_stock")
        .filter((u) => (q.trim() === "" ? true : u.imei1.includes(q.trim()) || (u.imei2 ?? "").includes(q.trim())))
        .slice(0, 40),
    [ctx.data.units, product.id, q]
  );

  return (
    <div className="space-y-3">
      <Alert tone="info" title="Produk ini dicatat per unit">
        IMEI yang dipilih tercetak di struk dan menjadi kunci klaim garansi.
      </Alert>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Scan atau ketik IMEI"
        className="num h-11 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-[14px] text-text outline-none"
        aria-label="Cari IMEI"
      />
      {units.length === 0 ? (
        <EmptyState icon={<WarningCircle size={24} />} title="Unit tidak ditemukan" body="Tidak ada unit siap jual dengan IMEI tersebut." />
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border">
          {units.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPick(u)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2"
              >
                <span>
                  <span className="num block text-[13px] text-text">{u.imei1}</span>
                  <span className="num block text-[11.5px] text-text-faint">
                    garansi {u.warrantyMonths} bulan - masuk {formatDateTime(u.receivedAt)}
                  </span>
                </span>
                <span className="num text-[12.5px] text-text-muted">{formatRupiah(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReceiptPreview({
  sale,
  items,
  customer,
}: {
  sale: ReturnType<typeof useCtx>["data"]["sales"][number];
  items: ReturnType<typeof useCtx>["data"]["saleItems"];
  customer: Customer | null;
}) {
  const ctx = useCtx();
  const payments = ctx.data.payments.filter((p) => p.saleId === sale.id);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-[10px] border border-border bg-white p-4 text-[#111214]">
        <div className="border-b border-dashed border-[#c4c7ca] pb-2 text-center">
          <p className="text-[13px] font-bold tracking-wide">DIVA CELL</p>
          <p className="text-[10.5px]">{SHOP.address}</p>
          <p className="num text-[10.5px]">{SHOP.phone}</p>
        </div>
        <div className="num mt-2 space-y-0.5 text-[10.5px]">
          <div className="flex justify-between">
            <span>{sale.receiptNo}</span>
            <span>{formatDateTime(sale.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Kasir</span>
            <span>{ctx.data.users.find((u) => u.id === sale.userId)?.name ?? "-"}</span>
          </div>
        </div>
        <div className="mt-2 space-y-1 border-t border-dashed border-[#c4c7ca] pt-2">
          {items.map((it) => (
            <div key={it.id} className="num text-[10.5px]">
              <div className="flex justify-between gap-2">
                <span className="truncate">{it.name}</span>
                <span>{formatRupiah(it.lineTotal)}</span>
              </div>
              {it.imei ? <div className="text-[9.5px]">IMEI {it.imei}</div> : null}
            </div>
          ))}
        </div>
        <div className="num mt-2 space-y-0.5 border-t border-dashed border-[#c4c7ca] pt-2 text-[10.5px]">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatRupiah(sale.subtotal)}</span>
          </div>
          {sale.discountTotal > 0 ? (
            <div className="flex justify-between">
              <span>Diskon</span>
              <span>-{formatRupiah(sale.discountTotal)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{formatRupiah(sale.grandTotal)}</span>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{PAYMENT_LABEL[p.method]}</span>
              <span>{formatRupiah(p.amount)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 border-t border-dashed border-[#c4c7ca] pt-2 text-center text-[9.5px]">
          Garansi sesuai ketentuan. Simpan struk ini sebagai bukti klaim.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-14 w-14 shrink-0 rounded bg-[#111214]" aria-hidden="true" />
          <p className="text-[9.5px] leading-snug">Pindai untuk struk publik dan tautan ulasan Google.</p>
        </div>
      </div>

      <div className="space-y-3">
        <Card className="px-4 py-3.5">
          <p className="label-caps mb-2">Ringkasan</p>
          <dl className="space-y-1.5 text-[13px]">
            <Line label="Item" value={`${items.reduce((s, i) => s + i.qty, 0)} unit`} />
            <Line label="Total" value={formatRupiah(sale.grandTotal)} />
            <Line label="Metode" value={payments.map((p) => PAYMENT_LABEL[p.method]).join(" + ") || "-"} />
            {customer ? <Line label="Pelanggan" value={customer.name} /> : null}
          </dl>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="label-caps mb-2">Setelah ini</p>
          <ul className="space-y-1.5 text-[12.5px] text-text-muted">
            <li>Struk termal siap dicetak, atau kirim ke email pelanggan bila ada persetujuan.</li>
            <li>Permintaan ulasan dijadwalkan otomatis, tanpa menyaring pelanggan.</li>
            <li>Stok dan kas sudah diperbarui di ledger, terlihat di perangkat lain.</li>
          </ul>
        </Card>
        {sale.discountTotal > 0 ? (
          <Alert tone="info" title="Diskon tercatat">
            Alasan: {sale.discountReason || "tidak diisi"}. Diskon di atas batas staf selalu dicatat di audit log.
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
