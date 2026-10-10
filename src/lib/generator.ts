/* ============================================================================
   Generator data seed Frizzy, deterministik (seeded RNG).
   Menghasilkan 180 hari operasional konter Diva Cell dengan skenario
   "cash crisis" yang disengaja: prive pemilik terlalu besar, stok mati
   menumpuk, dan rasio replenishment di bawah 1 (stok dipakai untuk
   membiayai beban non-stok).
   ========================================================================= */

import { AS_OF, HISTORY_DAYS, SHOP } from "./constants";
import type {
  Account,
  AuditEntry,
  CashTransaction,
  Customer,
  Dataset,
  Device,
  Expense,
  ID,
  InventoryUnit,
  OpnameLine,
  OpnameSession,
  Payment,
  PaymentMethod,
  Product,
  ProductKind,
  PurchaseOrder,
  ReceiptDelivery,
  Receivable,
  RecoveryTask,
  ReviewRequest,
  Sale,
  SaleItem,
  Shift,
  ShopProfile,
  StockMovement,
  Supplier,
  User,
} from "./types";

/* ------------------------------------------------------------------ random */

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 0x1_0000_0000;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    const idx = this.int(0, items.length - 1);
    return items[idx] as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** pembulatan ke kelipatan 500 rupiah, seperti harga di konter */
  round500(n: number): number {
    return Math.round(n / 500) * 500;
  }
  /** bilangan acak normal (Box-Muller sederhana) */
  gauss(mean: number, sd: number): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

const DAY_MS = 86_400_000;
let counter = 0;
const uid = (prefix: string): ID => `${prefix}_${(++counter).toString(36).padStart(4, "0")}`;

/* ------------------------------------------------------------------- katalog */

type HandsetSeed = {
  sku: string;
  name: string;
  brand: string;
  cost: number;
  price: number;
  qty: number;
  /** true = model yang sengaja dibuat menua (calon stok mati) */
  stale?: boolean;
  warranty: number;
  /** bobot minat beli relatif */
  demand: number;
};

const HANDSETS: HandsetSeed[] = [
  { sku: "SAM-A055-128", name: "Samsung Galaxy A05s 6/128", brand: "Samsung", cost: 1_720_000, price: 1_870_000, qty: 6, warranty: 12, demand: 8 },
  { sku: "SAM-A155-256", name: "Samsung Galaxy A15 8/256", brand: "Samsung", cost: 2_480_000, price: 2_690_000, qty: 5, warranty: 12, demand: 7 },
  { sku: "SAM-A255-256", name: "Samsung Galaxy A25 5G 8/256", brand: "Samsung", cost: 3_320_000, price: 3_590_000, qty: 4, warranty: 12, demand: 5 },
  { sku: "SAM-A356-256", name: "Samsung Galaxy A35 5G 8/256", brand: "Samsung", cost: 4_450_000, price: 4_790_000, qty: 3, warranty: 12, demand: 3 },
  { sku: "SAM-S921-256", name: "Samsung Galaxy S23 8/256", brand: "Samsung", cost: 7_900_000, price: 8_650_000, qty: 2, warranty: 12, demand: 1 },
  { sku: "XIA-R12-256", name: "Xiaomi Redmi 12 8/256", brand: "Xiaomi", cost: 1_580_000, price: 1_730_000, qty: 7, warranty: 12, demand: 9 },
  { sku: "XIA-N13-256", name: "Xiaomi Redmi Note 13 8/256", brand: "Xiaomi", cost: 2_180_000, price: 2_380_000, qty: 6, warranty: 12, demand: 8 },
  { sku: "XIA-N13P-256", name: "Xiaomi Redmi Note 13 Pro 8/256", brand: "Xiaomi", cost: 3_150_000, price: 3_420_000, qty: 4, warranty: 12, demand: 5 },
  { sku: "XIA-14-256", name: "Xiaomi 14 12/256", brand: "Xiaomi", cost: 9_800_000, price: 10_600_000, qty: 2, warranty: 12, demand: 1 },
  { sku: "OPP-A18-128", name: "OPPO A18 4/128", brand: "OPPO", cost: 1_380_000, price: 1_520_000, qty: 6, warranty: 12, demand: 7 },
  { sku: "OPP-A78-256", name: "OPPO A78 8/256", brand: "OPPO", cost: 2_720_000, price: 2_950_000, qty: 5, warranty: 12, demand: 6 },
  { sku: "OPP-R11-256", name: "OPPO Reno 11 5G 8/256", brand: "OPPO", cost: 5_150_000, price: 5_550_000, qty: 3, warranty: 12, demand: 2 },
  { sku: "VIV-Y17-128", name: "Vivo Y17s 6/128", brand: "Vivo", cost: 1_520_000, price: 1_670_000, qty: 5, warranty: 12, demand: 6 },
  { sku: "VIV-Y28-256", name: "Vivo Y28 8/256", brand: "Vivo", cost: 2_150_000, price: 2_350_000, qty: 5, warranty: 12, demand: 6 },
  { sku: "VIV-V29-256", name: "Vivo V29e 5G 8/256", brand: "Vivo", cost: 4_150_000, price: 4_480_000, qty: 3, warranty: 12, demand: 3 },
  { sku: "REL-C55-128", name: "realme C55 6/128", brand: "realme", cost: 1_620_000, price: 1_770_000, qty: 5, warranty: 12, demand: 6 },
  { sku: "REL-11P-256", name: "realme 11 Pro 5G 8/256", brand: "realme", cost: 3_850_000, price: 4_150_000, qty: 3, warranty: 12, demand: 3 },
  { sku: "INF-HOT40-256", name: "Infinix Hot 40i 8/256", brand: "Infinix", cost: 1_440_000, price: 1_580_000, qty: 5, warranty: 12, demand: 7 },
  { sku: "INF-NOTE40-256", name: "Infinix Note 40 8/256", brand: "Infinix", cost: 2_520_000, price: 2_750_000, qty: 4, warranty: 12, demand: 4 },
  { sku: "TEC-CAM30-256", name: "Tecno Camon 30 8/256", brand: "Tecno", cost: 2_950_000, price: 3_220_000, qty: 3, warranty: 12, demand: 3 },
  { sku: "IPO-15-128", name: "iPhone 13 128GB Ex", brand: "Apple", cost: 6_450_000, price: 7_150_000, qty: 7, warranty: 6, stale: true, demand: 15 },
  { sku: "IPO-12-64", name: "iPhone 12 64GB Ex", brand: "Apple", cost: 5_100_000, price: 5_700_000, qty: 7, warranty: 6, stale: true, demand: 15 },
  { sku: "SAM-A125-128", name: "Samsung Galaxy A12 4/128 (lama)", brand: "Samsung", cost: 1_250_000, price: 1_390_000, qty: 12, warranty: 12, stale: true, demand: 15 },
  { sku: "OPP-A54-128", name: "OPPO A54 4/128 (lama)", brand: "OPPO", cost: 1_450_000, price: 1_600_000, qty: 10, warranty: 12, stale: true, demand: 15 },
  { sku: "XIA-9A-64", name: "Xiaomi Redmi 9A 4/64 (lama)", brand: "Xiaomi", cost: 780_000, price: 880_000, qty: 16, warranty: 12, stale: true, demand: 15 },
];

type StockSeed = {
  sku: string;
  name: string;
  brand: string;
  kind: ProductKind;
  cost: number;
  price: number;
  qty: number;
  /** bobot minat beli relatif */
  demand: number;
};

const STOCK_ITEMS: StockSeed[] = [
  { sku: "ACC-CASE-UNI", name: "Softcase universal bening", brand: "Generic", kind: "accessory", cost: 8_000, price: 25_000, qty: 96, demand: 30 },
  { sku: "ACC-TG-UNI", name: "Tempered glass universal", brand: "Generic", kind: "accessory", cost: 6_000, price: 20_000, qty: 120, demand: 34 },
  { sku: "ACC-CHG-25W", name: "Charger fast charging 25W", brand: "Robot", kind: "accessory", cost: 32_000, price: 65_000, qty: 34, demand: 14 },
  { sku: "ACC-CBL-TC", name: "Kabel data Type-C 1m", brand: "Robot", kind: "accessory", cost: 9_000, price: 25_000, qty: 64, demand: 22 },
  { sku: "ACC-PB-10K", name: "Powerbank 10.000 mAh", brand: "Robot", kind: "accessory", cost: 95_000, price: 165_000, qty: 18, demand: 6 },
  { sku: "ACC-TWS-A2", name: "TWS A2 Pro", brand: "Robot", kind: "accessory", cost: 85_000, price: 165_000, qty: 16, demand: 7 },
  { sku: "ACC-EAR-BAS", name: "Earphone jack 3.5mm", brand: "Generic", kind: "accessory", cost: 12_000, price: 30_000, qty: 40, demand: 12 },
  { sku: "ACC-OTG-TC", name: "OTG Type-C", brand: "Generic", kind: "accessory", cost: 10_000, price: 28_000, qty: 22, demand: 8 },
  { sku: "ACC-STAND", name: "Stand HP lipat", brand: "Generic", kind: "accessory", cost: 11_000, price: 32_000, qty: 15, demand: 6 },
  { sku: "ACC-MC-32", name: "Memory card 32GB", brand: "V-GeN", kind: "accessory", cost: 42_000, price: 68_000, qty: 20, demand: 9 },
  { sku: "ACC-MC-64", name: "Memory card 64GB", brand: "V-GeN", kind: "accessory", cost: 68_000, price: 105_000, qty: 12, demand: 6 },
  { sku: "ACC-SW-BU", name: "Smartwatch B-Ultra", brand: "Generic", kind: "accessory", cost: 145_000, price: 275_000, qty: 9, demand: 4 },
  { sku: "ACC-RING", name: "Ring holder besi", brand: "Generic", kind: "accessory", cost: 6_000, price: 20_000, qty: 48, demand: 16 },
  { sku: "ACC-CAM-LENS", name: "Lensa kamera HP clip", brand: "Generic", kind: "accessory", cost: 28_000, price: 65_000, qty: 11, demand: 4 },
  { sku: "VCR-TSEL-10", name: "Voucher Telkomsel 10.000", brand: "Telkomsel", kind: "voucher", cost: 10_300, price: 11_000, qty: 80, demand: 26 },
  { sku: "VCR-TSEL-25", name: "Voucher Telkomsel 25.000", brand: "Telkomsel", kind: "voucher", cost: 25_250, price: 26_500, qty: 52, demand: 18 },
  { sku: "VCR-TSEL-50", name: "Voucher Telkomsel 50.000", brand: "Telkomsel", kind: "voucher", cost: 50_000, price: 52_000, qty: 34, demand: 10 },
  { sku: "VCR-IND-25", name: "Voucher Indosat 25.000", brand: "Indosat", kind: "voucher", cost: 25_000, price: 26_000, qty: 30, demand: 9 },
  { sku: "VCR-XL-25", name: "Voucher XL 25.000", brand: "XL", kind: "voucher", cost: 24_800, price: 26_000, qty: 24, demand: 8 },
  { sku: "VCR-TRI-10", name: "Voucher Tri 10.000", brand: "Tri", kind: "voucher", cost: 10_200, price: 11_000, qty: 26, demand: 9 },
  { sku: "VCR-DATA-5", name: "Paket data 5GB (transfer)", brand: "Telkomsel", kind: "voucher", cost: 42_000, price: 48_000, qty: 18, demand: 7 },
  { sku: "SRV-TG-PAS", name: "Jasa pasang tempered glass", brand: "Diva Cell", kind: "service", cost: 2_000, price: 15_000, qty: 0, demand: 14 },
  { sku: "SRV-TRANSFER", name: "Jasa transfer data HP", brand: "Diva Cell", kind: "service", cost: 0, price: 25_000, qty: 0, demand: 8 },
  { sku: "SRV-SERVIS", name: "Jasa servis ringan", brand: "Diva Cell", kind: "service", cost: 15_000, price: 75_000, qty: 0, demand: 6 },
  { sku: "SRV-KLAIM", name: "Bantuan klaim garansi", brand: "Diva Cell", kind: "service", cost: 0, price: 35_000, qty: 0, demand: 4 },
];

const SUPPLIERS: Omit<Supplier, "id">[] = [
  { name: "PT Sinar Handphone Jaya", contact: "0812-7711-2200", paymentTermsDays: 14, leadTimeDays: 3, note: "Distributor resmi Samsung & Xiaomi" },
  { name: "CV Mitra Ponsel Palembang", contact: "0813-5544-8899", paymentTermsDays: 7, leadTimeDays: 2, note: "Harga bersaing, stok cepat habis" },
  { name: "Toko Grosir Aksesori 88", contact: "0857-3311-7788", paymentTermsDays: 0, leadTimeDays: 1, note: "Aksesori, bayar tunai" },
  { name: "Server Pulsa Nusantara", contact: "0811-2233-4455", paymentTermsDays: 3, leadTimeDays: 1, note: "Deposit pulsa, margin tipis" },
  { name: "PT Vivo Indonesia Cab. Sumbagsel", contact: "0711-556677", paymentTermsDays: 21, leadTimeDays: 5, note: "Termin panjang, syarat ketat" },
];

const FIRST_NAMES = [
  "Andi", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hendra", "Indah", "Joko",
  "Kartika", "Lukman", "Maya", "Nanda", "Oki", "Putri", "Rahmat", "Sari", "Tono", "Umi",
  "Vina", "Wahyu", "Yuni", "Zaki", "Bayu", "Dimas", "Fitri", "Gunawan", "Hesti", "Iqbal",
];
const LAST_NAMES = [
  "Pratama", "Saputra", "Wijaya", "Lestari", "Hidayat", "Nugroho", "Kusuma", "Ramadhan",
  "Anggraini", "Setiawan", "Permata", "Firdaus", "Halim", "Yuliana", "Maulana",
];

const DISCOUNT_REASONS = [
  "Pelanggan langganan",
  "Tukar tambah",
  "Beli aksesori sekaligus",
  "Promo akhir bulan",
  "Harga pasaran toko sebelah",
  "Nego lama",
  "Beli 2 unit",
];

/* ------------------------------------------------------------------ util kecil */

const CATEGORY_BY_KIND: Record<ProductKind, string> = {
  handset: "Handset",
  accessory: "Aksesori",
  voucher: "Voucher & Pulsa",
  service: "Jasa",
  secondhand: "Second",
};

function luhnCheckDigit(digits: string): string {
  let sum = 0;
  let alt = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
}

function makeImei(rng: Rng): string {
  const tac = `3512${rng.int(100000, 999999)}`;
  const serial = String(rng.int(100000, 999999));
  const body = `${tac}${serial}`.slice(0, 14).padEnd(14, "0");
  return body + luhnCheckDigit(body);
}

/** Awal hari menurut WIB (UTC+7), dikembalikan sebagai ISO UTC. */
function startOfJakartaDay(iso: string): number {
  const t = Date.parse(iso) + 7 * 3_600_000;
  return Math.floor(t / DAY_MS) * DAY_MS - 7 * 3_600_000;
}

function pad(n: number, len = 3): string {
  return String(n).padStart(len, "0");
}

function receiptNumber(seq: number, iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  return `DC-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}-${pad(seq, 3)}`;
}

/** Pilih item dengan bobot. */
function pickWeighted<T extends { demand: number }>(rng: Rng, items: readonly T[]): T {
  let total = 0;
  for (const it of items) total += it.demand;
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= it.demand;
    if (roll <= 0) return it;
  }
  return items[items.length - 1] as T;
}

function sumAccountsOpening(accounts: readonly Account[]): number {
  let total = 0;
  for (const a of accounts) total += a.openingBalance;
  return total;
}

/* ------------------------------------------------------------------ generator */

export type GenerateOptions = {
  seed?: number;
  days?: number;
  asOf?: string;
};

export function generateDataset(opts: GenerateOptions = {}): Dataset {
  counter = 0;
  const seed = opts.seed ?? 20260215;
  const days = opts.days ?? HISTORY_DAYS;
  const asOf = opts.asOf ?? AS_OF;
  const rng = new Rng(seed);

  const profile: ShopProfile = {
    name: SHOP.name,
    tagline: SHOP.tagline,
    address: SHOP.address,
    phone: SHOP.phone,
    hours: SHOP.hours,
    timezone: SHOP.timezone,
    placeId: SHOP.placeId,
    reviewCooldownDays: SHOP.reviewCooldownDays,
    minMarginPct: SHOP.minMarginPct,
    staffDiscountLimitPct: SHOP.staffDiscountLimitPct,
    ownerDrawMonthlyCap: SHOP.ownerDrawMonthlyCap,
    safetyCashFloor: SHOP.safetyCashFloor,
    varianceThreshold: SHOP.varianceThreshold,
    taxEnabled: SHOP.taxEnabled,
    taxPct: SHOP.taxPct,
  };

  /* ------------------------------------------------------------ pengguna */

  const owner: User = {
    id: uid("usr"),
    name: "Farrel (Pemilik)",
    email: "owner@divacell.id",
    role: "owner",
    pin: SHOP.ownerPin,
    isActive: true,
  };
  const staffList: User[] = [
    { id: uid("usr"), name: "Rizky Saputra", email: "rizky@divacell.id", role: "staff", pin: SHOP.staffPin, isActive: true },
    { id: uid("usr"), name: "Nabila Putri", email: "nabila@divacell.id", role: "staff", pin: "1357", isActive: true },
    { id: uid("usr"), name: "Dimas Nugroho", email: "dimas@divacell.id", role: "staff", pin: "4321", isActive: true },
  ];
  const users = [owner, ...staffList];

  const devices: Device[] = [
    { id: uid("dev"), userId: owner.id, label: "Xiaomi 13T Pemilik", lastSeenAt: asOf, trusted: true, city: "Palembang" },
    { id: uid("dev"), userId: staffList[0]!.id, label: "Tablet kasir Samsung A9", lastSeenAt: asOf, trusted: true, city: "Palembang" },
    { id: uid("dev"), userId: staffList[1]!.id, label: "HP kasir kedua (Redmi 10)", lastSeenAt: asOf, trusted: true, city: "Palembang" },
    { id: uid("dev"), userId: staffList[2]!.id, label: "HP cadangan (Oppo A5s)", lastSeenAt: asOf, trusted: false, city: "Palembang" },
  ];

  const suppliers: Supplier[] = SUPPLIERS.map((s) => ({ ...s, id: uid("sup") }));

  const categories = (Object.keys(CATEGORY_BY_KIND) as ProductKind[]).map((kind) => ({
    id: `cat_${kind}`,
    name: CATEGORY_BY_KIND[kind],
    kind,
  }));

  /* ------------------------------------------------------------- produk */

  const products: Product[] = [];
  const movements: StockMovement[] = [];
  const units: InventoryUnit[] = [];
  const qtyByProduct = new Map<ID, number>();
  const demandByProduct = new Map<ID, number>();
  const staleSkus = new Set(HANDSETS.filter((h) => h.stale).map((h) => h.sku));
  const phoneSuppliers = [suppliers[0]!, suppliers[1]!, suppliers[4]!];
  const accSupplier = suppliers[2]!;
  const voucherSupplier = suppliers[3]!;

  const windowStart = new Date(startOfJakartaDay(asOf) - (days - 1) * DAY_MS).toISOString();

  for (const h of HANDSETS) {
    const supplier = phoneSuppliers[products.length % phoneSuppliers.length]!;
    const p: Product = {
      id: uid("prd"),
      sku: h.sku,
      name: h.name,
      brand: h.brand,
      kind: "handset",
      categoryId: "cat_handset",
      barcode: `88${pad(products.length + 1, 9)}`,
      isSerialized: true,
      cost: h.cost,
      price: h.price,
      minPrice: rng.round500(h.cost * 1.035),
      minMarginPct: profile.minMarginPct,
      reorderPoint: 1,
      reorderQty: 3,
      supplierId: supplier.id,
      isActive: true,
      createdAt: windowStart,
      tags: { abc: "A", xyz: "X" },
    };
    products.push(p);
    qtyByProduct.set(p.id, h.qty);
    demandByProduct.set(p.id, h.demand);
    const openAt = new Date(Date.parse(windowStart) + rng.int(0, 12) * 3_600_000).toISOString();
    for (let i = 0; i < h.qty; i++) {
      const unit: InventoryUnit = {
        id: uid("unt"),
        productId: p.id,
        imei1: makeImei(rng),
        imei2: rng.chance(0.7) ? makeImei(rng) : null,
        serial: null,
        cost: h.cost,
        status: "in_stock",
        warrantyMonths: h.warranty,
        receivedAt: openAt,
        soldAt: null,
      };
      units.push(unit);
      movements.push({
        id: uid("mov"),
        productId: p.id,
        unitId: unit.id,
        qtyDelta: 1,
        reason: "purchase",
        refType: "po",
        refId: null,
        unitCost: h.cost,
        note: "Stok awal (opening balance)",
        occurredAt: openAt,
        actorId: owner.id,
      });
    }
  }

  for (const s of STOCK_ITEMS) {
    const supplier = s.kind === "voucher" ? voucherSupplier : s.kind === "service" ? null : accSupplier;
    const p: Product = {
      id: uid("prd"),
      sku: s.sku,
      name: s.name,
      brand: s.brand,
      kind: s.kind,
      categoryId: `cat_${s.kind}`,
      barcode: `88${pad(products.length + 1, 9)}`,
      isSerialized: false,
      cost: s.cost,
      price: s.price,
      minPrice: rng.round500(s.cost * 1.02),
      minMarginPct: s.kind === "service" ? 40 : profile.minMarginPct,
      reorderPoint: s.kind === "service" ? 0 : Math.max(3, Math.round(s.qty * 0.12)),
      reorderQty: s.kind === "service" ? 0 : Math.max(6, Math.round(s.qty * 0.25)),
      supplierId: supplier?.id ?? null,
      isActive: true,
      createdAt: windowStart,
      tags: { abc: s.kind === "voucher" ? "A" : "B", xyz: "X" },
    };
    products.push(p);
    qtyByProduct.set(p.id, s.qty);
    demandByProduct.set(p.id, s.demand);
    if (s.qty > 0) {
      const openAt = new Date(Date.parse(windowStart) + rng.int(0, 12) * 3_600_000).toISOString();
      movements.push({
        id: uid("mov"),
        productId: p.id,
        unitId: null,
        qtyDelta: s.qty,
        reason: "purchase",
        refType: "po",
        refId: null,
        unitCost: s.cost,
        note: "Stok awal (opening balance)",
        occurredAt: openAt,
        actorId: owner.id,
      });
    }
  }

  const phones = products.filter((p) => p.kind === "handset");
  const accessories = products.filter((p) => p.kind === "accessory");
  const vouchers = products.filter((p) => p.kind === "voucher");
  const services = products.filter((p) => p.kind === "service");

  /* --------------------------------------------------------------- kas */

  const accounts: Account[] = [
    { id: "acc_drawer", name: "drawer", label: "Kas di laci", openingBalance: 6_100_000 },
    { id: "acc_bank", name: "bank", label: "Rekening bank", openingBalance: 44_600_000 },
    { id: "acc_ewallet", name: "ewallet", label: "E-wallet (DANA/OVO)", openingBalance: 1_850_000 },
  ];
  const cashTransactions: CashTransaction[] = accounts.map((a, i) => ({
    id: uid("ctx"),
    accountId: a.id,
    direction: "in",
    amount: a.openingBalance,
    category: "other",
    refType: "manual",
    refId: null,
    label: "Saldo awal periode",
    occurredAt: new Date(Date.parse(windowStart) - 1000 * (3 - i)).toISOString(),
  }));

  /* PO pembukaan sudah dilunasi sebelum periode ini dimulai. */
  const purchaseOrders: PurchaseOrder[] = [];
  let poSeq = 0;

  /* ---------------------------------------------------------- pelanggan */

  const customers: Customer[] = [];
  for (let i = 0; i < 140; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const hasEmail = rng.chance(0.42);
    const createdAt = new Date(Date.parse(windowStart) + rng.int(0, days - 1) * DAY_MS).toISOString();
    customers.push({
      id: uid("cst"),
      name: `${first} ${last}`,
      phone: `08${rng.int(11, 99)}${rng.int(1000000, 9999999)}`,
      email: hasEmail ? `${first.toLowerCase()}.${last.toLowerCase()}@gmail.com` : null,
      consentEmail: hasEmail,
      consentAt: hasEmail ? createdAt : null,
      lastReviewRequestAt: null,
      createdAt,
    });
  }

  /* ------------------------------------------------------ simulasi harian */

  /* Kas berjalan dipakai untuk membatasi belanja stok. Inilah mekanisme
     krisisnya: kas menipis, belanja stok dipotong, stok terkuras, penjualan
     ikut turun. */
  let cashRunning = sumAccountsOpening(accounts);

  const sales: Sale[] = [];
  const saleItems: SaleItem[] = [];
  const payments: Payment[] = [];
  const receivables: Receivable[] = [];
  const expenses: Expense[] = [];
  const shifts: Shift[] = [];
  const receiptDeliveries: ReceiptDelivery[] = [];
  const reviewRequests: ReviewRequest[] = [];
  const auditLog: AuditEntry[] = [];

  let receiptSeq = 0;
  const todayStart = startOfJakartaDay(asOf);

  for (let d = 0; d < days; d++) {
    const dayStartMs = todayStart - (days - 1 - d) * DAY_MS;
    const dayStart = new Date(dayStartMs).toISOString();
    const dayEnd = new Date(dayStartMs + DAY_MS).toISOString();
    const dateObj = new Date(dayStartMs + 7 * 3_600_000);
    const dow = dateObj.getUTCDay();
    const dom = dateObj.getUTCDate();
    const month = dateObj.getUTCMonth();
    const dayKeyStr = dateObj.toISOString().slice(0, 10);

    /* Kas di awal hari ini (sebelum transaksi hari ini). */
    const cashAtDayStart = cashRunning;

    /* faktor musiman: gajian, akhir pekan, Ramadan/Lebaran, tren menurun */
    let factor = 1;
    if (dom <= 5) factor *= 1.28;
    else if (dom >= 25) factor *= 1.18;
    if (dow === 0 || dow === 6) factor *= 1.15;
    if (month === 2 && dom >= 17) factor *= 1.32;
    if (month === 3 && dom <= 10) factor *= 1.42;
    factor *= 1 - (d / days) ** 1.4 * 0.34;
    factor *= 1 + rng.gauss(0, 0.12);

    const phoneCount = Math.max(0, Math.round(rng.gauss(3.4 * factor, 1.6)));
    const accCount = Math.max(1, Math.round(rng.gauss(13 * factor, 3.8)));
    const voucherCount = Math.max(0, Math.round(rng.gauss(8 * factor, 2.8)));
    const serviceCount = Math.max(0, Math.round(rng.gauss(2.4 * factor, 1.4)));

    /* Anggaran belanja stok hari ini. Mendekati HPP hari ini, lalu dipotong
       kalau kas sudah menipis. Inilah mekanisme krisisnya. */
    const cogsEstimate = phoneCount * 2_300_000 + accCount * 34_000 + voucherCount * 24_000;
    const wantBudget = rng.round500(rng.gauss(cogsEstimate * (0.94 + rng.next() * 0.06), 250_000));
    const throttle =
      cashAtDayStart < 6_000_000 ? 0.25 : cashAtDayStart < 12_000_000 ? 0.5 : cashAtDayStart < 22_000_000 ? 0.75 : 1;
    const budgetToday = Math.max(1_500_000, Math.round(wantBudget * throttle));

    const cashier = rng.pick(staffList);
    const shift: Shift = {
      id: uid("shf"),
      userId: cashier.id,
      openedAt: new Date(dayStartMs + 9 * 3_600_000).toISOString(),
      closedAt: new Date(dayStartMs + 22 * 3_600_000).toISOString(),
      openingFloat: 500_000,
      countedCash: null,
      expectedCash: null,
      variance: null,
      varianceReason: null,
      note: "",
    };
    shifts.push(shift);

    const txnCount = phoneCount + accCount + voucherCount + serviceCount;

    for (let t = 0; t < txnCount; t++) {
      const isPhone = t < phoneCount;
      const isVoucher = t >= phoneCount + accCount && t < phoneCount + accCount + voucherCount;
      const isService = t >= phoneCount + accCount + voucherCount;

      const items: SaleItem[] = [];
      const txMovements: StockMovement[] = [];

      /* ---- baris utama ---- */
      if (isPhone) {
        const available = phones.filter((p) => (qtyByProduct.get(p.id) ?? 0) > 0);
        if (available.length === 0) continue;
        const product = pickWeighted(
          rng,
          available.map((p) => ({
            p,
            /* Model lama sudah tidak dicari pembeli sama sekali di konter ini.
               Barangnya tetap di etalase sebagai stok mati. */
            demand: staleSkus.has(p.sku) ? 0 : (demandByProduct.get(p.id) ?? 1),
          }))
        ).p;
        const unit = units.find((u) => u.productId === product.id && u.status === "in_stock");
        if (!unit) continue;

        const marginPct = product.price / product.cost - 1;
        /* Margin handset menipis karena perang harga: kanibalisasi sepanjang periode. */
        const erodedPrice = rng.round500(product.price * (1 - (d / days) * 0.045));
        const nego = rng.chance(0.42) ? rng.next() * Math.max(0, Math.min(0.75, marginPct - 0.015)) : 0;
        const negoPrice = rng.round500(erodedPrice * (1 - nego));
        const aggressive = rng.chance(0.05);
        const finalPrice = aggressive
          ? rng.round500(product.cost * (0.965 + rng.next() * 0.03))
          : Math.max(negoPrice, product.minPrice);
        const discount = Math.max(0, product.price - finalPrice);

        qtyByProduct.set(product.id, (qtyByProduct.get(product.id) ?? 0) - 1);
        unit.status = "sold";
        unit.soldAt = new Date(dayStartMs + 12 * 3_600_000).toISOString();
        const mv: StockMovement = {
          id: uid("mov"),
          productId: product.id,
          unitId: unit.id,
          qtyDelta: -1,
          reason: "sale",
          refType: "sale",
          refId: null,
          unitCost: unit.cost,
          note: `Terjual ${unit.imei1}`,
          occurredAt: unit.soldAt,
          actorId: cashier.id,
        };
        movements.push(mv);
        txMovements.push(mv);
        items.push({
          id: uid("sit"),
          saleId: "",
          productId: product.id,
          unitId: unit.id,
          name: product.name,
          qty: 1,
          unitPrice: product.price,
          unitCost: unit.cost,
          discount,
          lineTotal: finalPrice,
          margin: finalPrice - unit.cost,
          imei: unit.imei1,
          lineType: "product",
        });
      } else if (isVoucher) {
        const v = pickWeighted(rng, vouchers.map((p) => ({ p, demand: demandByProduct.get(p.id) ?? 1 }))).p;
        const qty = rng.chance(0.25) ? 2 : 1;
        const stock = qtyByProduct.get(v.id) ?? 0;
        if (stock < qty) continue;
        qtyByProduct.set(v.id, stock - qty);
        const discount = rng.chance(0.3) ? rng.round500(v.price * rng.next() * 0.02) : 0;
        items.push({
          id: uid("sit"),
          saleId: "",
          productId: v.id,
          unitId: null,
          name: v.name,
          qty,
          unitPrice: v.price,
          unitCost: v.cost,
          discount,
          lineTotal: v.price * qty - discount,
          margin: (v.price - v.cost) * qty - discount,
          imei: null,
          lineType: "product",
        });
      } else if (isService) {
        const s = pickWeighted(rng, services.map((p) => ({ p, demand: demandByProduct.get(p.id) ?? 1 }))).p;
        items.push({
          id: uid("sit"),
          saleId: "",
          productId: s.id,
          unitId: null,
          name: s.name,
          qty: 1,
          unitPrice: s.price,
          unitCost: s.cost,
          discount: 0,
          lineTotal: s.price,
          margin: s.price - s.cost,
          imei: null,
          lineType: "service",
        });
      } else {
        const a = pickWeighted(rng, accessories.map((p) => ({ p, demand: demandByProduct.get(p.id) ?? 1 }))).p;
        const qty = rng.chance(0.35) ? rng.int(2, 3) : 1;
        const stock = qtyByProduct.get(a.id) ?? 0;
        if (stock < qty) continue;
        qtyByProduct.set(a.id, stock - qty);
        const discount = rng.chance(0.25) ? rng.round500(a.price * rng.next() * 0.05) : 0;
        items.push({
          id: uid("sit"),
          saleId: "",
          productId: a.id,
          unitId: null,
          name: a.name,
          qty,
          unitPrice: a.price,
          unitCost: a.cost,
          discount,
          lineTotal: a.price * qty - discount,
          margin: (a.price - a.cost) * qty - discount,
          imei: null,
          lineType: "product",
        });
      }

      const hour = 9 + Math.floor((t / Math.max(1, txnCount)) * 12);
      const minute = rng.int(0, 59);
      const occurredAt = new Date(dayStartMs + hour * 3_600_000 + minute * 60_000).toISOString();

      /* ---- upsell aksesori saat jual handset ---- */
      if (isPhone && rng.chance(0.46)) {
        const a = pickWeighted(rng, accessories.map((p) => ({ p, demand: demandByProduct.get(p.id) ?? 1 }))).p;
        const stock = qtyByProduct.get(a.id) ?? 0;
        if (stock > 0) {
          qtyByProduct.set(a.id, stock - 1);
          items.push({
            id: uid("sit"),
            saleId: "",
            productId: a.id,
            unitId: null,
            name: a.name,
            qty: 1,
            unitPrice: a.price,
            unitCost: a.cost,
            discount: 0,
            lineTotal: a.price,
            margin: a.price - a.cost,
            imei: null,
            lineType: "product",
          });
        }
      }

      for (const it of items) {
        if (it.unitId !== null) continue;
        if (it.lineType === "service") continue;
        const mv: StockMovement = {
          id: uid("mov"),
          productId: it.productId,
          unitId: null,
          qtyDelta: -it.qty,
          reason: "sale",
          refType: "sale",
          refId: null,
          unitCost: it.unitCost,
          note: "Penjualan",
          occurredAt,
          actorId: cashier.id,
        };
        movements.push(mv);
        txMovements.push(mv);
      }

      const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
      const discountTotal = items.reduce((s, it) => s + it.discount, 0);
      const grandTotal = items.reduce((s, it) => s + it.lineTotal, 0);
      const cogsTotal = items.reduce((s, it) => s + it.unitCost * it.qty, 0);

      /* ---- metode bayar ---- */
      let method: PaymentMethod = "cash";
      const roll = rng.next();
      if (roll < 0.42) method = "cash";
      else if (roll < 0.72) method = "qris";
      else if (roll < 0.82) method = "transfer";
      else if (roll < 0.9) method = "ewallet";
      else if (roll < 0.96) method = "edc";
      else method = "credit";

      const customerId: ID | null = rng.chance(isPhone ? 0.62 : 0.3) ? rng.pick(customers).id : null;
      const customer = customerId === null ? null : customers.find((c) => c.id === customerId) ?? null;

      receiptSeq += 1;
      const sale: Sale = {
        id: uid("sal"),
        receiptNo: receiptNumber(receiptSeq, occurredAt),
        userId: cashier.id,
        shiftId: shift.id,
        customerId,
        subtotal,
        discountTotal,
        grandTotal,
        cogsTotal,
        status: "completed",
        discountReason: discountTotal > 0 ? rng.pick(DISCOUNT_REASONS) : "",
        ownerApprovedBy: null,
        createdAt: occurredAt,
        note: "",
      };
      sales.push(sale);

      for (const it of items) {
        it.saleId = sale.id;
        saleItems.push(it);
      }
      for (const mv of txMovements) mv.refId = sale.id;

      const useCredit = method === "credit" || (grandTotal > 1_000_000 && rng.chance(0.05));
      const storeCredit = useCredit && customer !== null;

      if (storeCredit && customer) {
        receivables.push({
          id: uid("rcv"),
          customerId: customer.id,
          saleId: sale.id,
          amount: grandTotal,
          paidAmount: 0,
          dueDate: new Date(Date.parse(occurredAt) + rng.int(7, 30) * DAY_MS).toISOString(),
          status: "open",
        });
        payments.push({
          id: uid("pay"),
          saleId: sale.id,
          method: "credit",
          amount: grandTotal,
          providerRef: null,
          paidAt: occurredAt,
        });
      } else {
        payments.push({
          id: uid("pay"),
          saleId: sale.id,
          method,
          amount: grandTotal,
          providerRef: method === "qris" || method === "ewallet" ? `TRX${rng.int(100000, 999999)}` : null,
          paidAt: occurredAt,
        });
        const accountId =
          method === "cash" ? "acc_drawer" : method === "edc" || method === "transfer" ? "acc_bank" : "acc_ewallet";
        cashTransactions.push({
          id: uid("ctx"),
          accountId,
          direction: "in",
          amount: grandTotal,
          category: "sales",
          refType: "sale",
          refId: sale.id,
          label: `Penjualan ${sale.receiptNo}`,
          occurredAt,
        });
      }

      /* ---- struk & permintaan ulasan ---- */
      if (customer) {
        const wantsEmail = customer.email !== null && customer.consentEmail;
        const opened = wantsEmail && rng.chance(0.55);
        receiptDeliveries.push({
          id: uid("rcd"),
          saleId: sale.id,
          channel: wantsEmail ? "email" : "print",
          status: wantsEmail ? (opened ? "opened" : rng.chance(0.9) ? "sent" : "failed") : "sent",
          sentAt: occurredAt,
          openedAt: opened ? new Date(Date.parse(occurredAt) + rng.int(5, 600) * 60_000).toISOString() : null,
        });
        const canRequest =
          wantsEmail && customer.lastReviewRequestAt === null && grandTotal > 150_000 && rng.chance(0.55);
        if (canRequest) {
          const scheduledAt = new Date(Date.parse(occurredAt) + 3 * 3_600_000).toISOString();
          const clicked = rng.chance(0.28);
          reviewRequests.push({
            id: uid("rvw"),
            saleId: sale.id,
            customerId: customer.id,
            shortCode: `${pad(rng.int(1000, 9999), 4)}${rng.pick(["A", "B", "C", "D"])}`,
            scheduledAt,
            sentAt: scheduledAt,
            clickedAt: clicked ? new Date(Date.parse(scheduledAt) + rng.int(2, 400) * 60_000).toISOString() : null,
          });
          customer.lastReviewRequestAt = scheduledAt;
        }
      }

      /* ---- void sesekali, dengan persetujuan pemilik ---- */
      if (rng.chance(0.012) && !storeCredit) {
        const voidedAt = new Date(Date.parse(occurredAt) + rng.int(10, 300) * 60_000).toISOString();
        sale.status = "void";
        sale.note = "Dibatalkan: pelanggan salah pilih warna";
        sale.ownerApprovedBy = owner.id;
        for (const it of items) {
          if (it.unitId) {
            const u = units.find((x) => x.id === it.unitId);
            if (u) {
              u.status = "in_stock";
              u.soldAt = null;
            }
          }
          qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.qty);
          movements.push({
            id: uid("mov"),
            productId: it.productId,
            unitId: it.unitId,
            qtyDelta: it.qty,
            reason: "return",
            refType: "sale",
            refId: sale.id,
            unitCost: it.unitCost,
            note: "Void penjualan",
            occurredAt: voidedAt,
            actorId: owner.id,
          });
        }
        cashTransactions.push({
          id: uid("ctx"),
          accountId: "acc_drawer",
          direction: "out",
          amount: grandTotal,
          category: "refund",
          refType: "sale",
          refId: sale.id,
          label: `Void ${sale.receiptNo}`,
          occurredAt: voidedAt,
        });
        auditLog.push({
          id: uid("aud"),
          actorId: owner.id,
          action: "sale.void",
          entity: "sale",
          entityId: sale.id,
          detail: `Void ${sale.receiptNo}`,
          at: voidedAt,
        });
      }
    }

    /* ---- belanja stok harian dengan anggaran terbatas ---- */
    let spent = 0;
    const restockMovements: StockMovement[] = [];
    const candidates = products
      .filter((p) => p.kind !== "service" && p.supplierId !== null)
      .map((p) => {
        const qty = qtyByProduct.get(p.id) ?? 0;
        const need = Math.max(0, p.reorderPoint + p.reorderQty - qty);
        const gmroi = p.kind === "handset" ? 1.15 : p.kind === "voucher" ? 1.6 : 2.9;
        return { p, need, gmroi };
      })
      .filter((c) => c.need > 0)
      .sort((a, b) => b.gmroi - a.gmroi);

    for (const c of candidates) {
      const { p, need } = c;
      /* hanya separuh kebutuhan yang dibeli: rasio replenishment di bawah 1 */
    /* hanya separuh kebutuhan yang dibeli: rasio replenishment di bawah 1 */
      const qty = Math.max(1, Math.floor(need * 0.5));
      const cost = qty * p.cost;
      if (spent + cost > budgetToday) continue;
      /* model lama tidak dibeli lagi: barangnya sudah tidak dicari pembeli */
      if (staleSkus.has(p.sku)) continue;
      spent += cost;
      const receivedAt = new Date(dayStartMs + rng.int(10, 19) * 3_600_000).toISOString();
      qtyByProduct.set(p.id, (qtyByProduct.get(p.id) ?? 0) + qty);
      if (p.isSerialized) {
        for (let i = 0; i < qty; i++) {
          const unit: InventoryUnit = {
            id: uid("unt"),
            productId: p.id,
            imei1: makeImei(rng),
            imei2: rng.chance(0.7) ? makeImei(rng) : null,
            serial: null,
            cost: p.cost,
            status: "in_stock",
            warrantyMonths: 12,
            receivedAt,
            soldAt: null,
          };
          units.push(unit);
          const poMv: StockMovement = {
            id: uid("mov"),
            productId: p.id,
            unitId: unit.id,
            qtyDelta: 1,
            reason: "purchase",
            refType: "po",
            refId: null,
            unitCost: p.cost,
            note: `Pembelian ${p.sku}`,
            occurredAt: receivedAt,
            actorId: owner.id,
          };
          movements.push(poMv);
          restockMovements.push(poMv);
        }
      } else {
        const poMv: StockMovement = {
          id: uid("mov"),
          productId: p.id,
          unitId: null,
          qtyDelta: qty,
          reason: "purchase",
          refType: "po",
          refId: null,
          unitCost: p.cost,
          note: `Pembelian ${p.sku}`,
          occurredAt: receivedAt,
          actorId: owner.id,
        };
        movements.push(poMv);
        restockMovements.push(poMv);
      }
      if (spent >= budgetToday) break;
    }

    if (spent > 1_000_000) {
      poSeq += 1;
      const supplierId = rng.pick(phoneSuppliers).id;
      const po: PurchaseOrder = {
        id: uid("po"),
        number: `PO-${pad(poSeq, 4)}`,
        supplierId,
        status: "received",
        total: spent,
        orderedAt: new Date(dayStartMs + 8 * 3_600_000).toISOString(),
        receivedAt: new Date(dayStartMs + 15 * 3_600_000).toISOString(),
        dueDate: new Date(dayStartMs + 15 * DAY_MS).toISOString(),
        paidAt: new Date(dayStartMs + 16 * 3_600_000).toISOString(),
        cashRequired: spent,
      };
      purchaseOrders.push(po);
      for (const mv of restockMovements) mv.refId = po.id;
      cashTransactions.push({
        id: uid("ctx"),
        accountId: "acc_bank",
        direction: "out",
        amount: spent,
        category: "supplier_payment",
        refType: "po",
        refId: po.id,
        label: `Belanja stok ${po.number}`,
        occurredAt: po.receivedAt ?? dayStart,
      });
    }

    /* ---- beban tetap ---- */
    if (dom === 1) {
      const paidAt = new Date(dayStartMs + 10 * 3_600_000).toISOString();
      expenses.push({
        id: uid("exp"),
        category: "rent",
        amount: 3_500_000,
        dueDate: dayStart,
        paidAt,
        recurringRule: "FREQ=MONTHLY;BYMONTHDAY=1",
        attachment: true,
        note: "Sewa ruko bulanan",
      });
      cashTransactions.push({
        id: uid("ctx"),
        accountId: "acc_bank",
        direction: "out",
        amount: 3_500_000,
        category: "rent",
        refType: "expense",
        refId: null,
        label: "Sewa ruko",
        occurredAt: paidAt,
      });
    }
    if (dom === 5) {
      const paidAt = new Date(dayStartMs + 11 * 3_600_000).toISOString();
      expenses.push({
        id: uid("exp"),
        category: "salary",
        amount: 4_200_000,
        dueDate: dayStart,
        paidAt,
        recurringRule: "FREQ=MONTHLY;BYMONTHDAY=5",
        attachment: false,
        note: "Gaji 3 karyawan",
      });
      cashTransactions.push({
        id: uid("ctx"),
        accountId: "acc_drawer",
        direction: "out",
        amount: 4_200_000,
        category: "salary",
        refType: "expense",
        refId: null,
        label: "Gaji karyawan",
        occurredAt: paidAt,
      });
    }
    if (dom === 10) {
      const utilities = 780_000 + rng.int(0, 180_000);
      const paidAt = new Date(dayStartMs + 12 * 3_600_000).toISOString();
      expenses.push({
        id: uid("exp"),
        category: "utilities",
        amount: utilities,
        dueDate: dayStart,
        paidAt,
        recurringRule: "FREQ=MONTHLY;BYMONTHDAY=10",
        attachment: false,
        note: "Listrik, air, internet",
      });
      cashTransactions.push({
        id: uid("ctx"),
        accountId: "acc_bank",
        direction: "out",
        amount: utilities,
        category: "utilities",
        refType: "expense",
        refId: null,
        label: "Listrik & internet",
        occurredAt: paidAt,
      });
    }
    if (dom === 18 && rng.chance(0.8)) {
      const ads = 450_000 + rng.int(0, 400_000);
      const paidAt = new Date(dayStartMs + 13 * 3_600_000).toISOString();
      expenses.push({
        id: uid("exp"),
        category: "marketing",
        amount: ads,
        dueDate: dayStart,
        paidAt,
        recurringRule: null,
        attachment: true,
        note: "Iklan TikTok & banner",
      });
      cashTransactions.push({
        id: uid("ctx"),
        accountId: "acc_ewallet",
        direction: "out",
        amount: ads,
        category: "marketing",
        refType: "expense",
        refId: null,
        label: "Promosi",
        occurredAt: paidAt,
      });
    }

    /* ---- prive pemilik: terlalu sering dan terlalu besar, makin menjadi ---- */
    const drawT = d / days;
    if (rng.chance(dow === 0 ? 0.6 : 0.85 + drawT * 0.2)) {
      const drawAt = new Date(dayStartMs + 20 * 3_600_000).toISOString();
      const draw = rng.round500(2_250_000 + rng.next() * 900_000 + drawT * 400_000);
      expenses.push({
        id: uid("exp"),
        category: "owner_draw",
        amount: draw,
        dueDate: dayStart,
        paidAt: drawAt,
        recurringRule: null,
        attachment: false,
        note: "Prive pemilik",
      });
      cashTransactions.push({
        id: uid("ctx"),
        accountId: "acc_drawer",
        direction: "out",
        amount: draw,
        category: "owner_draw",
        refType: "draw",
        refId: null,
        label: "Prive pemilik",
        occurredAt: drawAt,
      });
    }

    /* ---- pelunasan piutang ---- */
    for (const r of receivables) {
      if (r.status !== "open") continue;
      if (r.dueDate <= dayStart) {
        if (rng.chance(0.55)) {
          r.paidAmount = r.amount;
          r.status = "paid";
          cashTransactions.push({
            id: uid("ctx"),
            accountId: "acc_drawer",
            direction: "in",
            amount: r.amount,
            category: "receivable",
            refType: "sale",
            refId: r.saleId,
            label: "Pelunasan bon pelanggan",
            occurredAt: new Date(dayStartMs + 17 * 3_600_000).toISOString(),
          });
        } else {
          r.status = "overdue";
        }
      }
    }

    /* ---- tutup shift ---- */
    const drawerToday = cashTransactions.filter(
      (c) => c.accountId === "acc_drawer" && c.occurredAt >= dayStart && c.occurredAt < dayEnd
    );
    const inflow = drawerToday.filter((c) => c.direction === "in").reduce((s, c) => s + c.amount, 0);
    const outflow = drawerToday.filter((c) => c.direction === "out").reduce((s, c) => s + c.amount, 0);
    const expected = shift.openingFloat + inflow - outflow;
    const variance = rng.chance(0.22) ? rng.round500((rng.next() - 0.6) * 120_000) : 0;
    shift.expectedCash = expected;
    shift.countedCash = expected + variance;
    shift.variance = variance;
    shift.varianceReason =
      variance === 0 ? "" : variance < 0 ? "Uang kembalian kurang catat" : "Lebih setor dari catatan";
    if (variance !== 0) {
      auditLog.push({
        id: uid("aud"),
        actorId: cashier.id,
        action: "shift.variance",
        entity: "shift",
        entityId: shift.id,
        detail: `Selisih kas ${variance}`,
        at: shift.closedAt ?? dayStart,
      });
    }

    /* perbarui kas berjalan untuk throttle belanja stok besok */
    let dayNet = 0;
    for (const c of cashTransactions) {
      if (c.occurredAt < dayStart || c.occurredAt >= dayEnd) continue;
      dayNet += c.direction === "in" ? c.amount : -c.amount;
    }
    cashRunning += dayNet;
  }

  /* -------------------------------------------------------------- opname */

  const opnameSessions: OpnameSession[] = [];
  const opnameLines: OpnameLine[] = [];
  const opnameActor = staffList[0]!;
  for (let i = 0; i < 2; i++) {
    const startedAt = new Date(todayStart - (2 - i) * 30 * DAY_MS).toISOString();
    const session: OpnameSession = {
      id: uid("opn"),
      code: `OPN-${pad(i + 1, 3)}`,
      startedAt,
      closedAt: new Date(Date.parse(startedAt) + 4 * 3_600_000).toISOString(),
      status: i === 1 ? "open" : "approved",
      countedBy: opnameActor.id,
      note: i === 1 ? "Opname berjalan, blind count oleh staf" : "Opname bulanan",
    };
    opnameSessions.push(session);
    if (i === 1) continue;
    for (const p of products) {
      if (p.kind === "service") continue;
      const systemQty = qtyByProduct.get(p.id) ?? 0;
      if (systemQty === 0) continue;
      const variance = rng.chance(0.12) ? -rng.int(1, 3) : 0;
      opnameLines.push({
        id: uid("opl"),
        sessionId: session.id,
        productId: p.id,
        systemQty,
        countedQty: systemQty + variance,
        variance,
        varianceValue: variance * p.cost,
      });
    }
  }

  /* ------------------------------------------------- kelas ABC / XYZ */

  const agg = new Map<ID, { revenue: number; days: number[] }>();
  for (const s of sales) {
    if (s.status === "void") continue;
    const t = Date.parse(s.createdAt) / DAY_MS;
    for (const it of saleItems) {
      if (it.saleId !== s.id) continue;
      const cur = agg.get(it.productId) ?? { revenue: 0, days: [] };
      cur.revenue += it.lineTotal;
      cur.days.push(t);
      agg.set(it.productId, cur);
    }
  }
  const ranked = [...agg.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevenue = ranked.reduce((s, [, v]) => s + v.revenue, 0);
  let cumulative = 0;
  for (const [productId, v] of ranked) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    cumulative += v.revenue;
    const share = totalRevenue === 0 ? 0 : cumulative / totalRevenue;
    product.tags.abc = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
    const mean = v.days.length === 0 ? 0 : v.days.reduce((s, x) => s + x, 0) / v.days.length;
    const varianceDays =
      v.days.length < 2 ? 0 : v.days.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.days.length - 1);
    const cv = mean === 0 ? 0 : Math.sqrt(varianceDays) / mean;
    product.tags.xyz = cv < 0.5 ? "X" : cv < 1 ? "Y" : "Z";
  }

  /* ------------------------------------------------- tugas pemulihan */

  const recoveryTasks: RecoveryTask[] = [
    {
      id: uid("tsk"),
      phase: "stabilize",
      title: "Tutup shift setiap hari sebelum 23.00",
      detail: "Hitung uang laci dan catat selisih. Tanpa ini, kebocoran tidak terlihat.",
      kpi: "Hari shift tertutup tepat waktu",
      target: 30,
      current: 21,
      due: new Date(todayStart + 14 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 1_200_000,
    },
    {
      id: uid("tsk"),
      phase: "stabilize",
      title: "Aktifkan margin guard di POS",
      detail: "Blokir transaksi di bawah harga minimum tanpa PIN pemilik.",
      kpi: "Transaksi di bawah margin minimum",
      target: 0,
      current: 3,
      due: new Date(todayStart + 7 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 900_000,
    },
    {
      id: uid("tsk"),
      phase: "stabilize",
      title: "Tetapkan prive pemilik Rp 1.500.000 per bulan",
      detail: "Ganti prive harian dengan jumlah tetap yang masuk anggaran.",
      kpi: "Prive bulan ini (rupiah)",
      target: 1_500_000,
      current: 6_450_000,
      due: new Date(todayStart + 10 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 5_000_000,
    },
    {
      id: uid("tsk"),
      phase: "free_cash",
      title: "Markdown stok mati lebih dari 60 hari",
      detail: "Turunkan harga bertahap sampai modal kembali, jangan tahan barang.",
      kpi: "Nilai stok mati yang cair (rupiah)",
      target: 12_000_000,
      current: 0,
      due: new Date(todayStart + 30 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 3_800_000,
    },
    {
      id: uid("tsk"),
      phase: "free_cash",
      title: "Kembalikan 2 unit iPhone ke supplier",
      detail: "Model Apple lambat laku di konter ini; tukar dengan tipe cepat laku.",
      kpi: "Unit dikembalikan",
      target: 2,
      current: 0,
      due: new Date(todayStart + 21 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 2_400_000,
    },
    {
      id: uid("tsk"),
      phase: "margin",
      title: "Naikkan attach rate aksesori jadi 55%",
      detail: "Tawarkan tempered glass dan softcase pada setiap penjualan handset.",
      kpi: "Attach rate (%)",
      target: 55,
      current: 44,
      due: new Date(todayStart + 45 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 2_100_000,
    },
    {
      id: uid("tsk"),
      phase: "margin",
      title: "Kurangi diskon di luar batas 5%",
      detail: "Diskon di atas batas harus lewat PIN pemilik dan wajib beralasan.",
      kpi: "Kebocoran diskon (% dari penjualan)",
      target: 4,
      current: 5.8,
      due: new Date(todayStart + 40 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 1_450_000,
    },
    {
      id: uid("tsk"),
      phase: "margin",
      title: "Negosiasi termin supplier jadi 21 hari",
      detail: "Perpanjang termin agar kas tidak habis di belanja stok.",
      kpi: "Rata-rata termin (hari)",
      target: 21,
      current: 11,
      due: new Date(todayStart + 50 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 1_900_000,
    },
    {
      id: uid("tsk"),
      phase: "rebuild",
      title: "Belanja stok pakai anggaran open-to-buy",
      detail: "Ikuti daftar reorder berbasis GMROI, bukan barang yang habis saja.",
      kpi: "Rasio replenishment",
      target: 1,
      current: 0.62,
      due: new Date(todayStart + 60 * DAY_MS).toISOString(),
      status: "open",
      source: "engine",
      impactPerMonth: 2_600_000,
    },
    {
      id: uid("tsk"),
      phase: "rebuild",
      title: "Kejar 30 ulasan Google baru",
      detail: "Minta ulasan lewat email struk, jangan pernah menyaring pelanggan.",
      kpi: "Klik tautan ulasan",
      target: 30,
      current: 9,
      due: new Date(todayStart + 75 * DAY_MS).toISOString(),
      status: "open",
      source: "ai",
      impactPerMonth: 700_000,
    },
  ];

  auditLog.push(
    {
      id: uid("aud"),
      actorId: owner.id,
      action: "auth.login",
      entity: "session",
      entityId: null,
      detail: "Masuk dari perangkat tepercaya",
      at: new Date(todayStart + 8.5 * 3_600_000).toISOString(),
    },
    {
      id: uid("aud"),
      actorId: owner.id,
      action: "product.price_change",
      entity: "product",
      entityId: phones[0]?.id ?? null,
      detail: "Harga jual handset disesuaikan mengikuti harga pasar",
      at: new Date(todayStart - 2 * DAY_MS).toISOString(),
    },
    {
      id: uid("aud"),
      actorId: staffList[1]!.id,
      action: "discount.override_request",
      entity: "sale",
      entityId: null,
      detail: "Minta persetujuan diskon 8% untuk pembelian 2 unit",
      at: new Date(todayStart - 1 * DAY_MS).toISOString(),
    }
  );

  void staleSkus;

  return {
    asOf,
    days,
    startDate: windowStart,
    profile,
    users,
    devices,
    shifts,
    categories,
    suppliers,
    products,
    units,
    movements,
    customers,
    sales,
    saleItems,
    payments,
    cashTransactions,
    expenses,
    purchaseOrders,
    receivables,
    receiptDeliveries,
    reviewRequests,
    accounts,
    opnameSessions,
    opnameLines,
    auditLog,
    recoveryTasks,
  };
}
