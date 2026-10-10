import { generateDataset } from "./generator.ts";
import {
  computeContext,
  buildCashBridge,
  detectLeaks,
  buildReorderPlan,
  buildFreeCashPlan,
  simulate,
  recoveryScore,
  forecast13Weeks,
} from "./metrics.ts";

const t0 = Date.now();
const data = generateDataset();
const ctx = computeContext(data);
const ms = Date.now() - t0;

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const k = ctx.kpis;

console.log(`== waktu hitung: ${ms} ms`);
console.log(`== penjualan: ${data.sales.length} struk, ${data.saleItems.length} baris, ${data.units.length} unit IMEI`);
console.log(`kas sekarang            : ${rp(k.cashOnHand)}`);
console.log(`nilai stok (HPP)        : ${rp(k.inventoryValue)}`);
console.log(`penjualan 30 hari       : ${rp(k.netSales)}`);
console.log(`laba kotor 30 hari      : ${rp(k.grossProfit)} (${k.grossMarginPct.toFixed(2)}%)`);
console.log(`beban 30 hari           : ${rp(k.opex)} | prive: ${rp(k.draws)}`);
console.log(`True Burn / hari        : ${rp(k.trueBurnPerDay)} (sebelumnya ${rp(k.trueBurnPrev)})`);
console.log(`Runway                  : ${Number.isFinite(k.runwayDays) ? k.runwayDays.toFixed(1) : "tak terbatas"} hari -> ${k.runwayState}`);
console.log(`rasio replenishment     : ${k.replenishmentRatio.toFixed(3)}`);
console.log(`DIO / turnover / GMROI  : ${k.dio.toFixed(1)} hari / ${k.turnover.toFixed(2)}x / ${k.gmroi.toFixed(2)}`);
console.log(`attach rate             : ${k.attachRatePct.toFixed(1)}%`);
console.log(`kebocoran diskon        : ${k.discountLeakagePct.toFixed(2)}% (${rp(k.discountTotal)})`);
console.log(`di bawah HPP            : ${k.belowCostCount} baris, rugi ${rp(k.belowCostLoss)}`);
console.log(`stok mati / lambat      : ${rp(k.deadStockValue)} / ${rp(k.slowStockValue)}`);
console.log(`piutang open/overdue    : ${rp(k.receivablesOpen)} / ${rp(k.receivablesOverdue)}`);
console.log(`titik impas jualan/hari : ${rp(k.breakEvenSalesPerDay)} (aktual ${rp(k.avgDailySales)})`);
console.log(`biaya tetap per bulan   : ${rp(k.monthlyFixedCost)}`);
console.log(`rating ulasan           : ${k.reviewClicks}/${k.reviewRequestsSent} = ${k.reviewClickRatePct.toFixed(1)}%`);
console.log(`selisih kas shift       : ${rp(k.shiftVarianceTotal)}`);
console.log("-- jembatan kas 30 hari --");
for (const s of buildCashBridge(ctx, 30)) {
  console.log(`  ${s.kind.padEnd(6)} ${s.label.padEnd(22)} ${rp(s.value).padStart(18)} -> ${rp(s.running)}`);
}
console.log("-- temuan kebocoran --");
for (const f of detectLeaks(ctx)) {
  console.log(`  [${f.severity}] ${f.rule} | dampak/bulan ${rp(f.impactPerMonth)} | ${f.evidence}`);
}
const plan = buildReorderPlan(ctx);
console.log("-- rencana reorder --");
console.log(`  kas ${rp(plan.cashOnHand)}, lantai aman ${rp(plan.safetyFloor)}, utang jatuh tempo ${rp(plan.payablesDue)}`);
console.log(`  open-to-buy ${rp(plan.openToBuy)} (${plan.allocationPct}%), terdanai ${rp(plan.totalFunded)}, payback ${plan.expectedPaybackDays} hari`);
for (const c of plan.funded.slice(0, 6)) {
  console.log(`   + ${c.qty}x ${c.product.name} = ${rp(c.totalCost)} | skor ${c.score.toFixed(2)} | lead ${c.leadTimeDays} hari`);
}
for (const c of plan.deferred.slice(0, 4)) {
  console.log(`   - ditunda: ${c.product.name} (${rp(c.totalCost)})`);
}
console.log("-- rencana bebas kas --");
for (const f of buildFreeCashPlan(ctx).slice(0, 6)) {
  console.log(
    `  ${f.health.padEnd(8)} ${f.product.name.slice(0, 34).padEnd(34)} ${f.qty} pcs | tertahan ${rp(f.trappedCash)} | markdown ${f.markdownPct}% -> ${rp(f.suggestedPrice)}`
  );
}
const score = recoveryScore(ctx);
console.log(`-- skor pemulihan: ${score.score}/100 (${score.band})`);
for (const c of score.components) console.log(`   ${c.label.padEnd(22)} ${String(c.value).padStart(3)} x${c.weight} :: ${c.detail}`);
console.log("   aksi teratas:");
for (const a of score.topActions) console.log(`     - ${a}`);
const wi = simulate(ctx, {
  marginPoints: 3,
  drawCutPct: 60,
  deadStockLiquidatePct: 50,
  discountCutPct: 40,
  attachRatePoints: 10,
  supplierTermDays: 10,
  expenseCut: 500_000,
});
console.log("-- what-if (margin +3pt, prive -60%, stok mati 50%, diskon -40%, attach +10pt, termin +10h) --");
console.log(`   runway ${wi.baseRunwayDays} -> ${wi.runwayDays} hari | True Burn ${rp(wi.baseTrueBurn)} -> ${rp(wi.trueBurn)}`);
console.log(`   kas minggu 4/8/13: ${rp(wi.cashWeek4)} / ${rp(wi.cashWeek8)} / ${rp(wi.cashWeek13)} | impas ${rp(wi.breakEvenSalesPerDay)}/hari`);
console.log(`   aman: ${wi.safe} | kombinasi minimum: ${wi.minimumCombination.join("; ")}`);
console.log("-- prakiraan 13 minggu (base) --");
console.log("  " + forecast13Weeks(ctx).map((w) => `${w.label}:${Math.round(w.base / 1_000_000)}jt`).join(" "));

/* kas terendah sepanjang periode */
let run = 0;
let lowest = Number.POSITIVE_INFINITY;
let lowestAt = "";
for (const c of [...data.cashTransactions].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
  run += c.direction === "in" ? c.amount : -c.amount;
  if (run < lowest) {
    lowest = run;
    lowestAt = c.occurredAt.slice(0, 10);
  }
}
console.log(`kas terendah sepanjang periode: ${rp(lowest)} pada ${lowestAt}`);
