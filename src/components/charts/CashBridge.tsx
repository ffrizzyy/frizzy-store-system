"use client";

import { formatCompact, formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

export type BridgeStep = {
  label: string;
  kind: "start" | "in" | "out" | "total" | string;
  value: number;
  running?: number;
  hint?: string;
};

/**
 * Stock-to-Cash Bridge: satu batang per sebab, turun ke bawah untuk kas keluar.
 * Tinggi batang proporsional terhadap nilai terbesar pada jembatan.
 */
export function CashBridge({ steps, compact = false }: { steps: BridgeStep[]; compact?: boolean }) {
  const outflows = steps.filter((s) => s.kind === "out").map((s) => Math.abs(s.value));
  const startValue = steps.find((s) => s.kind === "start")?.value ?? 0;
  const scaleMax = Math.max(startValue, ...steps.map((s) => Math.abs(s.value)), ...outflows, 1);
  const height = compact ? 128 : 190;

  return (
    <div className="w-full">
      <div className="scroll-x">
        <div className="flex min-w-[640px] items-end gap-2" style={{ height }}>
          {steps.map((s) => {
            const magnitude = Math.abs(s.value);
            const h = Math.max(6, (magnitude / scaleMax) * (height - 42));
            const isOut = s.kind === "out";
            const isTotal = s.kind === "total" || s.kind === "start";
            return (
              <div key={s.label} className="group flex flex-1 flex-col items-center justify-end gap-1.5" title={s.hint}>
                <span className={cn("num text-[11px] font-medium", isOut ? "text-danger" : "text-text-muted")}>
                  {isOut ? "-" : ""}
                  {formatCompact(magnitude)}
                </span>
                <div
                  className={cn(
                    "w-full rounded-[6px] transition-opacity group-hover:opacity-80",
                    isTotal
                      ? "bg-text"
                      : isOut
                        ? "bg-[var(--expense)]"
                        : "bg-accent"
                  )}
                  style={{ height: h }}
                />
                <span className="line-clamp-2 h-8 max-w-[110px] text-center text-[10.5px] leading-tight text-text-faint">
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {!compact ? (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
          {steps.map((s) => (
            <li key={`${s.label}-row`} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-text-muted">
                {s.label}
                {s.hint ? <span className="ml-1.5 text-text-faint">- {s.hint}</span> : null}
              </span>
              <span className={cn("num", s.kind === "out" ? "text-danger" : "text-text")}>
                {s.kind === "out" ? "-" : ""}
                {formatRupiah(Math.abs(s.value))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Garis nilai dengan pita prakiraan. Dipakai untuk kas vs stok. */
export function LineWithBand({
  points,
  band,
  height = 220,
  label,
}: {
  points: { x: string; y: number }[];
  band?: { x: string; low: number; high: number }[];
  height?: number;
  label: string;
}) {
  if (points.length < 2) return null;
  const all = [...points.map((p) => p.y), ...(band ?? []).flatMap((b) => [b.low, b.high])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const w = 100;
  const toXY = (i: number, v: number) => {
    const x = (i / Math.max(1, points.length - 1)) * w;
    const y = height - ((v - min) / span) * (height - 20) - 10;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const line = points.map((p, i) => toXY(i, p.y)).join(" ");
  const bandPath =
    band && band.length > 1
      ? `${band.map((b, i) => toXY(i, b.high)).join(" ")} ${[...band].reverse().map((b, i) => toXY(band.length - 1 - i, b.low)).join(" ")}`
      : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${label}: dari ${formatCompact(points[0]?.y ?? 0)} ke ${formatCompact(points[points.length - 1]?.y ?? 0)}`}
      >
        {bandPath ? <polygon points={bandPath} fill="var(--accent)" opacity="0.12" /> : null}
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <line x1="0" y1={height - 10} x2={w} y2={height - 10} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] text-text-faint">
        <span>{points[0]?.x}</span>
        <span>{points[points.length - 1]?.x}</span>
      </div>
    </div>
  );
}
