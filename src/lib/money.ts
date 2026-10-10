import type { Rupiah } from "./types";

/** Rp 12.500.000 -> "Rp 12,5 jt" untuk ruang sempit (KPI, chip, sumbu grafik). */
export function formatCompact(value: Rupiah, opts?: { sign?: boolean }): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : opts?.sign ? "+" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${trim(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}Rp ${trim(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `${sign}Rp ${trim(abs / 1_000)} rb`;
  return `${sign}Rp ${abs}`;
}

/** Rp 12.500.000 -> "12.500.000" (tanpa "Rp", untuk tabel). */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Rp 12.500.000 -> "Rp 12.500.000" */
export function formatRupiah(value: Rupiah): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp ${formatNumber(Math.abs(value))}`;
}

/** Ringkas, untuk label sumbu dan kartu kecil. */
export function formatAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}M`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}jt`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}rb`;
  return `${sign}${abs}`;
}

export type MoneyDisplay = { text: string; unit: string };

/**
 * Penampil uang untuk kartu KPI: angka tetap menjadi elemen terbesar tanpa
 * pernah meluber keluar kartu. Nilai besar dipindah ke satuan juta supaya
 * jumlah digitnya tetap pendek, dan satuannya ditulis kecil di sebelahnya.
 *
 *   Rp 264.530.250  ->  { text: "264,5", unit: "juta" }
 *   Rp 7.781.106    ->  { text: "7.781.106", unit: "Rp" }
 */
export function formatMoneyDisplay(value: number): MoneyDisplay {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return { text: `${sign}${formatNumber(abs / 1_000_000_000, 2)}`, unit: "miliar" };
  }
  if (abs >= 10_000_000) {
    return { text: `${sign}${formatNumber(abs / 1_000_000, 1)}`, unit: "juta" };
  }
  return { text: `${sign}${formatNumber(abs)}`, unit: "Rp" };
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

const DAY_MS = 86_400_000;

/** Tanggal ISO (UTC) -> "12 Feb 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
}

export function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

/** "3 hari lalu", "kemarin", "hari ini" */
export function relativeDays(iso: string, fromIso: string): string {
  const days = daysBetween(iso, fromIso);
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  if (days < 30) return `${days} hari lalu`;
  const months = Math.round(days / 30);
  return `${months} bulan lalu`;
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  return Math.round((b - a) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** Tambah bulan kalender (untuk masa garansi). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  /* 31 Jan + 1 bulan tidak boleh jadi 3 Maret */
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString();
}

/** Angka besar dengan pemisah ribuan, untuk input. */
export function parseRupiahInput(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}
