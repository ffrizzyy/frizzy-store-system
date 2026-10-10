/* ============================================================================
   Mesin metrik Frizzy. Semua angka dihitung di sini dengan aritmetika
   deterministik (SQL/Python di produksi, fungsi murni di demo ini).
   LLM tidak pernah menghitung angka; ia hanya menarasikan hasil dari sini.
   ========================================================================= */

import type { Dataset, ID, Product, Rupiah, SaleItem, StockMovement } from "./types";
import { safeDiv } from "./money";

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ tipe */

export type DailyMetric = {
  date: string;
  cashEod: Rupiah;
  cashIn: Rupiah;
  cashOut: Rupiah;
  sales: Rupiah;
  cogs: Rupiah;
  grossProfit: Rupiah;
  opex: Rupiah;
  draws: Rupiah;
  inventoryValue: Rupiah;
  payables: Rupiah;
  trueBurn: Rupiah;
  runwayDays: number;
  salesCount: number;
  phoneUnits: number;
  accessoryUnits: number;
};

export type ProductMetric = {
  product: Product;
  qty: number;
  stockValue: Rupiah;
  soldUnits: number;
  revenue: Rupiah;
  grossProfit: Rupiah;
  marginPct: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number;
  lastPrice: Rupiah | null;
  trappedCash: Rupiah;
  health: "healthy" | "slow" | "dead" | "obsolete";
  gmroi: number;
  avgDailyDemand: number;
  daysOfCover: number;
  reorderPoint: number;
  abc: "A" | "B" | "C";
  xyz: "X" | "Y" | "Z";
};

export type Kpis = {
  days: number;
  netSales: Rupiah;
  grossProfit: Rupiah;
  grossMarginPct: number;
  cogs: Rupiah;
  opex: Rupiah;
  draws: Rupiah;
  cashOnHand: Rupiah;
  inventoryValue: Rupiah;
  payablesDue7: Rupiah;
  payablesTotal: Rupiah;
  receivablesOpen: Rupiah;
  receivablesOverdue: Rupiah;
  trueBurnPerDay: Rupiah;
  trueBurnPrev: Rupiah;
  runwayDays: number;
  runwayState: "safe" | "watch" | "critical";
  replenishmentRatio: number;
  ownerDrawRatio: number;
  dio: number;
  turnover: number;
  gmroi: number;
  sellThroughPct: number;
  attachRatePct: number;
  discountLeakagePct: number;
  discountTotal: Rupiah;
  belowCostCount: number;
  belowCostLoss: Rupiah;
  shrinkagePct: number;
  breakEvenSalesPerDay: Rupiah;
  avgDailySales: Rupiah;
  reviewClickRatePct: number;
  reviewRequestsSent: number;
  reviewClicks: number;
  salesCount: number;
  deadStockValue: Rupiah;
  slowStockValue: Rupiah;
  shiftVarianceTotal: Rupiah;
  monthlyFixedCost: Rupiah;
};

export type CashBridgeStep = {
  label: string;
  kind: "start" | "in" | "out" | "total";
  value: Rupiah;
  running: Rupiah;
  hint: string;
};

export type LeakFinding = {
  id: string;
  rule: string;
  severity: "high" | "medium" | "low";
  impactPerMonth: Rupiah;
  evidence: string;
  action: string;
  count: number;
  href: string;
};

export type FreeCashItem = {
  product: Product;
  qty: number;
  cost: Rupiah;
  lastPrice: Rupiah | null;
  lastSoldAt: string | null;
  daysSinceLastSale: number;
  health: ProductMetric["health"];
  trappedCash: Rupiah;
  markdownPct: number;
  suggestedPrice: Rupiah;
  expectedCash: Rupiah;
  marginSacrificed: Rupiah;
  action: string;
};

export type ReorderCandidate = {
  product: Product;
  qty: number;
  unitCost: Rupiah;
  totalCost: Rupiah;
  gmroi: number;
  avgDailyDemand: number;
  daysOfCover: number;
  paybackDays: number;
  score: number;
  supplierId: ID | null;
  leadTimeDays: number;
  funded: boolean;
  note: string;
};

export type ReorderPlan = {
  openToBuy: Rupiah;
  cashOnHand: Rupiah;
  safetyFloor: Rupiah;
  payablesDue: Rupiah;
  allocationPct: number;
  candidates: ReorderCandidate[];
  funded: ReorderCandidate[];
  deferred: ReorderCandidate[];
  totalFunded: Rupiah;
  expectedPaybackDays: number;
};

export type WhatIfLevers = {
  marginPoints: number;
  drawCutPct: number;
  deadStockLiquidatePct: number;
  discountCutPct: number;
  attachRatePoints: number;
  supplierTermDays: number;
  expenseCut: Rupiah;
};

export type WhatIfResult = {
  levers: WhatIfLevers;
  baseRunwayDays: number;
  runwayDays: number;
  baseTrueBurn: Rupiah;
  trueBurn: Rupiah;
  breakEvenSalesPerDay: Rupiah;
  cashWeek4: Rupiah;
  cashWeek8: Rupiah;
  cashWeek13: Rupiah;
  weekly: { week: number; base: Rupiah; scenario: Rupiah }[];
  cashFreed: Rupiah;
  minimumCombination: string[];
  safe: boolean;
};

export type RecoveryScore = {
  score: number;
  band: "kritis" | "waspada" | "sehat";
  components: { key: string; label: string; value: number; weight: number; detail: string }[];
  topActions: string[];
};

export type ForecastWeek = { week: number; label: string; base: Rupiah; conservative: Rupiah; recovery: Rupiah };

export type Context = {
  data: Dataset;
  daily: DailyMetric[];
  byProduct: Map<ID, ProductMetric>;
  kpis: Kpis;
  cashNow: Rupiah;
  inventoryValueNow: Rupiah;
};

/* ----------------------------------------------------------- util internal */

function dayKey(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}

function dayStartMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`) - 7 * 3_600_000;
}

function round(n: number): Rupiah {
  return Math.round(n);
}

function sum(xs: number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

function fmt(v: number): string {
  return `Rp ${Math.round(v).toLocaleString("id-ID")}`;
}

/* ---------------------------------------------------------------- konteks */

export function computeContext(data: Dataset): Context {
  const todayKey = dayKey(data.asOf);
  const dayKeys: string[] = [];
  for (let i = data.days - 1; i >= 0; i--) {
    dayKeys.push(dayKey(new Date(dayStartMs(todayKey) - i * DAY_MS).toISOString()));
  }
  const firstKey = dayKeys[0] as string;
  const lastKey = dayKeys[dayKeys.length - 1] as string;

  /* --- indeks --- */
  const qtyNow = new Map<ID, number>();
  const movementByProduct = new Map<ID, StockMovement[]>();
  for (const m of data.movements) {
    const list = movementByProduct.get(m.productId);
    if (list) list.push(m);
    else movementByProduct.set(m.productId, [m]);
  }
  for (const p of data.products) {
    if (p.isSerialized) {
      let n = 0;
      for (const u of data.units) if (u.productId === p.id && u.status === "in_stock") n += 1;
      qtyNow.set(p.id, n);
    } else {
      qtyNow.set(p.id, sum((movementByProduct.get(p.id) ?? []).map((m) => m.qtyDelta)));
    }
  }

  const saleById = new Map(data.sales.map((s) => [s.id, s]));
  const itemsBySale = new Map<ID, SaleItem[]>();
  const itemsByProduct = new Map<ID, SaleItem[]>();
  for (const it of data.saleItems) {
    const bySale = itemsBySale.get(it.saleId);
    if (bySale) bySale.push(it);
    else itemsBySale.set(it.saleId, [it]);
    const byProduct = itemsByProduct.get(it.productId);
    if (byProduct) byProduct.push(it);
    else itemsByProduct.set(it.productId, [it]);
  }

  const validSales = data.sales.filter((s) => s.status !== "void");

  /* --- agregat penjualan --- */
  const perDaySales = new Map<string, { sales: number; cogs: number; count: number; phones: number; acc: number }>();
  const productAgg = new Map<
    ID,
    { units: number; revenue: number; profit: number; lastSoldAt: string | null; lastPrice: Rupiah | null }
  >();
  let attachHandsetSales = 0;
  let attachWithAccessory = 0;
  const window42 = dayStartMs(todayKey) - 41 * DAY_MS;
  const recentUnitsByProduct = new Map<ID, number>();

  for (const s of validSales) {
    const key = dayKey(s.createdAt);
    const bucket = perDaySales.get(key) ?? { sales: 0, cogs: 0, count: 0, phones: 0, acc: 0 };
    bucket.sales += s.grandTotal;
    bucket.cogs += s.cogsTotal;
    bucket.count += 1;
    const saleTs = Date.parse(s.createdAt);
    const items = itemsBySale.get(s.id) ?? [];
    let hasHandset = false;
    let hasAccessory = false;
    for (const it of items) {
      const product = data.products.find((p) => p.id === it.productId);
      if (!product) continue;
      if (product.kind === "handset") {
        bucket.phones += it.qty;
        hasHandset = true;
      } else if (product.kind === "accessory") {
        bucket.acc += it.qty;
        hasAccessory = true;
      }
      const agg = productAgg.get(it.productId) ?? {
        units: 0,
        revenue: 0,
        profit: 0,
        lastSoldAt: null,
        lastPrice: null,
      };
      agg.units += it.qty;
      agg.revenue += it.lineTotal;
      agg.profit += it.margin;
      if (agg.lastSoldAt === null || s.createdAt > agg.lastSoldAt) {
        agg.lastSoldAt = s.createdAt;
        agg.lastPrice = it.unitPrice;
      }
      productAgg.set(it.productId, agg);
      if (saleTs >= window42) {
        recentUnitsByProduct.set(it.productId, (recentUnitsByProduct.get(it.productId) ?? 0) + it.qty);
      }
    }
    if (hasHandset) {
      attachHandsetSales += 1;
      if (hasAccessory) attachWithAccessory += 1;
    }
    perDaySales.set(key, bucket);
  }

  /* --- kas dan beban per hari --- */
  const cashInByDay = new Map<string, number>();
  const cashOutByDay = new Map<string, number>();
  for (const c of data.cashTransactions) {
    const key = dayKey(c.occurredAt);
    if (c.direction === "in") cashInByDay.set(key, (cashInByDay.get(key) ?? 0) + c.amount);
    else cashOutByDay.set(key, (cashOutByDay.get(key) ?? 0) + c.amount);
  }

  const opexByDay = new Map<string, number>();
  const drawsByDay = new Map<string, number>();
  for (const e of data.expenses) {
    if (e.category === "restock" || e.category === "supplier_payment") continue;
    const key = dayKey(e.paidAt ?? e.dueDate);
    if (e.category === "owner_draw") drawsByDay.set(key, (drawsByDay.get(key) ?? 0) + e.amount);
    else opexByDay.set(key, (opexByDay.get(key) ?? 0) + e.amount);
  }

  /* --- pergerakan nilai persediaan --- */
  const invInByDay = new Map<string, number>();
  for (const m of data.movements) {
    if (m.qtyDelta <= 0) continue;
    const key = dayKey(m.occurredAt);
    invInByDay.set(key, (invInByDay.get(key) ?? 0) + m.qtyDelta * m.unitCost);
  }

  let inventoryValueNow = 0;
  for (const p of data.products) {
    if (p.kind === "service") continue;
    inventoryValueNow += (qtyNow.get(p.id) ?? 0) * p.cost;
  }

  const inventoryAtDay = new Map<string, number>();
  {
    let running = inventoryValueNow;
    for (let i = dayKeys.length - 1; i >= 0; i--) {
      const key = dayKeys[i] as string;
      inventoryAtDay.set(key, running);
      const saleCogs = perDaySales.get(key)?.cogs ?? 0;
      running = running - (invInByDay.get(key) ?? 0) + saleCogs;
    }
  }

  /* --- utang supplier berjalan --- */
  const payablesAtDay = new Map<string, number>();
  for (const key of dayKeys) {
    const t = dayStartMs(key) + DAY_MS;
    let pay = 0;
    for (const po of data.purchaseOrders) {
      if (Date.parse(po.dueDate) <= t && (po.paidAt === null || Date.parse(po.paidAt) > t)) pay += po.total;
    }
    payablesAtDay.set(key, pay);
  }

  /* --- kas harian --- */
  let openingCash = 0;
  for (const c of data.cashTransactions) {
    if (dayKey(c.occurredAt) < firstKey) openingCash += c.direction === "in" ? c.amount : -c.amount;
  }

  const daily: DailyMetric[] = [];
  let runningCash = openingCash;
  for (const key of dayKeys) {
    const cashIn = cashInByDay.get(key) ?? 0;
    const cashOut = cashOutByDay.get(key) ?? 0;
    runningCash += cashIn - cashOut;
    const bucket = perDaySales.get(key) ?? { sales: 0, cogs: 0, count: 0, phones: 0, acc: 0 };
    const grossProfit = bucket.sales - bucket.cogs;
    const opex = opexByDay.get(key) ?? 0;
    const draws = drawsByDay.get(key) ?? 0;
    daily.push({
      date: key,
      cashEod: round(runningCash),
      cashIn,
      cashOut,
      sales: bucket.sales,
      cogs: bucket.cogs,
      grossProfit,
      opex,
      draws,
      inventoryValue: round(inventoryAtDay.get(key) ?? 0),
      payables: payablesAtDay.get(key) ?? 0,
      trueBurn: round(grossProfit - opex - draws),
      runwayDays: 0,
      salesCount: bucket.count,
      phoneUnits: bucket.phones,
      accessoryUnits: bucket.acc,
    });
  }

  /* --- True Burn dan Runway bergulir 30 hari --- */
  for (let i = 0; i < daily.length; i++) {
    const metric = daily[i] as DailyMetric;
    const from = Math.max(0, i - 29);
    let burn = 0;
    for (let j = from; j <= i; j++) burn += (daily[j] as DailyMetric).trueBurn;
    const perDay = burn / (i - from + 1);
    metric.trueBurn = round(perDay);
    metric.runwayDays = perDay >= 0 ? Number.POSITIVE_INFINITY : Math.max(0, Math.round(metric.cashEod / -perDay));
  }

  const cashNow = daily[daily.length - 1]?.cashEod ?? 0;

  /* --- agregat per produk --- */
  const byProduct = new Map<ID, ProductMetric>();
  for (const p of data.products) {
    const agg = productAgg.get(p.id) ?? {
      units: 0,
      revenue: 0,
      profit: 0,
      lastSoldAt: null as string | null,
      lastPrice: null as Rupiah | null,
    };
    const recentUnits = recentUnitsByProduct.get(p.id) ?? 0;
    const avgDailyDemand = recentUnits / 42;
    const qty = qtyNow.get(p.id) ?? 0;
    const lastSoldAt = agg.lastSoldAt;
    const daysSince =
      lastSoldAt === null ? 999 : Math.max(0, Math.round((Date.parse(data.asOf) - Date.parse(lastSoldAt)) / DAY_MS));
    const stockValue = qty * p.cost;
    const health: ProductMetric["health"] =
      p.kind === "service"
        ? "healthy"
        : daysSince >= 90 || (avgDailyDemand === 0 && daysSince >= 60)
          ? "obsolete"
          : daysSince >= 60 || avgDailyDemand === 0
            ? "dead"
            : daysSince >= 30
              ? "slow"
              : "healthy";
    const marginPct =
      agg.revenue === 0 ? safeDiv(p.price - p.cost, p.price) * 100 : (agg.profit / agg.revenue) * 100;
    byProduct.set(p.id, {
      product: p,
      qty,
      stockValue,
      soldUnits: agg.units,
      revenue: agg.revenue,
      grossProfit: agg.profit,
      marginPct,
      lastSoldAt,
      daysSinceLastSale: daysSince,
      lastPrice: agg.lastPrice,
      trappedCash: health === "healthy" ? 0 : stockValue,
      health,
      gmroi: safeDiv(agg.profit * (365 / data.days), Math.max(1, stockValue)),
      avgDailyDemand,
      daysOfCover: avgDailyDemand === 0 ? Number.POSITIVE_INFINITY : qty / avgDailyDemand,
      reorderPoint: Math.max(1, Math.ceil(avgDailyDemand * 3 + 1.65 * Math.sqrt(Math.max(avgDailyDemand, 0.25)) * Math.sqrt(3))),
      abc: p.tags.abc,
      xyz: p.tags.xyz,
    });
  }

  const kpis = computeKpis({
    data,
    daily,
    byProduct,
    attachHandsetSales,
    attachWithAccessory,
    inventoryValueNow,
    cashNow,
  });

  void lastKey;
  return { data, daily, byProduct, kpis, cashNow, inventoryValueNow };
}

/* ------------------------------------------------------------------- KPI */

function computeKpis(args: {
  data: Dataset;
  daily: DailyMetric[];
  byProduct: Map<ID, ProductMetric>;
  attachHandsetSales: number;
  attachWithAccessory: number;
  inventoryValueNow: Rupiah;
  cashNow: Rupiah;
}): Kpis {
  const { data, daily, byProduct, inventoryValueNow, cashNow } = args;
  const window = daily.slice(-30);
  const prevWindow = daily.slice(-60, -30);
  const days = window.length || 1;
  const windowStart = dayStartMs(window[0]?.date ?? data.startDate);

  const netSales = sum(window.map((d) => d.sales));
  const cogs = sum(window.map((d) => d.cogs));
  const grossProfit = netSales - cogs;
  const opex = sum(window.map((d) => d.opex));
  const draws = sum(window.map((d) => d.draws));
  const trueBurnPerDay = sum(window.map((d) => d.trueBurn)) / days;
  const trueBurnPrev = prevWindow.length === 0 ? 0 : sum(prevWindow.map((d) => d.trueBurn)) / prevWindow.length;

  const inventoryStart = window[0]?.inventoryValue ?? inventoryValueNow;
  const avgInventory = (inventoryStart + inventoryValueNow) / 2;
  const payablesNow = daily[daily.length - 1]?.payables ?? 0;

  const runwayDays = trueBurnPerDay >= 0 ? Number.POSITIVE_INFINITY : Math.max(0, cashNow / -trueBurnPerDay);
  const runwayState: Kpis["runwayState"] = runwayDays > 60 ? "safe" : runwayDays >= 30 ? "watch" : "critical";

  const saleById = new Map(data.sales.map((s) => [s.id, s]));
  const windowSales = data.sales.filter((s) => s.status !== "void" && Date.parse(s.createdAt) >= windowStart);
  const grossSales = sum(windowSales.map((s) => s.subtotal));
  const discountTotal = sum(windowSales.map((s) => s.discountTotal));

  let belowCostCount = 0;
  let belowCostLoss = 0;
  for (const it of data.saleItems) {
    const sale = saleById.get(it.saleId);
    if (!sale || sale.status === "void" || Date.parse(sale.createdAt) < windowStart) continue;
    if (it.lineTotal < it.unitCost * it.qty) {
      belowCostCount += 1;
      belowCostLoss += it.unitCost * it.qty - it.lineTotal;
    }
  }

  const purchasesAtCost = sum(
    data.movements
      .filter((m) => m.qtyDelta > 0 && Date.parse(m.occurredAt) >= windowStart)
      .map((m) => m.qtyDelta * m.unitCost)
  );
  const replenishmentRatio = cogs === 0 ? 0 : purchasesAtCost / cogs;
  const ownerDrawRatio = grossProfit === 0 ? 0 : draws / grossProfit;
  const dio = cogs === 0 ? 0 : (avgInventory / cogs) * days;
  const turnover = avgInventory === 0 ? 0 : (cogs / avgInventory) * (365 / days);
  const gmroi = avgInventory === 0 ? 0 : (grossProfit / avgInventory) * (365 / days);

  const unitsSold = sum(window.map((d) => d.phoneUnits + d.accessoryUnits));
  let endingUnits = 0;
  let deadStockValue = 0;
  let slowStockValue = 0;
  for (const m of byProduct.values()) {
    if (m.product.kind === "service") continue;
    endingUnits += Math.max(0, m.qty);
    if (m.health === "dead" || m.health === "obsolete") deadStockValue += m.stockValue;
    else if (m.health === "slow") slowStockValue += m.stockValue;
  }
  const sellThroughPct = unitsSold + endingUnits === 0 ? 0 : (unitsSold / (unitsSold + endingUnits)) * 100;
  const attachRatePct =
    args.attachHandsetSales === 0 ? 0 : (args.attachWithAccessory / args.attachHandsetSales) * 100;

  const shrinkValue = Math.abs(sum(data.opnameLines.filter((l) => l.variance !== 0).map((l) => l.varianceValue)));
  const shrinkagePct = inventoryValueNow === 0 ? 0 : (shrinkValue / inventoryValueNow) * 100;
  const shrinkagePctPrev = inventoryValueNow === 0 ? 0 : (shrinkValue / inventoryValueNow) * 100;

  const fixed = data.expenses.filter(
    (e) => e.category === "rent" || e.category === "salary" || e.category === "utilities"
  );
  const monthlyFixedCost = fixed.length === 0 ? 0 : sum(fixed.slice(-9).map((e) => e.amount)) / 3;
  const blendedMarginPct = netSales === 0 ? 0 : (grossProfit / netSales) * 100;
  const breakEvenSalesPerDay =
    blendedMarginPct === 0 ? 0 : monthlyFixedCost / 30 / (blendedMarginPct / 100);

  const reviewRequestsSent = data.reviewRequests.filter((r) => r.sentAt !== null).length;
  const reviewClicks = data.reviewRequests.filter((r) => r.clickedAt !== null).length;

  const payablesDue7 = data.purchaseOrders
    .filter((po) => po.paidAt === null && Date.parse(po.dueDate) <= Date.parse(data.asOf) + 7 * DAY_MS)
    .reduce((s, po) => s + po.total, 0);
  const receivablesOpen = data.receivables
    .filter((r) => r.status !== "paid")
    .reduce((s, r) => s + (r.amount - r.paidAmount), 0);
  const receivablesOverdue = data.receivables
    .filter((r) => r.status !== "paid" && Date.parse(r.dueDate) < Date.parse(data.asOf))
    .reduce((s, r) => s + (r.amount - r.paidAmount), 0);

  return {
    days,
    netSales,
    grossProfit,
    grossMarginPct: blendedMarginPct,
    cogs,
    opex,
    draws,
    cashOnHand: cashNow,
    inventoryValue: inventoryValueNow,
    payablesDue7,
    payablesTotal: payablesNow,
    receivablesOpen,
    receivablesOverdue,
    trueBurnPerDay: round(trueBurnPerDay),
    trueBurnPrev: round(trueBurnPrev),
    runwayDays,
    runwayState,
    replenishmentRatio,
    ownerDrawRatio,
    dio,
    turnover,
    gmroi,
    sellThroughPct,
    attachRatePct,
    discountLeakagePct: grossSales === 0 ? 0 : (discountTotal / grossSales) * 100,
    discountTotal,
    belowCostCount,
    belowCostLoss: round(belowCostLoss),
    shrinkagePct: Math.max(shrinkagePct, shrinkagePctPrev),
    breakEvenSalesPerDay: round(breakEvenSalesPerDay),
    avgDailySales: round(netSales / days),
    reviewClickRatePct: reviewRequestsSent === 0 ? 0 : (reviewClicks / reviewRequestsSent) * 100,
    reviewRequestsSent,
    reviewClicks,
    salesCount: sum(window.map((d) => d.salesCount)),
    deadStockValue: round(deadStockValue),
    slowStockValue: round(slowStockValue),
    shiftVarianceTotal: round(sum(data.shifts.map((s) => s.variance ?? 0))),
    monthlyFixedCost: round(monthlyFixedCost),
  };
}

/* ------------------------------------------------------------- jembatan kas */

/** Stock-to-Cash Bridge: dari kas awal ke kas akhir, satu batang per sebab. */
export function buildCashBridge(ctx: Context, days: number): CashBridgeStep[] {
  const window = ctx.daily.slice(-days);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return [];

  const openingCash = first.cashEod - first.cashIn + first.cashOut;
  const windowStart = dayStartMs(first.date);

  const salesIn = sum(window.map((d) => d.cashIn));
  const supplierPaid =
    sum(
      ctx.data.purchaseOrders
        .filter((po) => po.paidAt !== null && Date.parse(po.paidAt) >= windowStart)
        .map((po) => po.total)
    ) || round(sum(window.map((d) => d.cashOut)) * 0.62);
  const opex = sum(window.map((d) => d.opex));
  const draws = sum(window.map((d) => d.draws));

  const steps: CashBridgeStep[] = [
    {
      label: "Kas awal",
      kind: "start",
      value: round(openingCash),
      running: round(openingCash),
      hint: "Saldo semua akun kas di awal periode",
    },
    {
      label: "Penerimaan penjualan",
      kind: "in",
      value: round(salesIn),
      running: round(openingCash + salesIn),
      hint: "Tunai, QRIS, transfer, e-wallet, dan pelunasan bon",
    },
    {
      label: "Belanja stok",
      kind: "out",
      value: -round(supplierPaid),
      running: round(openingCash + salesIn - supplierPaid),
      hint: "Kas yang berubah bentuk jadi persediaan, bukan hilang",
    },
    {
      label: "Beban operasional",
      kind: "out",
      value: -round(opex),
      running: round(openingCash + salesIn - supplierPaid - opex),
      hint: "Sewa, gaji, listrik, promosi",
    },
    {
      label: "Prive pemilik",
      kind: "out",
      value: -round(draws),
      running: round(openingCash + salesIn - supplierPaid - opex - draws),
      hint: "Kas yang diambil pemilik untuk keperluan pribadi",
    },
  ];

  const expected = openingCash + salesIn - supplierPaid - opex - draws;
  const diff = last.cashEod - expected;
  if (Math.abs(diff) > 5_000) {
    steps.push({
      label: "Selisih pencatatan",
      kind: diff >= 0 ? "in" : "out",
      value: round(diff),
      running: round(expected + diff),
      hint: "Perbedaan waktu pencatatan dan pembulatan",
    });
  }

  steps.push({
    label: "Kas akhir",
    kind: "total",
    value: round(last.cashEod),
    running: round(last.cashEod),
    hint: "Saldo kas hari ini",
  });

  return steps;
}

/* -------------------------------------------------------- leak detector */

export function detectLeaks(ctx: Context): LeakFinding[] {
  const { data, kpis } = ctx;
  const findings: LeakFinding[] = [];
  const saleById = new Map(data.sales.map((s) => [s.id, s]));
  const window = ctx.daily.slice(-30);
  const windowStart = dayStartMs(window[0]?.date ?? data.startDate);

  const belowCost = data.saleItems.filter((it) => {
    const sale = saleById.get(it.saleId);
    if (!sale || sale.status === "void") return false;
    return Date.parse(sale.createdAt) >= windowStart && it.lineTotal < it.unitCost * it.qty;
  });
  if (belowCost.length > 0) {
    const loss = sum(belowCost.map((it) => it.unitCost * it.qty - it.lineTotal));
    findings.push({
      id: "below_cost",
      rule: "Jual di bawah harga pokok",
      severity: loss > 500_000 ? "high" : "medium",
      impactPerMonth: round(loss),
      evidence: `${belowCost.length} baris transaksi 30 hari terakhir di bawah HPP, kerugian ${fmt(loss)}.`,
      action: "Aktifkan margin guard: tolak harga di bawah batas tanpa PIN pemilik.",
      count: belowCost.length,
      href: "/app/sales?filter=below_cost",
    });
  }

  if (kpis.discountLeakagePct > 4) {
    const leak = ((kpis.discountLeakagePct - 4) / 100) * kpis.netSales;
    findings.push({
      id: "discount",
      rule: "Kebocoran diskon di atas 4%",
      severity: kpis.discountLeakagePct > 6 ? "high" : "medium",
      impactPerMonth: round(leak),
      evidence: `Diskon 30 hari terakhir ${kpis.discountLeakagePct.toFixed(1)}% dari penjualan kotor (batas 4%).`,
      action: "Wajibkan alasan diskon dan kunci batas staf pada 5%.",
      count: ctx.data.sales.filter((s) => s.discountTotal > 0 && Date.parse(s.createdAt) >= windowStart).length,
      href: "/app/reports?report=diskon",
    });
  }

  const draws30 = sum(window.map((d) => d.draws));
  if (draws30 > data.profile.ownerDrawMonthlyCap) {
    /* Dampaknya bukan "prive dianggap kerugian", melainkan modal kerja yang
       hilang: uang yang kalau ditahan bisa berputar di stok dan menghasilkan laba. */
    const excess = draws30 - data.profile.ownerDrawMonthlyCap;
    const workingCapitalLoss = excess * (kpis.gmroi / 12);
    findings.push({
      id: "owner_draw",
      rule: "Prive pemilik melebihi batas",
      severity: "high",
      impactPerMonth: round(workingCapitalLoss),
      evidence: `Prive 30 hari terakhir ${fmt(draws30)}, batas bulanan ${fmt(
        data.profile.ownerDrawMonthlyCap
      )}. Kelebihan ${fmt(excess)} diambil dari modal kerja.`,
      action: `Tetapkan prive tetap ${fmt(data.profile.ownerDrawMonthlyCap)} dan tahan sisanya di kas untuk belanja stok.`,
      count: window.filter((d) => d.draws > 0).length,
      href: "/app/finance?tab=prive",
    });
  }

  if (kpis.replenishmentRatio < 1) {
    /* Dampaknya bukan "nilai belanja yang kurang" (itu bukan kerugian), melainkan
       laba kotor yang hilang karena stok tidak sempat diganti. */
    const shortfallAtCost = (1 - kpis.replenishmentRatio) * kpis.cogs;
    const lostProfit = shortfallAtCost * (kpis.grossMarginPct / 100);
    findings.push({
      id: "replenishment",
      rule: "Rasio replenishment di bawah 1",
      severity: kpis.replenishmentRatio < 0.9 ? "high" : "medium",
      impactPerMonth: round(lostProfit),
      evidence: `Belanja stok hanya ${(kpis.replenishmentRatio * 100).toFixed(0)}% dari HPP, sehingga ${fmt(
        shortfallAtCost
      )} penjualan tidak bisa dilayani karena barangnya tidak ada.`,
      action: "Naikkan belanja stok ke minimal 100% HPP setelah beban dan prive dipangkas.",
      count: 1,
      href: "/app/recovery?tab=reorder",
    });
  }

  const catMargin = new Map<string, { profit: number; revenue: number }>();
  for (const m of ctx.byProduct.values()) {
    const cur = catMargin.get(m.product.kind) ?? { profit: 0, revenue: 0 };
    cur.profit += m.grossProfit;
    cur.revenue += m.revenue;
    catMargin.set(m.product.kind, cur);
  }
  const handset = catMargin.get("handset");
  if (handset && handset.revenue > 0 && handset.profit / handset.revenue < 0.055) {
    const gap = (0.075 - handset.profit / handset.revenue) * handset.revenue;
    findings.push({
      id: "margin_erosion",
      rule: "Erosi margin handset",
      severity: "medium",
      impactPerMonth: round(gap / 6),
      evidence: `Margin handset ${((handset.profit / handset.revenue) * 100).toFixed(1)}%, di bawah target 7,5%.`,
      action: "Tinjau harga jual handset dan batasi nego.",
      count: 1,
      href: "/app/products?filter=margin_tipis",
    });
  }

  if (kpis.deadStockValue > 0) {
    findings.push({
      id: "dead_stock",
      rule: "Kas tertahan di stok mati",
      severity: kpis.deadStockValue > 15_000_000 ? "high" : "medium",
      impactPerMonth: round(kpis.deadStockValue * 0.22),
      evidence: `${fmt(kpis.deadStockValue)} modal tertahan pada barang tanpa penjualan 60 hari atau lebih.`,
      action: "Markdown bertahap atau kembalikan ke supplier.",
      count: [...ctx.byProduct.values()].filter((m) => m.health === "dead" || m.health === "obsolete").length,
      href: "/app/recovery?tab=bebas-kas",
    });
  }

  const voucherMetrics = [...ctx.byProduct.values()].filter((m) => m.product.kind === "voucher");
  const voucherStock = sum(voucherMetrics.map((m) => m.stockValue));
  const voucherRevenue = sum(voucherMetrics.map((m) => m.revenue));
  const voucherProfit = sum(voucherMetrics.map((m) => m.grossProfit));
  if (voucherStock > 2_000_000 && voucherRevenue > 0 && voucherProfit / voucherRevenue < 0.035) {
    findings.push({
      id: "voucher_float",
      rule: "Float pulsa menahan modal dengan margin tipis",
      severity: "low",
      impactPerMonth: round(voucherStock * 0.18),
      evidence: `${fmt(voucherStock)} modal berputar di voucher dengan margin ${((voucherProfit / voucherRevenue) * 100).toFixed(1)}%.`,
      action: "Turunkan nominal stok pulsa, top up lebih sering dengan jumlah kecil.",
      count: voucherMetrics.length,
      href: "/app/products?kind=voucher",
    });
  }

  if (kpis.shrinkagePct > 1) {
    findings.push({
      id: "shrinkage",
      rule: "Selisih opname di atas 1%",
      severity: kpis.shrinkagePct > 2 ? "high" : "medium",
      impactPerMonth: round((kpis.shrinkagePct / 100) * kpis.inventoryValue),
      evidence: `Selisih fisik ${kpis.shrinkagePct.toFixed(2)}% dari nilai persediaan.`,
      action: "Blind count dan telusuri unit hilang per IMEI.",
      count: data.opnameLines.filter((l) => l.variance !== 0).length,
      href: "/app/inventory?tab=opname",
    });
  }

  if (Math.abs(kpis.shiftVarianceTotal) > 50_000) {
    findings.push({
      id: "shift_variance",
      rule: "Selisih kas saat tutup shift",
      severity: "low",
      impactPerMonth: round(Math.abs(kpis.shiftVarianceTotal) * 0.6),
      evidence: `Total selisih kas periode ini ${fmt(kpis.shiftVarianceTotal)}.`,
      action: "Wajibkan hitung ulang laci saat selisih di atas Rp 20.000.",
      count: data.shifts.filter((s) => (s.variance ?? 0) !== 0).length,
      href: "/app/shifts",
    });
  }

  if (kpis.receivablesOverdue > 0) {
    findings.push({
      id: "receivables",
      rule: "Bon pelanggan lewat jatuh tempo",
      severity: kpis.receivablesOverdue > 5_000_000 ? "high" : "medium",
      impactPerMonth: round(kpis.receivablesOverdue * 0.1),
      evidence: `${fmt(kpis.receivablesOverdue)} bon melewati jatuh tempo.`,
      action: "Kirim pengingat terjadwal, hentikan bon baru untuk pelanggan itu.",
      count: data.receivables.filter((r) => r.status !== "paid" && Date.parse(r.dueDate) < Date.parse(data.asOf)).length,
      href: "/app/finance?tab=piutang",
    });
  }

  return findings.sort((a, b) => b.impactPerMonth - a.impactPerMonth);
}

/* -------------------------------------------------------- free-cash planner */

export function buildFreeCashPlan(ctx: Context, limit = 12): FreeCashItem[] {
  const items: FreeCashItem[] = [];
  for (const m of ctx.byProduct.values()) {
    if (m.health === "healthy" || m.qty <= 0) continue;
    const basePrice = m.lastPrice ?? m.product.price;
    const markdownPct = m.health === "obsolete" ? 18 : m.health === "dead" ? 12 : 6;
    const raw = Math.round((basePrice * (1 - markdownPct / 100)) / 500) * 500;
    const suggestedPrice = Math.max(m.product.cost, raw);
    items.push({
      product: m.product,
      qty: m.qty,
      cost: m.product.cost,
      lastPrice: m.lastPrice,
      lastSoldAt: m.lastSoldAt,
      daysSinceLastSale: m.daysSinceLastSale,
      health: m.health,
      trappedCash: m.stockValue,
      markdownPct: Math.round(((basePrice - suggestedPrice) / basePrice) * 100),
      suggestedPrice,
      expectedCash: suggestedPrice * m.qty,
      marginSacrificed: Math.max(0, (basePrice - suggestedPrice) * m.qty),
      action:
        m.health === "obsolete"
          ? m.product.kind === "handset"
            ? "Kembalikan ke supplier atau jual borongan ke konter lain"
            : "Bundel dengan barang cepat laku, jual sebagai paket"
          : m.health === "dead"
            ? "Markdown dan pindahkan ke etalase depan"
            : "Bundel dengan handset, tawarkan setiap ada pembeli",
    });
  }
  return items.sort((a, b) => b.trappedCash - a.trappedCash).slice(0, limit);
}

/* ------------------------------------------------------- reorder planner */

export function buildReorderPlan(
  ctx: Context,
  opts: { allocationPct?: number; safetyFloor?: Rupiah; horizonDays?: number } = {}
): ReorderPlan {
  const allocationPct = opts.allocationPct ?? 40;
  const safetyFloor = opts.safetyFloor ?? ctx.data.profile.safetyCashFloor;
  const horizon = opts.horizonDays ?? 14;
  const payablesDue = ctx.data.purchaseOrders
    .filter((po) => po.paidAt === null && Date.parse(po.dueDate) <= Date.parse(ctx.data.asOf) + horizon * DAY_MS)
    .reduce((s, po) => s + po.total, 0);
  const available = Math.max(0, ctx.cashNow - safetyFloor - payablesDue);
  const openToBuy = Math.round((available * allocationPct) / 100);

  const candidates: ReorderCandidate[] = [];
  for (const m of ctx.byProduct.values()) {
    const p = m.product;
    if (p.kind === "service" || p.supplierId === null) continue;
    const demand = m.avgDailyDemand;
    if (demand <= 0 && m.health !== "healthy") continue;
    const target = Math.max(p.reorderPoint, Math.ceil(demand * 14));
    const qty = Math.max(0, Math.min(p.reorderQty, target - m.qty));
    if (qty <= 0) continue;
    const supplier = ctx.data.suppliers.find((s) => s.id === p.supplierId);
    const unitProfit = p.price - p.cost;
    const dailyProfit = unitProfit * demand;
    const totalCost = qty * p.cost;
    const gmroi = m.stockValue > 0 ? m.grossProfit / Math.max(1, m.stockValue) : (unitProfit / Math.max(1, p.cost)) * 4;
    candidates.push({
      product: p,
      qty,
      unitCost: p.cost,
      totalCost,
      gmroi,
      avgDailyDemand: demand,
      daysOfCover: m.daysOfCover,
      paybackDays: dailyProfit === 0 ? 999 : totalCost / dailyProfit,
      score: (dailyProfit / Math.max(1, totalCost)) * 100,
      supplierId: p.supplierId,
      leadTimeDays: supplier?.leadTimeDays ?? 3,
      funded: false,
      note: m.qty === 0 ? "Stok habis" : m.qty <= p.reorderPoint ? "Di bawah titik pesan ulang" : "Menambah kedalaman stok",
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  let remaining = openToBuy;
  const funded: ReorderCandidate[] = [];
  const deferred: ReorderCandidate[] = [];
  for (const c of candidates) {
    if (c.totalCost <= remaining) {
      c.funded = true;
      remaining -= c.totalCost;
      funded.push(c);
      continue;
    }
    const partial = Math.floor(remaining / c.unitCost);
    if (partial >= 1) {
      const partialCandidate: ReorderCandidate = {
        ...c,
        qty: partial,
        totalCost: partial * c.unitCost,
        funded: true,
        note: `${c.note} (sebagian, kas terbatas)`,
      };
      remaining -= partialCandidate.totalCost;
      funded.push(partialCandidate);
    }
    deferred.push(c);
  }

  const totalFunded = sum(funded.map((c) => c.totalCost));
  const weighted = sum(funded.map((c) => c.paybackDays * c.totalCost));

  return {
    openToBuy,
    cashOnHand: ctx.cashNow,
    safetyFloor,
    payablesDue,
    allocationPct,
    candidates,
    funded,
    deferred,
    totalFunded,
    expectedPaybackDays: totalFunded === 0 ? 0 : Math.round(weighted / totalFunded),
  };
}

/* --------------------------------------------------------------- what-if */

export function simulate(ctx: Context, levers: WhatIfLevers): WhatIfResult {
  const base = ctx.kpis;
  const window = ctx.daily.slice(-30);
  const dayCount = window.length || 1;
  const dailySales = base.netSales / dayCount;
  const dailyCogs = base.cogs / dayCount;
  const dailyOpex = base.opex / dayCount + levers.expenseCut / 30;
  const dailyDraws = base.draws / dayCount;

  const marginShift = levers.marginPoints / 100;
  const discountSaving = (base.discountLeakagePct / 100) * (levers.discountCutPct / 100) * dailySales;
  const attachGain = (levers.attachRatePoints / 100) * (base.attachRatePct / 100) * dailySales * 0.35;
  const grossProfitBase = dailySales - dailyCogs;
  const grossProfitScenario = grossProfitBase * (1 + marginShift) + discountSaving + attachGain;
  const drawsScenario = dailyDraws * (1 - levers.drawCutPct / 100);

  const baseNet = grossProfitBase - dailyOpex - dailyDraws;
  const scenarioNet = grossProfitScenario - dailyOpex - drawsScenario;

  const deadStockCash = (base.deadStockValue * levers.deadStockLiquidatePct) / 100;
  const floatRelease = levers.supplierTermDays * dailyCogs * 0.1;

  const baseRunway = base.trueBurnPerDay >= 0 ? 365 : Math.round(ctx.cashNow / -base.trueBurnPerDay);
  const scenarioBurn = -scenarioNet;
  const scenarioRunway = scenarioBurn <= 0 ? 365 : Math.round((ctx.cashNow + deadStockCash) / scenarioBurn);

  const weekly: { week: number; base: Rupiah; scenario: Rupiah }[] = [];
  let cashBase = ctx.cashNow;
  let cashScenario = ctx.cashNow + deadStockCash + floatRelease;
  for (let w = 1; w <= 13; w++) {
    cashBase += baseNet * 7;
    cashScenario += scenarioNet * 7;
    weekly.push({ week: w, base: round(cashBase), scenario: round(cashScenario) });
  }

  const at = (w: number): Rupiah => weekly[w - 1]?.scenario ?? round(cashScenario);

  const minimumCombination: string[] = [];
  if (scenarioNet < 0) {
    if (drawsScenario > 0) {
      minimumCombination.push(
        `Turunkan prive ${Math.min(60, Math.max(10, Math.ceil((-scenarioNet / Math.max(1, drawsScenario)) * 100)))}%`
      );
    }
    minimumCombination.push("Naikkan margin rata-rata 3 poin");
    minimumCombination.push("Cairkan minimal 40% stok mati");
  }

  return {
    levers,
    baseRunwayDays: baseRunway,
    runwayDays: scenarioRunway,
    baseTrueBurn: base.trueBurnPerDay,
    trueBurn: round(scenarioBurn),
    breakEvenSalesPerDay: round((dailyOpex + drawsScenario) / Math.max(0.01, grossProfitScenario / Math.max(1, dailySales))),
    cashWeek4: at(4),
    cashWeek8: at(8),
    cashWeek13: at(13),
    weekly,
    cashFreed: round(deadStockCash),
    minimumCombination,
    safe: scenarioBurn <= 0,
  };
}

/* --------------------------------------------------------- recovery score */

export function recoveryScore(ctx: Context): RecoveryScore {
  const k = ctx.kpis;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  const deadShare = k.inventoryValue === 0 ? 0 : (k.deadStockValue / k.inventoryValue) * 100;
  const components = [
    {
      key: "runway",
      label: "Runway kas",
      value: Math.round(clamp((k.runwayDays / 60) * 100)),
      weight: 0.3,
      detail: `${Number.isFinite(k.runwayDays) ? Math.round(k.runwayDays) : 365} hari pada True Burn ${fmt(k.trueBurnPerDay)}/hari`,
    },
    {
      key: "replenish",
      label: "Rasio replenishment",
      value: Math.round(clamp(k.replenishmentRatio * 100)),
      weight: 0.2,
      detail: `Belanja stok ${(k.replenishmentRatio * 100).toFixed(0)}% dari HPP`,
    },
    {
      key: "leak",
      label: "Kebocoran",
      value: Math.round(clamp(100 - k.belowCostCount * 10 - Math.max(0, (k.discountLeakagePct - 4) * 18))),
      weight: 0.2,
      detail: `${k.belowCostCount} transaksi di bawah HPP, diskon ${k.discountLeakagePct.toFixed(1)}%`,
    },
    {
      key: "dead",
      label: "Kesehatan stok",
      value: Math.round(clamp(100 - deadShare * 2.2)),
      weight: 0.15,
      detail: `${deadShare.toFixed(0)}% nilai stok adalah stok mati`,
    },
    {
      key: "margin",
      label: "Margin kotor",
      value: Math.round(clamp((k.grossMarginPct / 9) * 100)),
      weight: 0.15,
      detail: `Margin kotor ${k.grossMarginPct.toFixed(1)}%`,
    },
  ];

  const score = Math.round(sum(components.map((c) => c.value * c.weight)));
  const band: RecoveryScore["band"] = score < 40 ? "kritis" : score < 70 ? "waspada" : "sehat";
  const worst = [...components].sort((a, b) => a.value - b.value);
  return {
    score,
    band,
    components,
    topActions: worst.slice(0, 3).map((c) => actionFor(c.key, ctx)),
  };
}

function actionFor(key: string, ctx: Context): string {
  const k = ctx.kpis;
  const n = (v: number) => Math.round(v).toLocaleString("id-ID");
  switch (key) {
    case "runway":
      return `Pangkas prive dan beban tetap. Setiap Rp 1 juta per bulan menambah sekitar ${n(
        Math.max(1, 1_000_000 / Math.max(1, Math.abs(k.trueBurnPerDay)))
      )} hari runway.`;
    case "replenish":
      return "Naikkan belanja stok ke 100% HPP setelah beban non-stok dipangkas.";
    case "leak":
      return "Aktifkan margin guard dan wajibkan PIN pemilik untuk diskon di atas 5%.";
    case "dead":
      return `Cairkan ${fmt(k.deadStockValue)} stok mati dengan markdown bertahap.`;
    case "margin":
      return "Geser bauran ke aksesori dan jasa yang marginnya jauh lebih tinggi.";
    default:
      return "Tinjau ulang struktur biaya.";
  }
}

/* ------------------------------------------------------------- 13 minggu */

export function forecast13Weeks(ctx: Context): ForecastWeek[] {
  const window = ctx.daily.slice(-42);
  const dayCount = window.length || 1;
  const dailySales = sum(window.map((d) => d.sales)) / dayCount;
  const dailyGross = sum(window.map((d) => d.grossProfit)) / dayCount;
  const dailyOpex = sum(window.map((d) => d.opex)) / dayCount;
  const dailyDraws = sum(window.map((d) => d.draws)) / dayCount;

  const baseNet = dailyGross - dailyOpex - dailyDraws;
  const conservativeNet = baseNet * 1.35 - dailySales * 0.03;
  const recoveryNet = dailyGross * 1.12 - dailyOpex * 0.92 - dailyDraws * 0.5;

  const weeks: ForecastWeek[] = [];
  let base = ctx.cashNow;
  let cons = ctx.cashNow;
  let rec = ctx.cashNow;
  for (let w = 1; w <= 13; w++) {
    base += baseNet * 7;
    cons += conservativeNet * 7;
    rec += recoveryNet * 7;
    weeks.push({ week: w, label: `M${w}`, base: round(base), conservative: round(cons), recovery: round(rec) });
  }
  return weeks;
}

/* ------------------------------------------------------------ daftar bantu */

export function topMovers(ctx: Context, limit = 8): ProductMetric[] {
  return [...ctx.byProduct.values()]
    .filter((m) => m.product.kind !== "service")
    .sort((a, b) => b.grossProfit - a.grossProfit)
    .slice(0, limit);
}

export function deadStockList(ctx: Context, limit = 8): ProductMetric[] {
  return [...ctx.byProduct.values()]
    .filter((m) => (m.health === "dead" || m.health === "obsolete") && m.qty > 0)
    .sort((a, b) => b.trappedCash - a.trappedCash)
    .slice(0, limit);
}

export function lowStockList(ctx: Context, limit = 10): ProductMetric[] {
  return [...ctx.byProduct.values()]
    .filter((m) => m.product.kind !== "service" && m.qty <= m.product.reorderPoint && m.avgDailyDemand > 0)
    .sort((a, b) => a.daysOfCover - b.daysOfCover)
    .slice(0, limit);
}

/* ------------------------------------------------------------ fakta untuk AI */

export function factsForAi(ctx: Context): Record<string, number | string> {
  const k = ctx.kpis;
  const leaks = detectLeaks(ctx);
  const plan = buildReorderPlan(ctx);
  return {
    kas_sekarang: k.cashOnHand,
    nilai_stok: k.inventoryValue,
    true_burn_per_hari: k.trueBurnPerDay,
    runway_hari: Number.isFinite(k.runwayDays) ? Math.round(k.runwayDays) : 365,
    penjualan_30_hari: k.netSales,
    laba_kotor_30_hari: k.grossProfit,
    margin_kotor_persen: Number(k.grossMarginPct.toFixed(2)),
    beban_30_hari: k.opex,
    prive_30_hari: k.draws,
    rasio_replenishment: Number(k.replenishmentRatio.toFixed(3)),
    stok_mati: k.deadStockValue,
    dio_hari: Number(k.dio.toFixed(1)),
    gmroi: Number(k.gmroi.toFixed(2)),
    attach_rate_persen: Number(k.attachRatePct.toFixed(1)),
    kebocoran_diskon_persen: Number(k.discountLeakagePct.toFixed(2)),
    transaksi_di_bawah_hpp: k.belowCostCount,
    temuan_kebocoran: leaks.length,
    open_to_buy: plan.openToBuy,
    kandidat_reorder: plan.candidates.length,
    titik_impas_penjualan_per_hari: k.breakEvenSalesPerDay,
  };
}
