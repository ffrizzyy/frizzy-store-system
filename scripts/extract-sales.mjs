/* ============================================================================
   Ekstraksi data penjualan dari ekspor obrolan WhatsApp "DIVA Sale".

   Bentuk pesan di ekspor:
     "3/11/26, 12:34 - +62 822 ...: 2. Redmi A5 4/128 : 1.400.000"
     baris "<Media omitted>" (bukti transfer/foto) lalu baris barang di bawahnya
     satu pesan bisa memuat dua barang sekaligus.

   Yang ditangani:
   - Baris barang yang diikuti catatan: "(transfer)", "(TF BRI)", "( cash : 400.000
     TF. 2.700.000 )", "( sdh Dp 3.000.000 sisa 50.000 )" dan baris rincian
     pembayaran di bawahnya (Cash/Tf/Qris/sisa/dp).
   - Salah tulis umum: "3.400.000h", "1.600,000", harga kurang tiga nol ("2.150").
   - Urutan tanggal dideteksi otomatis (bulan/hari vs hari/bulan).
   - Setiap pesan yang dikirim dua kali berurutan digabung.

   Tiap baris diberi JENIS supaya angka omzet hanya memakai penjualan unit
   sungguhan:
     sale        penjualan unit biasa
     dp          uang muka / pesanan (PO) yang belum lunas
     settlement  pelunasan sisa pembayaran ("bayar sisa ...")
     exchange    tukar unit
     revision    koreksi baris sebelumnya
     consignment unit titipan ("stok dr.hp") — yang dicatat hanya bagian konter
     accessory   aksesori (anti gores, buds, dll.)

   Pakai:
     node scripts/extract-sales.mjs "<berkas chat>" data/sales-export.json
   ========================================================================= */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const src = process.argv[2];
const outFile = process.argv[3] ?? "data/sales-export.json";
if (!src) {
  console.error("sebutkan berkas ekspor obrolan WhatsApp");
  process.exit(1);
}

const raw = await readFile(src, "utf8");
const lines = raw.split(/\r?\n/);

const MSG = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2})[.:](\d{2})(?::\d{2})?\s+-\s+(\S.*)$/;
const ENTRY =
  /^\s*(?<flag>\*{0,2})\s*(?:(?<seq>\d{1,4})\s*[.)]\s*)?(?<name>[^:]+?)\s*:\s*(?<price>\d[\d.,]*)\s*(?<tail>.*)$/;

const PAYMENT_WORD =
  /^(cash|tf|transfer|trf|qris|qr|debit|edc|tdp|dp|sisa|sudahdp|sudah dp|bayar|bri|bni|mandiri|bca|bank|total|kembalian|cashback|diskon|potongan|harga)$/i;

const NOTE_HINT =
  /(cash|tunai|\btf\b|transfer|trf|qris|debit|edc|bri|bni|mandiri|bca|bank|kartu|sisa|\bdp\b|sudah\s*dp|tdp|lunas|bayar|cashback|stok\s*dr|titipan)/i;

/* ------------------------------------------- deteksi urutan tanggal (hari/bulan) */

const stamps = [];
for (const line of lines) {
  const m = line.match(MSG);
  if (m) stamps.push({ a: Number(m[1]), b: Number(m[2]), y: Number(m[3]) });
}

let dayFirst = false;
{
  const aOver12 = stamps.filter((s) => s.a > 12).length;
  const bOver12 = stamps.filter((s) => s.b > 12).length;
  if (aOver12 > 0 && bOver12 === 0) dayFirst = true;
  else if (bOver12 > 0 && aOver12 === 0) dayFirst = false;
  else {
    const badFor = (first) => {
      let bad = 0;
      for (const s of stamps) {
        const day = first ? s.a : s.b;
        const month = first ? s.b : s.a;
        const year = s.y < 100 ? 2000 + s.y : s.y;
        if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) bad += 1;
        if (year < 2026) bad += 1;
      }
      return bad;
    };
    dayFirst = badFor(true) < badFor(false);
  }
}
console.log(`urutan tanggal dipakai  : ${dayFirst ? "hari/bulan" : "bulan/hari"}`);

function toIso(a, b, year, hour, minute, firstIsDay) {
  const day = firstIsDay ? a : b;
  const month = firstIsDay ? b : a;
  const y = year < 100 ? 2000 + year : year;
  const hh = Number(hour);
  const mm = Number(minute);
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && hh <= 23 && mm <= 59)) return null;
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const back = new Date(t + 7 * 3_600_000);
  if (back.getUTCDate() !== day || back.getUTCMonth() + 1 !== month || back.getUTCFullYear() !== y) return null;
  return new Date(t).toISOString();
}

function parsePrice(text) {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

function normalizeName(text) {
  return text
    .replace(/\u2060/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–•*]+/, "")
    .replace(/^(\d{1,4})\s*[.)]?\s+/, "")
    .replace(/[\s*]+$/, "")
    .trim();
}

/** Tebak cara bayar dari nama + catatan. */
function methodOf(text) {
  const t = text.toLowerCase();
  if (/qris|\bqr\b/.test(t)) return "qris";
  if (/debit|edc|kartu/.test(t)) return "edc";
  if (/tf|trf|transfer|bri|bni|mandiri|bca|bank/.test(t)) return "transfer";
  if (/cash|tunai/.test(t)) return "cash";
  return null;
}

/** Jenis baris. */
function kindOf(name, note, combined) {
  const n = name.toLowerCase().trim();
  /* Gabungan nama + catatan dalam huruf kecil: penulisan di obrolan campur
     besar-kecil ("stok DR. Hp", "Stok dr.hp"), jadi pencocokan harus
     case-insensitive. */
  const c = `${n} ${note.toLowerCase()}`;
  if (/^(bayar sisa|pelunasan|sisa pembayaran)/.test(n)) return "settlement";
  if (/^(ganti unit|tukar unit|tt unit|tukar tambah)/.test(n)) return "exchange";
  if (/^revisi/.test(n)) return "revision";
  if (/stok\s*dr|stok\s*titipan|titipan|stok\s*asha/.test(c)) return "consignment";
  if (/anti gores|tempered|softcase|hardcase|\bbuds\b|enco|earphone|headset|charger|kabel|powerbank|voucher|pulsa/.test(n)) {
    return "accessory";
  }
  const isPo = /^(?:\*\s*)?(?:po|dp|dp\s+po)\b/.test(n);
  if (isPo) return /lunas/.test(c) ? "sale" : "dp";
  return "sale";
}

/** Baris yang tampak sebagai rincian pembayaran untuk baris barang sebelumnya. */
function looksLikeNote(line) {
  const t = line.trim();
  if (t.length > 120) return false;
  if (/^\(/.test(t)) return true;
  if (!NOTE_HINT.test(t)) return false;
  return /\d/.test(t) || t.length < 60;
}

/* ------------------------------------------------------------------ parsing */

const skipped = [];
const abnormal = [];

/** [iso, sender, body, dedupeKey] */
const messages = [];
{
  let cur = null;
  for (const line of lines) {
    const m = line.match(MSG);
    if (m) {
      const [, a, b, year, hour, minute, rest] = m;
      const sep = rest.indexOf(": ");
      const sender = sep >= 0 ? rest.slice(0, sep) : "";
      const body = sep >= 0 ? rest.slice(sep + 2) : rest;
      const iso = toIso(Number(a), Number(b), Number(year), hour, minute, dayFirst);
      if (!iso) {
        skipped.push(line.slice(0, 90));
        cur = null;
        continue;
      }
      cur = { iso, sender, lines: [body], key: `${iso}|${sender}|${body}` };
      messages.push(cur);
    } else if (cur) {
      cur.lines.push(line);
      cur.key += `\n${line}`;
    }
  }
}

/* Ekspor ini menulis setiap pesan dua kali berurutan: buang yang kembar. */
const unique = [];
for (const m of messages) {
  const prev = unique[unique.length - 1];
  if (prev && prev.key === m.key) continue;
  unique.push(m);
}

const entries = [];
for (const msg of unique) {
  let cur = null;
  const flush = () => {
    if (!cur) return;
    entries.push(cur);
    cur = null;
  };
  for (const line of msg.lines) {
    const text = line.trim();
    if (!text || text === "<Media omitted>") continue;

    const m = text.match(ENTRY);
    const rawName = m?.groups?.name ?? "";
    const name = normalizeName(rawName);
    const paymentWord = PAYMENT_WORD.test(name.replace(/\s+/g, ""));
    const usable =
      m && name.replace(/[^a-zA-Z]/g, "").length >= 2 && !paymentWord && !/^https?:|wa\.me/i.test(name);

    if (usable) {
      flush();
      const priceRaw = m.groups.price;
      const tailRaw = (m.groups.tail ?? "").trim();
      cur = {
        msgIso: msg.iso,
        seller: msg.sender,
        flag: (m.groups.flag ?? "").replace(/\s+/g, ""),
        seq: m.groups.seq ? Number(m.groups.seq) : null,
        name,
        priceRaw,
        tail: tailRaw,
        noteLines: [],
      };
      continue;
    }
    if (cur && looksLikeNote(text)) cur.noteLines.push(text);
  }
  flush();
}

/* ----------------------------------------------------- normalisasi + klasifikasi */

let autoCorrected = 0;

const records = entries.map((e) => {
  let price = parsePrice(e.priceRaw);
  const note = [e.tail, ...e.noteLines].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const combined = `${e.name} ${note}`;
  const kind = kindOf(e.name, note, combined);

  let corrected = false;
  /* "3.400.000h" / "1.600,000" sudah benar; "2.150" kurang tiga nol. */
  if (kind === "sale" && price >= 1_000 && price < 500_000) {
    price *= 1000;
    corrected = true;
    autoCorrected += 1;
  }
  if (!Number.isFinite(price) || price <= 0) abnormal.push(`harga 0: ${e.name} <- ${e.priceRaw}`);

  return {
    seq: e.seq,
    name: e.name,
    raw: `${e.name} : ${e.priceRaw}${note ? ` ${note}` : ""}`.trim(),
    price,
    priceRaw: e.priceRaw,
    kind,
    method: methodOf(combined),
    note,
    flag: e.flag,
    corrected,
    iso: e.msgIso,
    seller: e.seller.replace(/\s+/g, " ").trim(),
  };
});

/* -------------------------------------------------- gabung penulisan dua kali */

const merged = [];
for (const rec of records) {
  const prev = merged[merged.length - 1];
  const same =
    prev &&
    prev.seq === rec.seq &&
    prev.name.toLowerCase() === rec.name.toLowerCase() &&
    prev.price === rec.price &&
    Math.abs(Date.parse(prev.iso) - Date.parse(rec.iso)) < 20 * 60 * 1000;
  if (same) {
    prev.copies += 1;
    if (rec.note && !prev.note.includes(rec.note)) prev.note = `${prev.note} ${rec.note}`.trim();
    continue;
  }
  merged.push({ ...rec, copies: 1 });
}

/* ---------------------------------------------------------------- normalisasi */

function splitModelVariant(text) {
  const m = text.match(/^(.*?)[\s(]*(\d{1,3}\s*\/\s*\d{1,4})\s*\)?\s*$/);
  if (m && m[1]) return { model: m[1].replace(/[\s(+]+$/, "").trim(), variant: m[2].replace(/\s+/g, "") };
  return { model: text.trim(), variant: "" };
}

const sales = merged.map((r, i) => {
  const { model, variant } = splitModelVariant(r.name);
  const d = new Date(Date.parse(r.iso) + 7 * 3_600_000);
  return {
    id: `wa_${String(i + 1).padStart(4, "0")}`,
    seq: r.seq,
    kind: r.kind,
    raw: r.name,
    model,
    variant,
    label: variant ? `${model} ${variant}` : model,
    price: r.price,
    priceRaw: r.priceRaw,
    priceCorrected: r.corrected,
    method: r.method,
    note: r.note,
    flag: r.flag,
    iso: r.iso,
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    seller: r.seller,
    copies: r.copies,
  };
});

/* ------------------------------------------------------------------ ringkasan */

const units = sales.filter((s) => s.kind === "sale");
const total = units.reduce((a, s) => a + s.price, 0);
const sorted = [...units].sort((a, b) => a.iso.localeCompare(b.iso));

const byKind = new Map();
const byMonth = new Map();
const byModel = new Map();
const bySeller = new Map();
const byMethod = new Map();
for (const s of sales) {
  const k = byKind.get(s.kind) ?? { count: 0, value: 0 };
  k.count += 1;
  k.value += s.price;
  byKind.set(s.kind, k);
}
for (const s of units) {
  const month = s.date.slice(0, 7);
  const m = byMonth.get(month) ?? { count: 0, value: 0 };
  m.count += 1;
  m.value += s.price;
  byMonth.set(month, m);

  const key = s.label.toLowerCase();
  const p = byModel.get(key) ?? { label: s.label, count: 0, value: 0 };
  p.count += 1;
  p.value += s.price;
  byModel.set(key, p);

  const sl = bySeller.get(s.seller) ?? { count: 0, value: 0 };
  sl.count += 1;
  sl.value += s.price;
  bySeller.set(s.seller, sl);

  const mm = byMethod.get(s.method ?? "tidak dicatat") ?? 0;
  byMethod.set(s.method ?? "tidak dicatat", mm + 1);
}

console.log(`pesan unik              : ${unique.length} dari ${messages.length}`);
console.log(`baris barang terbaca    : ${records.length}`);
console.log(`setelah digabung ganda  : ${sales.length} baris`);
console.log(`  - penjualan unit      : ${units.length}`);
for (const [k, v] of [...byKind].sort((a, b) => b[1].count - a[1].count)) {
  if (k === "sale") continue;
  console.log(`  - ${k.padEnd(18)} : ${String(v.count).padStart(3)}  (Rp ${v.value.toLocaleString("id-ID")})`);
}
console.log(`harga dikoreksi         : ${autoCorrected}`);
console.log(`total omzet unit        : Rp ${total.toLocaleString("id-ID")}`);
console.log(`model unik              : ${new Set(units.map((s) => s.label.toLowerCase())).size}`);
console.log(`rentang tanggal         : ${sorted[0]?.date} sampai ${sorted[sorted.length - 1]?.date}`);
console.log(`baris timestamp dilewati: ${skipped.length}`);

console.log("\nmetode bayar tercatat:");
for (const [k, v] of [...byMethod].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`);

console.log("\nper bulan:");
for (const [k, v] of [...byMonth].sort()) {
  console.log(`  ${k}: ${String(v.count).padStart(3)} unit, Rp ${v.value.toLocaleString("id-ID").padStart(15)}`);
}

console.log("\ntop 15 model:");
for (const m of [...byModel.values()].sort((a, b) => b.count - a.count).slice(0, 15)) {
  console.log(
    `  ${m.label.padEnd(30)} ${String(m.count).padStart(3)} unit, rata-rata Rp ${Math.round(m.value / m.count).toLocaleString("id-ID")}`
  );
}

console.log("\npenjual:");
for (const [k, v] of [...bySeller].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${(k || "(tanpa nomor)").padEnd(24)} ${String(v.count).padStart(3)} unit, Rp ${v.value.toLocaleString("id-ID")}`);
}

if (abnormal.length > 0) {
  console.log("\nharga tidak wajar:");
  for (const a of abnormal.slice(0, 10)) console.log(`  ${a}`);
}

console.log("\ncontoh 8 penjualan berurutan menurut waktu:");
for (const s of sorted.slice(0, 8)) {
  console.log(
    `  ${s.date} ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}  ${s.label.padEnd(24)} Rp ${s.price.toLocaleString("id-ID")}${s.corrected ? " (harga dikoreksi)" : ""}`
  );
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  JSON.stringify(
    {
      source: path.basename(src),
      extractedAt: new Date().toISOString(),
      dateOrder: dayFirst ? "day-first" : "month-first",
      totalRows: sales.length,
      totalSales: units.length,
      totalValue: total,
      autoCorrected,
      range: { from: sorted[0]?.date, to: sorted[sorted.length - 1]?.date },
      kinds: [...byKind.entries()].map(([kind, v]) => ({ kind, ...v })),
      methods: [...byMethod.entries()].map(([method, count]) => ({ method, count })),
      sellers: [...bySeller.entries()].map(([number, v]) => ({ number, ...v })),
      models: [...byModel.values()].map((m) => ({
        label: m.label,
        count: m.count,
        totalValue: m.value,
        avgPrice: Math.round(m.value / m.count),
      })),
      monthly: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
      rows: sales,
    },
    null,
    1
  )
);
console.log(`\ndisimpan: ${outFile}`);
