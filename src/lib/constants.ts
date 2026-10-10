import type { TaskPhase } from "./types";

export const SHOP = {
  name: "Diva Cell",
  system: "Frizzy",
  tagline: "Sistem operasi konter: jualan, stok, dan kas dalam satu tempat.",
  address: "Jl. Merdeka No. 128, Palembang",
  phone: "+62 812-7100-4412",
  whatsapp: "6281271004412",
  hours: "Setiap hari 08.00 - 22.00 WIB",
  timezone: "Asia/Jakarta",
  /** Place ID contoh; ganti dengan place_id Google Maps milik konter. */
  placeId: "ChIJd1vaCeLL8S0R8zW4DivaCellPlaceholderId",
  reviewUrl:
    "https://search.google.com/local/writereview?placeid=ChIJd1vaCeLL8S0R8zW4DivaCellPlaceholderId",
  mapsUrl: "https://maps.google.com/?q=Jl.+Merdeka+No.+128+Palembang",
  minMarginPct: 4,
  staffDiscountLimitPct: 5,
  ownerDrawMonthlyCap: 2_000_000,
  safetyCashFloor: 5_000_000,
  varianceThreshold: 20_000,
  reviewCooldownDays: 90,
  taxEnabled: false,
  taxPct: 0,
  ownerPin: "2468",
  staffPin: "1234",
} as const;

/** Titik acuan waktu demo. Semua angka deterministik terhadap tanggal ini. */
export const AS_OF = "2026-02-15T09:30:00.000Z";
export const HISTORY_DAYS = 180;

export const SHIFTS_PER_DAY = 1;

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: "operasional" | "uang" | "analitik" | "sistem";
  role?: "owner" | "staff";
  hint: string;
};

export const NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "Gauge", group: "operasional", hint: "Ringkasan kas dan penjualan" },
  { href: "/app/pos", label: "POS", icon: "Storefront", group: "operasional", hint: "Transaksi di konter" },
  { href: "/app/sales", label: "Penjualan", icon: "Receipt", group: "operasional", hint: "Riwayat struk dan IMEI" },
  { href: "/app/inventory", label: "Stok", icon: "Package", group: "operasional", hint: "Ledger, unit IMEI, opname" },
  { href: "/app/purchasing", label: "Pembelian", icon: "Truck", group: "operasional", role: "owner", hint: "Supplier dan PO" },
  { href: "/app/customers", label: "Pelanggan", icon: "Users", group: "operasional", hint: "Riwayat dan garansi" },
  { href: "/app/shifts", label: "Shift", icon: "ClockCounterClockwise", group: "operasional", hint: "Buka dan tutup kas" },
  { href: "/app/finance", label: "Keuangan", icon: "Wallet", group: "uang", role: "owner", hint: "Kas, beban, utang piutang" },
  { href: "/app/recovery", label: "Cash Recovery", icon: "FirstAid", group: "uang", role: "owner", hint: "Mesin pemulihan kas" },
  { href: "/app/reports", label: "Laporan", icon: "ChartLineUp", group: "analitik", role: "owner", hint: "Ekspor dan cetak" },
  { href: "/app/ai", label: "AI Analyst", icon: "Sparkle", group: "analitik", hint: "Tanya data konter" },
  { href: "/app/security", label: "Keamanan", icon: "ShieldCheck", group: "sistem", hint: "Sesi, audit, perangkat" },
  { href: "/app/settings", label: "Pengaturan", icon: "Sliders", group: "sistem", role: "owner", hint: "Toko, struk, integrasi" },
];

export const PHASE_LABEL: Record<TaskPhase, string> = {
  stabilize: "Stabilkan",
  free_cash: "Bebaskan kas",
  margin: "Jaga margin",
  rebuild: "Bangun ulang",
};

export const PHASE_WINDOW: Record<TaskPhase, string> = {
  stabilize: "Minggu 0 - 1",
  free_cash: "Minggu 2 - 4",
  margin: "Bulan 2",
  rebuild: "Bulan 3",
};

export const Z = {
  base: 0,
  sticky: 10,
  dropdown: 20,
  drawer: 30,
  modal: 40,
  toast: 50,
  grain: 60,
} as const;

export const PRODUCT_KIND_LABEL: Record<string, string> = {
  handset: "Handset",
  accessory: "Aksesori",
  voucher: "Voucher / Pulsa",
  service: "Servis",
  secondhand: "Second",
};

export const PAYMENT_LABEL: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  edc: "Kartu (EDC)",
  ewallet: "E-wallet",
  credit: "Bon / Cicilan",
};

export const CASH_CATEGORY_LABEL: Record<string, string> = {
  rent: "Sewa",
  salary: "Gaji",
  utilities: "Listrik & internet",
  marketing: "Promosi",
  owner_draw: "Prive pemilik",
  other: "Lain-lain",
  restock: "Belanja stok",
  supplier_payment: "Bayar supplier",
  sales: "Penjualan",
  refund: "Refund",
  receivable: "Terima piutang",
};
