import type { ReactNode } from "react";
import {
  CheckCircle,
  Info,
  Warning,
  WarningOctagon,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  ok: "bg-accent-soft text-accent border-accent/25",
  warn: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  info: "bg-info-soft text-info border-info/25",
  neutral: "bg-surface-2 text-text-muted border-border",
};

export function Badge({
  tone = "neutral",
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        toneClass[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  const color =
    tone === "ok" ? "bg-accent" : tone === "warn" ? "bg-warning" : tone === "danger" ? "bg-danger" : tone === "info" ? "bg-info" : "bg-text-faint";
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", color)} aria-hidden="true" />;
}

/** Angka dengan arah perubahan. Tidak pernah hanya warna: selalu ada ikon. */
export function Delta({ value, suffix = "%", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.05;
  const Icon = neutral ? Info : value > 0 ? TrendUp : TrendDown;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 text-[12px] font-medium",
        neutral ? "text-text-faint" : positive ? "text-accent" : "text-danger"
      )}
    >
      <Icon size={13} weight="bold" />
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

const alertTone: Record<Tone, { icon: ReactNode; cls: string }> = {
  ok: { icon: <CheckCircle size={18} weight="fill" />, cls: "border-accent/30 bg-accent-soft text-accent" },
  warn: { icon: <Warning size={18} weight="fill" />, cls: "border-warning/30 bg-warning-soft text-warning" },
  danger: { icon: <WarningOctagon size={18} weight="fill" />, cls: "border-danger/30 bg-danger-soft text-danger" },
  info: { icon: <Info size={18} weight="fill" />, cls: "border-info/30 bg-info-soft text-info" },
  neutral: { icon: <Info size={18} weight="fill" />, cls: "border-border bg-surface-2 text-text-muted" },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const conf = alertTone[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-[10px] border px-4 py-3", conf.cls)}>
      <span className="mt-0.5 shrink-0">{conf.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        {children ? <div className="mt-0.5 text-[13px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-text-faint">{icon}</div> : null}
      <div>
        <p className="text-[15px] font-semibold text-text">{title}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-relaxed text-text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}
