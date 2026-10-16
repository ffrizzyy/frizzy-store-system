/* ============================================================================
   Mengubah hasil ekstraksi obrolan (data/sales-export.json) menjadi modul
   TypeScript yang dipakai aplikasi: src/lib/penjualan-nyata.ts

   Yang dikerjakan di sini:
   - Hanya baris JENIS "sale" (penjualan unit) yang masuk ke REAL_SALES, karena
     itulah omzet unit yang sebenarnya. Baris lain (dp, consignment, exchange,
     revision, settlement, accessory) tetap dicatat di REAL_SALES_OTHER agar
     transparan, tetapi tidak dihitung sebagai penjualan unit.
   - Nama model diseragamkan huruf besar/kecil dan ejaan mereknya, karena
     penulisan di obrolan tidak konsisten (redmi/Redmi, oppp/oppo, villaon/Villaon).
   - Cara bayar (method) diteruskan apa adanya; null berarti tidak dicatat di chat.

   Pakai:
     node scripts/extract-sales.mjs "<berkas chat>" data/sales-export.json
     node scripts/build-real-sales.mjs data/sales-export.json src/lib/penjualan-nyata.ts
   ========================================================================= */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const src = process.argv[2] ?? "data/sales-export.json";
const out = process.argv[3] ?? "src/lib/penjualan-nyata.ts";

const payload = JSON.parse(await readFile(src, "utf8"));

if (!Array.isArray(payload.rows)) {
  throw new Error(`Berkas ${src} tidak memuat array "rows". Jalankan scripts/extract-sales.mjs dulu.`);
}

/* Kata pembuka yang bukan bagian nama produk (catatan cara bayar). */
const LEADING_NOISE = /^(cod|po|dp|cash|tf|transfer|kirim|kiriman|tukar tambah|tt)\s+/i;

/* Ejaan merek diseragamkan mengikuti penulisan resmi. */
const BRAND_FIX = [
  [/^realme\b/i, "Realme"],
  [/^redmi\b/i, "Redmi"],
  [/^samsung\b/i, "Samsung"],
  [/^vivo\b/i, "Vivo"],
  [/^oppo\b|^oppp\b|^opp\b/i, "OPPO"],
  [/^villaon\b/i, "Villaon"],
  [/^infinix\b/i, "Infinix"],
  [/^itel\b/i, "Itel"],
  [/^tecno\b|^teco\b/i, "Tecno"],
  [/^poco\b/i, "Poco"],
  [/^advan\b/i, "Advan"],
  [/^xiaomi\b/i, "Xiaomi"],
  [/^apple\b|^iphone\b/i, "Apple"],
  [/^enco\b/i, "Enco"],
  [/^robot\b/i, "Robot"],
];

/* Nama tanpa merek yang muncul di obrolan, dipetakan ke nama lengkapnya. */
const BARE_NAMES = [
  [/^note\s*80\b/i, "Realme Note 80"],
  [/^note\s*15\b/i, "Redmi Note 15"],
  [/^tab\s*advan\s*a10\b/i, "Advan Tab A10"],
  [/^spark\s*go\s*3\b/i, "Tecno Spark Go 3"],
  [/^smart\s*20\b/i, "Infinix Smart 20"],
  [/^a100c/i, "Itel A100C"],
  [/^pova\s*8\b/i, "Tecno Pova 8"],
];

const SMALL = new Set([
  "pro", "plus", "prime", "max", "ultra", "lite", "note", "tab", "go",
  "spark", "buds", "5g", "4g", "se",
]);

function tidyModel(model) {
  let text = model
    .replace(/\s+/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .replace(LEADING_NOISE, "")
    .trim();

  for (const [re, full] of BARE_NAMES) {
    if (re.test(text)) {
      text = text.replace(re, full);
      break;
    }
  }
  if (text === model.trim()) {
    for (const [re, brand] of BRAND_FIX) {
      if (re.test(text)) {
        text = text.replace(re, brand);
        break;
      }
    }
  }
  /* "Redmi A7pro" -> "Redmi A7 pro" */
  text = text.replace(/([A-Za-z])(\d+)(pro|plus|prime|max|ultra|lite)\b/gi, "$1$2 $3");

  return text
    .split(" ")
    .map((word, index) => {
      if (index === 0) return word;
      if (/^\d/.test(word)) return word;
      if (SMALL.has(word.toLowerCase())) return word.toLowerCase();
      if (/^[a-z]/.test(word)) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(" ");
}

/** Jenis barang ditentukan dari kata kunci nama produk. */
function kindOf(label) {
  if (/\btab\b|\bpad\b|\btablet\b/i.test(label)) return "tablet";
  if (/\bwatch\b|\bbuds\b|\bcase\b|\bcharger\b|kabel|anti gores|tempered|softcase|powerbank|earphone/i.test(label)) {
    return "aksesori";
  }
  return "handset";
}

/** Merek = kata pertama nama model yang sudah dirapikan. */
function brandOf(label) {
  const first = label.split(" ")[0] ?? "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

const VLID_METHOD = new Set(["cash", "transfer", "qris", "edc", "ewallet"]);

const units = [];
const others = [];
const skipped = [];

for (const r of payload.rows) {
  const model = tidyModel(r.model);
  const label = r.variant ? `${model} ${r.variant}` : model;
  if (!label) {
    skipped.push(r);
    continue;
  }
  const base = {
    id: r.id,
    date: r.date,
    iso: r.iso,
    hour: r.hour,
    minute: r.minute,
    model,
    variant: r.variant ?? "",
    label,
    price: r.price,
    method: VLID_METHOD.has(r.method) ? r.method : null,
    seller: r.seller,
  };
  if (r.kind === "sale") units.push({ ...base, kind: kindOf(label) });
  else others.push({ ...base, kind: r.kind, note: r.note ?? "" });
}

/* --------------------------------------------------------------- agregasi */

const byModel = new Map();
for (const s of units) {
  const key = s.label.toLowerCase();
  const cur = byModel.get(key) ?? {
    label: s.label,
    model: s.model,
    variant: s.variant,
    kind: s.kind,
    brand: brandOf(s.label),
    sales: 0,
    value: 0,
    prices: [],
    first: s.date,
    last: s.date,
  };
  cur.sales += 1;
  cur.value += s.price;
  cur.prices.push(s.price);
  if (s.date < cur.first) cur.first = s.date;
  if (s.date > cur.last) cur.last = s.date;
  byModel.set(key, cur);
}

const models = [...byModel.values()]
  .map((m) => {
    const sorted = [...m.prices].sort((a, b) => a - b);
    return {
      label: m.label,
      model: m.model,
      variant: m.variant,
      kind: m.kind,
      brand: m.brand,
      sales: m.sales,
      value: m.value,
      minPrice: sorted[0] ?? 0,
      maxPrice: sorted[sorted.length - 1] ?? 0,
      avgPrice: Math.round(m.value / m.sales),
      firstSale: m.first,
      lastSale: m.last,
    };
  })
  .sort((a, b) => b.sales - a.sales);

const byMonth = new Map();
for (const s of units) {
  const key = s.date.slice(0, 7);
  const cur = byMonth.get(key) ?? { month: key, sales: 0, value: 0 };
  cur.sales += 1;
  cur.value += s.price;
  byMonth.set(key, cur);
}

const bySeller = new Map();
for (const s of units) {
  const cur = bySeller.get(s.seller) ?? { number: s.seller, sales: 0, value: 0 };
  cur.sales += 1;
  cur.value += s.price;
  bySeller.set(s.seller, cur);
}

const byMethod = new Map();
for (const s of units) {
  const key = s.method ?? "tidak dicatat";
  byMethod.set(key, (byMethod.get(key) ?? 0) + 1);
}

const byOtherKind = new Map();
for (const s of others) {
  const cur = byOtherKind.get(s.kind) ?? { kind: s.kind, count: 0, value: 0 };
  cur.count += 1;
  cur.value += s.price;
  byOtherKind.set(s.kind, cur);
}

const totalValue = units.reduce((a, s) => a + s.price, 0);
const dates = units.map((s) => s.date).sort();

/* keterangan penjual yang terbaca dari obrolan */
const SELLER_LABEL = {
  "+62 822-4859-1716": "Penjual 1",
  "+62 822-8698-9040": "Penjual 2",
  "+62 822-9974-7185": "Penjual 3",
};

/* ------------------------------------------------------------------- tulis */

const header = `/* ============================================================================
   DATA PENJUALAN NYATA - diekspor dari obrolan WhatsApp "DIVA Sale".

   Berkas ini dihasilkan otomatis, JANGAN diubah manual.
   Sumber   : ${payload.source}
   Dibuat   : ${new Date().toISOString()}
   Isi      : ${units.length} penjualan unit, ${models.length} model, ${byMonth.size} bulan
   Nilai    : Rp ${totalValue.toLocaleString("id-ID")}
   Rentang  : ${dates[0]} sampai ${dates[dates.length - 1]}

   Cara memperbarui: ekspor ulang obrolan WhatsApp, lalu jalankan
     node scripts/extract-sales.mjs "<berkas chat>" data/sales-export.json
     node scripts/build-real-sales.mjs
   ========================================================================= */

export type RealSaleMethod = "cash" | "transfer" | "qris" | "edc" | "ewallet" | null;

export type RealSale = {
  id: string;
  date: string;
  iso: string;
  hour: number;
  minute: number;
  model: string;
  variant: string;
  label: string;
  kind: "handset" | "tablet" | "aksesori";
  price: number;
  method: RealSaleMethod;
  seller: string;
};

export type RealModelSummary = {
  label: string;
  model: string;
  variant: string;
  kind: "handset" | "tablet" | "aksesori";
  brand: string;
  sales: number;
  value: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  firstSale: string;
  lastSale: string;
};

export type RealSaleOther = {
  id: string;
  date: string;
  iso: string;
  hour: number;
  minute: number;
  model: string;
  variant: string;
  label: string;
  price: number;
  method: RealSaleMethod;
  seller: string;
  kind: string;
  note: string;
};

`;

const body = `export const REAL_SALES: RealSale[] = ${JSON.stringify(units, null, 1)};

export const REAL_MODELS: RealModelSummary[] = ${JSON.stringify(models, null, 1)};

export const REAL_MONTHLY = ${JSON.stringify([...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)), null, 1)};

export const REAL_SELLERS = ${JSON.stringify([...bySeller.values()].sort((a, b) => b.sales - a.sales), null, 1)};

export const REAL_SELLER_LABEL: Record<string, string> = ${JSON.stringify(SELLER_LABEL, null, 1)};

export const REAL_METHODS = ${JSON.stringify([...byMethod.entries()].map(([method, count]) => ({ method, count })), null, 1)};

/** Baris yang bukan penjualan unit (dp, titipan, tukar unit, koreksi, dll). */
export const REAL_SALES_OTHER: RealSaleOther[] = ${JSON.stringify(others, null, 1)};

export const REAL_OTHER_KINDS = ${JSON.stringify([...byOtherKind.values()], null, 1)};

export const REAL_SALES_SUMMARY = ${JSON.stringify(
  {
    source: payload.source,
    totalSales: units.length,
    totalValue,
    modelCount: models.length,
    monthCount: byMonth.size,
    from: dates[0],
    to: dates[dates.length - 1],
    otherRows: others.length,
    otherKinds: [...byOtherKind.values()],
    methods: [...byMethod.entries()].map(([method, count]) => ({ method, count })),
  },
  null,
  1
)} as const;
`;

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, header + body);

console.log(`dipakai        : ${units.length} penjualan unit`);
console.log(`baris lain     : ${others.length} (${[...byOtherKind.values()].map((k) => `${k.kind}:${k.count}`).join(", ")})`);
if (skipped.length > 0) console.log(`dilewati       : ${skipped.length}`);
console.log(`model          : ${models.length}`);
console.log(`nilai total    : Rp ${totalValue.toLocaleString("id-ID")}`);
console.log(`rentang        : ${dates[0]} sampai ${dates[dates.length - 1]}`);
console.log(`metode bayar   : ${[...byMethod.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`);
console.log("\ntop 10 model:");
for (const m of models.slice(0, 10)) {
  console.log(
    `  ${m.label.padEnd(24)} ${String(m.sales).padStart(3)} unit | Rp ${m.avgPrice.toLocaleString("id-ID").padStart(10)} rata-rata | Rp ${m.minPrice.toLocaleString("id-ID")} - Rp ${m.maxPrice.toLocaleString("id-ID")}`
  );
}
console.log(`\nditulis: ${out}`);
