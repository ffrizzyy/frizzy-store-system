/* ============================================================================
   Jembatan antara data penjualan nyata (src/lib/penjualan-nyata.ts, hasil
   ekstraksi obrolan WhatsApp) dan mesin data aplikasi (src/lib/generator.ts).

   Di sini penjualan unit yang nyata diubah menjadi:
   - katalog handset (produk + harga pokok yang diturunkan dari harga jual),
   - jadwal penjualan per tanggal, supaya generator dapat memutar penjualan
     pada jam dan harga yang benar-benar tercatat.

   Semua angka berasal dari obrolan; tidak ada nama pelanggan di berkas ini.
   ========================================================================= */

import {
  REAL_MODELS,
  REAL_MONTHLY,
  REAL_SALES,
  REAL_SALES_OTHER,
  REAL_SALES_SUMMARY,
  REAL_SELLERS,
  REAL_SELLER_LABEL,
  type RealModelSummary,
  type RealSale,
} from "./penjualan-nyata";

export {
  REAL_MODELS,
  REAL_MONTHLY,
  REAL_SALES,
  REAL_SALES_OTHER,
  REAL_SALES_SUMMARY,
  REAL_SELLERS,
  REAL_SELLER_LABEL,
};
export type { RealModelSummary, RealSale };

const DAY_MS = 86_400_000;

/** Markup harga jual terhadap harga pokok; dipakai untuk menaksir HPP. */
const COST_FACTOR = 0.945;
/** Model yang tidak laku dalam N hari terakhir dianggap stok mati. */
const STALE_AFTER_DAYS = 60;

export type RealHandsetSeed = {
  /** label penuh, sama dengan nama produk di katalog */
  label: string;
  sku: string;
  name: string;
  brand: string;
  cost: number;
  price: number;
  /** jumlah unit awal yang dibuat, sisanya dibuat saat terjual */
  qty: number;
  /** bobot permintaan relatif (jumlah penjualan) */
  demand: number;
  warranty: number;
  stale: boolean;
};

const round500 = (n: number) => Math.round(n / 500) * 500;

function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

/**
 * Katalog handset dari data nyata.
 *
 * - Harga jual diambil dari rata-rata harga jual model itu.
 * - Harga pokok ditaksir dari harga jual TERENDAH model itu, supaya tidak ada
 *   penjualan historis yang jatuh di bawah HPP.
 * - Model yang terakhir laku lebih dari 60 hari sebelum penjualan terakhir
 *   ditandai "stale": tidak dibeli lagi dan menyisakan stok mati.
 */
export function realHandsetSeeds(): RealHandsetSeed[] {
  const refMs = Date.parse(`${REAL_SALES_SUMMARY.to}T00:00:00Z`);
  const usedSku = new Set<string>();

  return REAL_MODELS.map((m) => {
    const price = round500(m.avgPrice);
    let cost = round500(m.minPrice * COST_FACTOR);
    if (cost >= m.minPrice || cost <= 0) cost = Math.max(500, round500(m.minPrice * 0.9));

    const daysSinceLast = Math.round((refMs - Date.parse(`${m.lastSale}T00:00:00Z`)) / DAY_MS);
    const stale = daysSinceLast >= STALE_AFTER_DAYS;

    let sku = `DC-${slug(m.label).slice(0, 24)}`;
    let n = 1;
    while (usedSku.has(sku)) sku = `DC-${slug(m.label).slice(0, 22)}-${n++}`;
    usedSku.add(sku);

    return {
      label: m.label,
      sku,
      name: m.label,
      brand: m.brand,
      cost,
      price,
      /* Model populer punya stok awal lebih banyak; model mati menyisakan
         beberapa unit supaya tergambar sebagai modal yang tertahan. */
      qty: stale ? m.sales + 1 : Math.max(3, Math.ceil(m.sales * 0.35)),
      demand: m.sales,
      warranty: 12,
      stale,
    };
  });
}

/** Penjualan nyata dikelompokkan per tanggal (WIB), sudah urut waktu. */
export const REAL_SALES_BY_DATE: Map<string, RealSale[]> = (() => {
  const map = new Map<string, RealSale[]>();
  for (const s of REAL_SALES) {
    const list = map.get(s.date);
    if (list) list.push(s);
    else map.set(s.date, [s]);
  }
  for (const list of map.values()) list.sort((a, b) => a.iso.localeCompare(b.iso));
  return map;
})();

/** Tanggal pertama dan terakhir yang tertutup data nyata. */
export const REAL_RANGE = {
  from: REAL_SALES_SUMMARY.from,
  to: REAL_SALES_SUMMARY.to,
  sales: REAL_SALES_SUMMARY.totalSales,
  value: REAL_SALES_SUMMARY.totalValue,
  models: REAL_SALES_SUMMARY.modelCount,
  months: REAL_SALES_SUMMARY.monthCount,
} as const;
