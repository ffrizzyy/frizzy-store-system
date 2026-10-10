import { NextResponse } from "next/server";
import { generateDataset } from "@/lib/generator";
import { computeContext, detectLeaks, buildCashBridge } from "@/lib/metrics";

export const dynamic = "force-static";
export const revalidate = 3600;

export type Headline = {
  cash: number;
  trueBurn: number;
  runway: number;
  state: "safe" | "watch" | "critical";
  cashSeries: number[];
  inventorySeries: number[];
  deadStock: number;
  replenishment: number;
  leakCount: number;
  leakImpact: number;
  deadShare: number;
  drawMonthly: number;
  drawCap: number;
  netSales30: number;
  grossProfit30: number;
  safetyFloor: number;
  bridge: { label: string; kind: string; value: number }[];
  days: number;
  asOf: string;
};

function build(): Headline {
  const data = generateDataset();
  const ctx = computeContext(data);
  const leaks = detectLeaks(ctx);
  const bridge = buildCashBridge(ctx, 30).map((s) => ({ label: s.label, kind: s.kind, value: s.value }));
  const window = ctx.daily.slice(-30);
  const drawMonthly = window.reduce((s, d) => s + d.draws, 0);
  const deadShare = ctx.inventoryValueNow === 0 ? 0 : (ctx.kpis.deadStockValue / ctx.inventoryValueNow) * 100;

  return {
    cash: ctx.kpis.cashOnHand,
    trueBurn: ctx.kpis.trueBurnPerDay,
    runway: Number.isFinite(ctx.kpis.runwayDays) ? ctx.kpis.runwayDays : 3650,
    state: ctx.kpis.runwayState,
    cashSeries: ctx.daily.slice(-90).map((d) => d.cashEod),
    inventorySeries: ctx.daily.slice(-90).map((d) => d.inventoryValue),
    deadStock: ctx.kpis.deadStockValue,
    replenishment: ctx.kpis.replenishmentRatio,
    leakCount: leaks.length,
    leakImpact: leaks.reduce((s, l) => s + l.impactPerMonth, 0),
    deadShare,
    drawMonthly,
    drawCap: data.profile.ownerDrawMonthlyCap,
    netSales30: ctx.kpis.netSales,
    grossProfit30: ctx.kpis.grossProfit,
    safetyFloor: data.profile.safetyCashFloor,
    bridge,
    days: ctx.kpis.days,
    asOf: data.asOf,
  };
}

/** Ringkasan untuk halaman publik: tidak memuat seluruh dataset. */
export function GET() {
  return NextResponse.json(build(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
