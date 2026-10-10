"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatRupiah, formatCompact, formatMoneyDisplay } from "@/lib/money";

/**
 * Kartu KPI: angka adalah elemen terbesar, selalu mono tabular.
 * Setiap kartu menjawab satu pertanyaan saja.
 *
 * Aturan angka: nilai uang besar dipindah ke satuan juta/miliar supaya jumlah
 * digitnya tetap pendek. Dengan begitu angka tidak pernah meluber keluar kartu
 * di layar sempit, dan satuannya tetap terbaca jelas.
 */
export function Kpi({
  label,
  value,
  format = "rupiah",
  subject,
  delta,
  hint,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: number | string;
  format?: "rupiah" | "number" | "percent" | "days" | "text";
  subject?: string;
  delta?: { value: number; invert?: boolean; suffix?: string } | null;
  hint?: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger";
  sub?: ReactNode;
}) {
  let display: string;
  let unit: string | null = null;

  if (typeof value === "string") {
    display = value;
  } else if (format === "rupiah") {
    const money = formatMoneyDisplay(value);
    display = money.text;
    unit = money.unit;
  } else if (format === "number") {
    display = value.toLocaleString("id-ID");
  } else if (format === "percent") {
    display = value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
    unit = "%";
  } else if (format === "days") {
    display = value.toLocaleString("id-ID", { maximumFractionDigits: 0 });
    unit = "hari";
  } else {
    display = String(value);
  }

  const toneRing =
    tone === "danger"
      ? "border-danger/35"
      : tone === "warn"
        ? "border-warning/35"
        : tone === "ok"
          ? "border-accent/30"
          : "border-border";

  /* Panjang teks menentukan ukuran huruf: angka tetap besar, tetapi tidak
     pernah melewati lebar kartu. */
  const size =
    display.length > 13
      ? "text-[19px] md:text-[21px]"
      : display.length > 10
        ? "text-[22px] md:text-[25px]"
        : display.length > 8
          ? "text-[24px] md:text-[27px]"
          : "text-[26px] md:text-[30px]";

  return (
    <div className={cn("card flex min-w-0 flex-col gap-2.5 px-5 py-4", toneRing)}>
      <div className="flex items-start justify-between gap-2">
        <span className="label-caps min-w-0 truncate">{label}</span>
        {delta ? (
          <span
            className={cn(
              "num shrink-0 text-[12px] font-medium",
              (delta.invert ? delta.value < 0 : delta.value > 0) ? "text-accent" : "text-danger"
            )}
          >
            {delta.value > 0 ? "+" : ""}
            {delta.value.toFixed(1)}
            {delta.suffix ?? "%"}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
        <span className={cn("kpi-number tabular text-text", size)}>{display}</span>
        {unit ? <span className="num shrink-0 text-[12px] font-medium text-text-faint">{unit}</span> : null}
        {subject ? <span className="shrink-0 text-[12px] text-text-faint">{subject}</span> : null}
      </div>

      {sub ? <div className="text-[12px] leading-snug text-text-muted">{sub}</div> : null}
      {hint ? <div className="hairline pt-2.5 text-[12px] leading-snug text-text-faint">{hint}</div> : null}
    </div>
  );
}

/** Angka utuh untuk tabel: satu baris, mono, tidak pernah terpotong. */
export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num whitespace-nowrap tabular", className)} title={formatRupiah(value)}>
      {value < 0 ? "-" : ""}
      {formatCompact(Math.abs(value)).replace("Rp ", "Rp ")}
    </span>
  );
}

/** Bar angka sederhana untuk membandingkan dua nilai dalam satu baris tabel. */
export function MiniBar({
  value,
  max,
  tone = "accent",
  width = 72,
}: {
  value: number;
  max: number;
  tone?: "accent" | "danger" | "muted";
  width?: number;
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.max(2, (value / max) * 100));
  return (
    <span className="inline-flex items-center gap-2" aria-hidden="true">
      <span className="h-1.5 rounded-full bg-surface-3" style={{ width }}>
        <span
          className={cn(
            "block h-1.5 rounded-full",
            tone === "accent" ? "bg-accent" : tone === "danger" ? "bg-danger" : "bg-text-faint"
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

export function DataRow({
  label,
  value,
  hint,
  strong,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <div className="min-w-0">
        <div className={cn("text-[13px]", strong ? "font-semibold text-text" : "text-text-muted")}>{label}</div>
        {hint ? <div className="mt-0.5 text-[11.5px] leading-snug text-text-faint">{hint}</div> : null}
      </div>
      <div className={cn("num shrink-0 text-right text-[13px]", strong ? "font-semibold text-text" : "text-text")}>
        {value}
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  height = 40,
  tone = "accent",
  className,
}: {
  values: number[];
  height?: number;
  tone?: "accent" | "danger" | "muted";
  className?: string;
}) {
  if (values.length < 2) return <div className={cn("h-10", className)} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const stroke = tone === "accent" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : "var(--text-faint)";
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={`Tren ${values.length} titik, dari ${formatCompact(values[0] ?? 0)} ke ${formatCompact(values[values.length - 1] ?? 0)}`}
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Gauge({ value, size = 148, label }: { value: number; size?: number; label?: string }) {
  const r = 62;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const arc = (clamped / 100) * circumference;
  const color = clamped < 40 ? "var(--danger)" : clamped < 70 ? "var(--warning)" : "var(--accent)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="kpi-number text-[34px] text-text">{Math.round(clamped)}</span>
        <span className="text-[11px] text-text-faint">{label ?? "dari 100"}</span>
      </div>
    </div>
  );
}
