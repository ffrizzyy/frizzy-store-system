"use client";

/* ============================================================================
   Store sisi klien Frizzy.
   Dataset kecil untuk demo ini dimuat dari /api/sample lalu seluruh metrik
   dihitung di klien. Di produksi angka yang sama datang dari Postgres.
   ========================================================================= */

import { create } from "zustand";
import type {
  AuditEntry,
  CashTransaction,
  Customer,
  Dataset,
  ID,
  InventoryUnit,
  MovementReason,
  PaymentMethod,
  Product,
  Rupiah,
  Sale,
  SaleItem,
  StockMovement,
} from "./types";
import { computeContext, type Context } from "./metrics";

export type Role = "owner" | "staff";

export type CartLine = {
  key: string;
  productId: ID;
  unitId: ID | null;
  name: string;
  qty: number;
  unitPrice: Rupiah;
  unitCost: Rupiah;
  discount: Rupiah;
  imei: string | null;
  lineType: "product" | "tradein" | "service";
  serialized: boolean;
};

export type Toast = { id: string; title: string; body: string; tone: "ok" | "warn" | "danger" | "info" };

export type HeldCart = {
  id: string;
  label: string;
  lines: CartLine[];
  customerId: ID | null;
  createdAt: string;
  total: Rupiah;
};

export type Mutation =
  | { type: "void_sale"; saleId: ID; reason: string; actorId: ID }
  | { type: "refund_sale"; saleId: ID; reason: string; actorId: ID }
  | { type: "adjust_stock"; productId: ID; qtyDelta: number; reason: MovementReason; note: string; actorId: ID }
  | { type: "set_price"; productId: ID; price: Rupiah; minPrice: Rupiah; actorId: ID }
  | { type: "add_expense"; category: "rent" | "salary" | "utilities" | "marketing" | "other"; amount: Rupiah; note: string; actorId: ID }
  | { type: "set_draw_cap"; amount: Rupiah; actorId: ID }
  | { type: "set_safety_floor"; amount: Rupiah; actorId: ID }
  | { type: "close_shift"; shiftId: ID; countedCash: Rupiah; reason: string; actorId: ID }
  | { type: "approve_reorder"; candidateIds: ID[]; actorId: ID }
  | { type: "mark_task"; taskId: ID; status: "open" | "done" | "skipped" }
  | { type: "apply_markdown"; productId: ID; price: Rupiah; actorId: ID }
  | { type: "add_customer"; name: string; phone: string; email: string | null; consent: boolean };

const id = (prefix: string): ID => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

type State = {
  data: Dataset | null;
  ctx: Context | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  dirty: boolean;

  role: Role;
  userId: ID | null;
  cart: CartLine[];
  cartCustomerId: ID | null;
  cartDiscountPct: number;
  heldCarts: HeldCart[];
  toasts: Toast[];
  approval: null | { kind: "discount" | "below_min" | "void" | "draw" | "sensitive"; message: string; onApprove: () => void };

  hydrate: () => Promise<void>;
  setRole: (role: Role) => void;
  requestApproval: (req: { kind: "discount" | "below_min" | "void" | "draw" | "sensitive"; message: string; onApprove: () => void }) => void;
  clearApproval: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  addToCart: (product: Product, opts?: { unit?: InventoryUnit; qty?: number }) => void;
  removeLine: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  setLinePrice: (key: string, price: Rupiah) => void;
  setLineDiscount: (key: string, discount: Rupiah) => void;
  clearCart: () => void;
  setCartCustomer: (customerId: ID | null) => void;
  setCartDiscountPct: (pct: number) => void;
  holdCart: (label: string) => void;
  resumeCart: (id: string) => void;
  dropHeld: (id: string) => void;

  completeSale: (input: {
    payments: { method: PaymentMethod; amount: Rupiah }[];
    userId: ID;
    customerId: ID | null;
    discountReason: string;
    note: string;
  }) => { sale: Sale; items: SaleItem[] } | null;

  mutate: (m: Mutation) => void;
  reset: () => void;
};

const emptyDataset: Dataset | null = null;

function replan(data: Dataset): Context {
  return computeContext(data);
}

export const useFrizzy = create<State>((set, get) => ({
  data: emptyDataset,
  ctx: null,
  status: "idle",
  error: null,
  dirty: false,

  role: "owner",
  userId: null,
  cart: [],
  cartCustomerId: null,
  cartDiscountPct: 0,
  heldCarts: [],
  toasts: [],
  approval: null,

  hydrate: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const res = await fetch("/api/sample", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as { data: Dataset };
      const data = payload.data;
      const ctx = replan(data);
      const owner = data.users.find((u) => u.role === "owner") ?? null;
      set({
        data,
        ctx,
        status: "ready",
        role: "owner",
        userId: owner?.id ?? null,
        dirty: false,
      });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Gagal memuat data" });
    }
  },

  setRole: (role) => {
    const data = get().data;
    if (!data) return;
    const user = role === "owner" ? data.users.find((u) => u.role === "owner") : data.users.find((u) => u.role === "staff");
    /* Keranjang milik perangkat, bukan peran: staf dan pemilik sering bergantian
       memakai tablet kasir yang sama, jadi isi keranjang tidak boleh hilang.
       Yang direset hanya dialog persetujuan yang sedang terbuka. */
    set({ role, userId: user?.id ?? null, approval: null });
  },

  requestApproval: (req) => set({ approval: req }),
  clearApproval: () => set({ approval: null }),

  toast: (t) => {
    const item: Toast = { ...t, id: id("tst") };
    set({ toasts: [...get().toasts.slice(-3), item] });
    setTimeout(() => get().dismissToast(item.id), 6000);
  },
  dismissToast: (toastId) => set({ toasts: get().toasts.filter((t) => t.id !== toastId) }),

  addToCart: (product, opts) => {
    const { cart } = get();
    const unit = opts?.unit ?? null;
    const serialized = product.isSerialized;
    const key = serialized ? `u:${unit?.id ?? Math.random()}` : `p:${product.id}`;
    const existing = cart.find((l) => l.key === key);
    if (existing && !serialized) {
      set({
        cart: cart.map((l) => (l.key === key ? { ...l, qty: l.qty + (opts?.qty ?? 1) } : l)),
      });
      return;
    }
    const line: CartLine = {
      key,
      productId: product.id,
      unitId: unit?.id ?? null,
      name: product.name,
      qty: opts?.qty ?? 1,
      unitPrice: product.price,
      unitCost: unit?.cost ?? product.cost,
      discount: 0,
      imei: unit?.imei1 ?? null,
      lineType: "product",
      serialized,
    };
    set({ cart: [...cart, line] });
  },

  removeLine: (key) => set({ cart: get().cart.filter((l) => l.key !== key) }),
  setQty: (key, qty) =>
    set({ cart: get().cart.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)) }),
  setLinePrice: (key, price) =>
    set({ cart: get().cart.map((l) => (l.key === key ? { ...l, unitPrice: Math.max(0, Math.round(price)) } : l)) }),
  setLineDiscount: (key, discount) =>
    set({
      cart: get().cart.map((l) => (l.key === key ? { ...l, discount: Math.max(0, Math.round(discount)) } : l)),
    }),
  clearCart: () => set({ cart: [], cartCustomerId: null, cartDiscountPct: 0 }),
  setCartCustomer: (customerId) => set({ cartCustomerId: customerId }),
  setCartDiscountPct: (pct) => set({ cartDiscountPct: Math.max(0, Math.min(60, pct)) }),

  holdCart: (label) => {
    const { cart, cartCustomerId } = get();
    if (cart.length === 0) return;
    const total = cart.reduce((s, l) => s + l.unitPrice * l.qty - l.discount, 0);
    const held: HeldCart = {
      id: id("hld"),
      label,
      lines: cart,
      customerId: cartCustomerId,
      createdAt: new Date().toISOString(),
      total,
    };
    set({ heldCarts: [...get().heldCarts, held], cart: [], cartCustomerId: null, cartDiscountPct: 0 });
  },
  resumeCart: (heldId) => {
    const held = get().heldCarts.find((h) => h.id === heldId);
    if (!held) return;
    set({
      cart: held.lines,
      cartCustomerId: held.customerId,
      heldCarts: get().heldCarts.filter((h) => h.id !== heldId),
    });
  },
  dropHeld: (heldId) => set({ heldCarts: get().heldCarts.filter((h) => h.id !== heldId) }),

  completeSale: (input) => {
    const { data, cart, cartDiscountPct, cartCustomerId } = get();
    if (!data || cart.length === 0) return null;

    const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const lineDiscounts = cart.reduce((s, l) => s + l.discount, 0);
    const pctDiscount = Math.round((subtotal * cartDiscountPct) / 100);
    const grandTotal = subtotal - lineDiscounts - pctDiscount;
    const cogsTotal = cart.reduce((s, l) => s + l.unitCost * l.qty, 0);
    const nowIso = new Date().toISOString();
    const receiptSeq = data.sales.length + 1;

    const saleId = id("sal");
    const sale: Sale = {
      id: saleId,
      receiptNo: `DC-${nowIso.slice(0, 10).replace(/-/g, "")}-${String(receiptSeq).padStart(3, "0")}`,
      userId: input.userId,
      shiftId: data.shifts[data.shifts.length - 1]?.id ?? "shift_manual",
      customerId: input.customerId ?? cartCustomerId,
      subtotal,
      discountTotal: lineDiscounts + pctDiscount,
      grandTotal,
      cogsTotal,
      status: "completed",
      discountReason: input.discountReason,
      ownerApprovedBy: null,
      createdAt: nowIso,
      note: input.note,
    };

    const items: SaleItem[] = cart.map((l) => ({
      id: id("sit"),
      saleId,
      productId: l.productId,
      unitId: l.unitId,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      unitCost: l.unitCost,
      discount: l.discount + Math.round((l.unitPrice * l.qty * cartDiscountPct) / 100),
      lineTotal: l.unitPrice * l.qty - l.discount - Math.round((l.unitPrice * l.qty * cartDiscountPct) / 100),
      margin: l.unitPrice * l.qty - l.unitCost * l.qty - l.discount,
      imei: l.imei,
      lineType: l.lineType,
    }));

    const movements: StockMovement[] = [];
    const units = data.units.map((u) => ({ ...u }));
    for (const l of cart) {
      const product = data.products.find((p) => p.id === l.productId);
      if (!product || l.lineType === "service") continue;
      if (l.unitId) {
        const u = units.find((x) => x.id === l.unitId);
        if (u) {
          u.status = "sold";
          u.soldAt = nowIso;
        }
      }
      movements.push({
        id: id("mov"),
        productId: l.productId,
        unitId: l.unitId,
        qtyDelta: -l.qty,
        reason: "sale",
        refType: "sale",
        refId: saleId,
        unitCost: l.unitCost,
        note: l.imei ? `Terjual ${l.imei}` : "Penjualan kasir",
        occurredAt: nowIso,
        actorId: input.userId,
      });
    }

    const cashTransactions: CashTransaction[] = input.payments
      .filter((p) => p.method !== "credit")
      .map((p) => ({
        id: id("ctx"),
        accountId: p.method === "cash" ? "acc_drawer" : p.method === "edc" || p.method === "transfer" ? "acc_bank" : "acc_ewallet",
        direction: "in" as const,
        amount: p.amount,
        category: "sales" as const,
        refType: "sale" as const,
        refId: saleId,
        label: `Penjualan ${sale.receiptNo}`,
        occurredAt: nowIso,
      }));

    const audit: AuditEntry = {
      id: id("aud"),
      actorId: input.userId,
      action: "sale.create",
      entity: "sale",
      entityId: saleId,
      detail: `Transaksi ${sale.receiptNo} sebesar ${grandTotal}`,
      at: nowIso,
    };

    const nextData: Dataset = {
      ...data,
      sales: [...data.sales, sale],
      saleItems: [...data.saleItems, ...items],
      movements: [...data.movements, ...movements],
      units,
      cashTransactions: [...data.cashTransactions, ...cashTransactions],
      auditLog: [...data.auditLog, audit],
      receiptDeliveries: input.customerId ?? cartCustomerId
        ? [
            ...data.receiptDeliveries,
            {
              id: id("rcd"),
              saleId,
              channel: "print",
              status: "sent",
              sentAt: nowIso,
              openedAt: null,
            },
          ]
        : data.receiptDeliveries,
    };

    set({
      data: nextData,
      ctx: replan(nextData),
      cart: [],
      cartCustomerId: null,
      cartDiscountPct: 0,
      dirty: true,
    });
    get().toast({ title: "Transaksi selesai", body: `${sale.receiptNo} tersimpan di ledger stok dan kas.`, tone: "ok" });
    return { sale, items };
  },

  mutate: (m) => {
    const data = get().data;
    if (!data) return;
    const nowIso = new Date().toISOString();
    const actorId = "actorId" in m ? m.actorId : (get().userId ?? data.users[0]?.id ?? "usr_system");
    let next: Dataset = data;
    const audit = (action: string, entity: string, entityId: ID | null, detail: string): AuditEntry => ({
      id: id("aud"),
      actorId,
      action,
      entity,
      entityId,
      detail,
      at: nowIso,
    });

    switch (m.type) {
      case "void_sale": {
        const sale = data.sales.find((s) => s.id === m.saleId);
        if (!sale) return;
        const items = data.saleItems.filter((it) => it.saleId === m.saleId);
        const units = data.units.map((u) => ({ ...u }));
        const movements: StockMovement[] = [];
        for (const it of items) {
          const u = units.find((x) => x.id === it.unitId);
          if (u) {
            u.status = "in_stock";
            u.soldAt = null;
          }
          const product = data.products.find((p) => p.id === it.productId);
          if (product && product.kind !== "service") {
            movements.push({
              id: id("mov"),
              productId: it.productId,
              unitId: it.unitId,
              qtyDelta: it.qty,
              reason: "return",
              refType: "sale",
              refId: sale.id,
              unitCost: it.unitCost,
              note: `Void: ${m.reason}`,
              occurredAt: nowIso,
              actorId,
            });
          }
        }
        next = {
          ...data,
          sales: data.sales.map((s) =>
            s.id === m.saleId ? { ...s, status: "void", note: m.reason, ownerApprovedBy: actorId } : s
          ),
          units,
          movements: [...data.movements, ...movements],
          cashTransactions: [
            ...data.cashTransactions,
            {
              id: id("ctx"),
              accountId: "acc_drawer",
              direction: "out",
              amount: sale.grandTotal,
              category: "refund",
              refType: "sale",
              refId: sale.id,
              label: `Void ${sale.receiptNo}`,
              occurredAt: nowIso,
            },
          ],
          auditLog: [...data.auditLog, audit("sale.void", "sale", sale.id, `Void ${sale.receiptNo}: ${m.reason}`)],
        };
        break;
      }
      case "refund_sale": {
        const sale = data.sales.find((s) => s.id === m.saleId);
        if (!sale) return;
        const items = data.saleItems.filter((it) => it.saleId === m.saleId);
        const units = data.units.map((u) => ({ ...u }));
        const movements: StockMovement[] = [];
        for (const it of items) {
          const u = units.find((x) => x.id === it.unitId);
          if (u) u.status = "returned";
          const product = data.products.find((p) => p.id === it.productId);
          if (product && product.kind !== "service") {
            movements.push({
              id: id("mov"),
              productId: it.productId,
              unitId: it.unitId,
              qtyDelta: it.qty,
              reason: "return",
              refType: "sale",
              refId: sale.id,
              unitCost: it.unitCost,
              note: `Refund: ${m.reason}`,
              occurredAt: nowIso,
              actorId,
            });
          }
        }
        next = {
          ...data,
          sales: data.sales.map((s) => (s.id === m.saleId ? { ...s, status: "refunded", note: m.reason } : s)),
          units,
          movements: [...data.movements, ...movements],
          cashTransactions: [
            ...data.cashTransactions,
            {
              id: id("ctx"),
              accountId: "acc_drawer",
              direction: "out",
              amount: sale.grandTotal,
              category: "refund",
              refType: "sale",
              refId: sale.id,
              label: `Refund ${sale.receiptNo}`,
              occurredAt: nowIso,
            },
          ],
          auditLog: [...data.auditLog, audit("sale.refund", "sale", sale.id, `Refund ${sale.receiptNo}: ${m.reason}`)],
        };
        break;
      }
      case "adjust_stock": {
        const product = data.products.find((p) => p.id === m.productId);
        if (!product) return;
        next = {
          ...data,
          movements: [
            ...data.movements,
            {
              id: id("mov"),
              productId: m.productId,
              unitId: null,
              qtyDelta: m.qtyDelta,
              reason: m.reason,
              refType: "manual",
              refId: null,
              unitCost: product.cost,
              note: m.note,
              occurredAt: nowIso,
              actorId,
            },
          ],
          auditLog: [
            ...data.auditLog,
            audit("stock.adjust", "product", m.productId, `${m.reason}: ${m.qtyDelta} unit ${product.name}`),
          ],
        };
        break;
      }
      case "set_price": {
        const product = data.products.find((p) => p.id === m.productId);
        if (!product) return;
        next = {
          ...data,
          products: data.products.map((p) => (p.id === m.productId ? { ...p, price: m.price, minPrice: m.minPrice } : p)),
          auditLog: [
            ...data.auditLog,
            audit(
              "product.price_change",
              "product",
              m.productId,
              `${product.name}: ${product.price} -> ${m.price}`
            ),
          ],
        };
        break;
      }
      case "apply_markdown": {
        const product = data.products.find((p) => p.id === m.productId);
        if (!product) return;
        next = {
          ...data,
          products: data.products.map((p) => (p.id === m.productId ? { ...p, price: m.price } : p)),
          auditLog: [
            ...data.auditLog,
            audit("product.markdown", "product", m.productId, `${product.name} diturunkan ke ${m.price}`),
          ],
        };
        break;
      }
      case "add_expense": {
        next = {
          ...data,
          expenses: [
            ...data.expenses,
            {
              id: id("exp"),
              category: m.category,
              amount: m.amount,
              dueDate: nowIso,
              paidAt: nowIso,
              recurringRule: null,
              attachment: false,
              note: m.note,
            },
          ],
          cashTransactions: [
            ...data.cashTransactions,
            {
              id: id("ctx"),
              accountId: "acc_bank",
              direction: "out",
              amount: m.amount,
              category: m.category,
              refType: "expense",
              refId: null,
              label: m.note || "Beban baru",
              occurredAt: nowIso,
            },
          ],
          auditLog: [...data.auditLog, audit("expense.create", "expense", null, `${m.category} ${m.amount}`)],
        };
        break;
      }
      case "set_draw_cap": {
        next = {
          ...data,
          profile: { ...data.profile, ownerDrawMonthlyCap: m.amount },
          auditLog: [...data.auditLog, audit("settings.draw_cap", "profile", null, `Batas prive ${m.amount}`)],
        };
        break;
      }
      case "set_safety_floor": {
        next = {
          ...data,
          profile: { ...data.profile, safetyCashFloor: m.amount },
          auditLog: [...data.auditLog, audit("settings.safety_floor", "profile", null, `Lantai kas aman ${m.amount}`)],
        };
        break;
      }
      case "close_shift": {
        const shift = data.shifts.find((s) => s.id === m.shiftId);
        if (!shift) return;
        const drawerTx = data.cashTransactions.filter((c) => c.accountId === "acc_drawer" && c.occurredAt >= shift.openedAt);
        const inflow = drawerTx.filter((c) => c.direction === "in").reduce((s, c) => s + c.amount, 0);
        const outflow = drawerTx.filter((c) => c.direction === "out").reduce((s, c) => s + c.amount, 0);
        const expected = shift.openingFloat + inflow - outflow;
        next = {
          ...data,
          shifts: data.shifts.map((s) =>
            s.id === m.shiftId
              ? {
                  ...s,
                  closedAt: nowIso,
                  countedCash: m.countedCash,
                  expectedCash: expected,
                  variance: m.countedCash - expected,
                  varianceReason: m.reason,
                }
              : s
          ),
          auditLog: [
            ...data.auditLog,
            audit("shift.close", "shift", m.shiftId, `Selisih ${m.countedCash - expected}`),
          ],
        };
        break;
      }
      case "approve_reorder": {
        const poTotal = m.candidateIds.length;
        next = {
          ...data,
          auditLog: [
            ...data.auditLog,
            audit("po.draft", "purchase_order", null, `Draf PO untuk ${poTotal} baris reorder`),
          ],
        };
        break;
      }
      case "mark_task": {
        next = {
          ...data,
          recoveryTasks: data.recoveryTasks.map((t) => (t.id === m.taskId ? { ...t, status: m.status } : t)),
          auditLog: [...data.auditLog, audit("task.update", "task", m.taskId, `Status -> ${m.status}`)],
        };
        break;
      }
      case "add_customer": {
        const customer: Customer = {
          id: id("cst"),
          name: m.name,
          phone: m.phone,
          email: m.email,
          consentEmail: m.consent,
          consentAt: m.consent ? nowIso : null,
          lastReviewRequestAt: null,
          createdAt: nowIso,
        };
        next = {
          ...data,
          customers: [...data.customers, customer],
          auditLog: [...data.auditLog, audit("customer.create", "customer", customer.id, m.name)],
        };
        break;
      }
      default:
        return;
    }

    set({ data: next, ctx: replan(next), dirty: true });
  },

  reset: () => set({ status: "idle", data: null, ctx: null, dirty: false, cart: [], heldCarts: [], toasts: [] }),
}));

/* ---------------------------------------------------------------- selektor */

/**
 * Kendali kecil untuk membuka dialog yang dimiliki AppShell dari halaman mana
 * pun (misalnya tombol "Tambah stok" di halaman Stok).
 */
type UiState = {
  addStockOpen: boolean;
  openAddStock: () => void;
  closeAddStock: () => void;
};

export const useUi = create<UiState>((set) => ({
  addStockOpen: false,
  openAddStock: () => set({ addStockOpen: true }),
  closeAddStock: () => set({ addStockOpen: false }),
}));

export function useData(): Dataset {
  const data = useFrizzy((s) => s.data);
  if (!data) throw new Error("Data belum dimuat");
  return data;
}

export function useCtx(): Context {
  const ctx = useFrizzy((s) => s.ctx);
  if (!ctx) throw new Error("Data belum dimuat");
  return ctx;
}

export function cartTotals(lines: CartLine[], pctDiscount: number) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const lineDiscount = lines.reduce((s, l) => s + l.discount, 0);
  const pctValue = Math.round((subtotal * pctDiscount) / 100);
  const total = subtotal - lineDiscount - pctValue;
  const cogs = lines.reduce((s, l) => s + l.unitCost * l.qty, 0);
  return {
    subtotal,
    lineDiscount,
    pctValue,
    discount: lineDiscount + pctValue,
    total,
    cogs,
    margin: total - cogs,
    marginPct: total === 0 ? 0 : ((total - cogs) / total) * 100,
    units: lines.reduce((s, l) => s + l.qty, 0),
  };
}
