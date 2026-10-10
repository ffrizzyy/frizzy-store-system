import { generateDataset } from "./generator.ts";
import { computeContext } from "./metrics.ts";

const data = generateDataset();
const ctx = computeContext(data);
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

console.log("stok per jenis:");
for (const kind of ["handset", "accessory", "voucher"]) {
  const items = [...ctx.byProduct.values()].filter((m) => m.product.kind === kind);
  const qty = items.reduce((s, m) => s + m.qty, 0);
  const value = items.reduce((s, m) => s + m.stockValue, 0);
  console.log(`  ${kind.padEnd(10)} ${String(qty).padStart(4)} unit | ${rp(value)}`);
}

console.log("\nmodel lama (kandidat stok mati):");
for (const sku of ["IPO-15-128", "IPO-12-64", "SAM-A125-128", "OPP-A54-128", "XIA-9A-64"]) {
  const p = data.products.find((x) => x.sku === sku);
  if (!p) continue;
  const m = ctx.byProduct.get(p.id);
  const units = data.units.filter((u) => u.productId === p.id);
  const sold = units.filter((u) => u.status === "sold").length;
  console.log(
    `  ${sku.padEnd(14)} unit dibuat ${String(units.length).padStart(3)} | terjual ${String(sold).padStart(3)} | sisa ${String(m?.qty ?? 0).padStart(3)} | ${m?.health} | umur ${m?.daysSinceLastSale}h | ${rp(m?.stockValue ?? 0)}`
  );
}

console.log("\ndistribusi mutasi pembelian handset per 30 hari terakhir:");
const cutoff = Date.parse(data.asOf) - 30 * 86_400_000;
const bought = data.movements.filter((m) => m.qtyDelta > 0 && Date.parse(m.occurredAt) >= cutoff);
const byKind = new Map<string, number>();
for (const m of bought) {
  const p = data.products.find((x) => x.id === m.productId);
  if (!p) continue;
  byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + m.qtyDelta * m.unitCost);
}
for (const [k, v] of byKind) console.log(`  ${k.padEnd(10)} ${rp(v)}`);
