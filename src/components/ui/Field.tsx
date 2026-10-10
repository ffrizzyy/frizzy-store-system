"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FieldShellProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
  className?: string;
};

export function FieldShell({ label, hint, error, children, className }: FieldShellProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-[13px] font-medium text-text">
        {label}
      </label>
      {children({ inputId, describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-[12px] leading-snug text-text-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlBase =
  "w-full rounded-[10px] border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint transition-colors focus:border-accent focus:outline-none disabled:opacity-50";

export type InputProps = { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, ...rest },
  ref
) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy }) => (
        <input
          ref={ref}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(controlBase, error ? "border-danger" : "border-border-strong", "num", className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

export type SelectProps = { label: string; hint?: ReactNode; error?: string | null; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, children, ...rest },
  ref
) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy }) => (
        <select
          ref={ref}
          id={inputId}
          aria-describedby={describedBy}
          className={cn(controlBase, error ? "border-danger" : "border-border-strong", className)}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
});

export type TextareaProps = { label: string; hint?: ReactNode; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, ...rest },
  ref
) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy }) => (
        <textarea
          ref={ref}
          id={inputId}
          aria-describedby={describedBy}
          className={cn(controlBase, error ? "border-danger" : "border-border-strong", "min-h-[88px] resize-y", className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

/** Input uang: hanya digit, tampil dengan pemisah ribuan. */
export function MoneyInput({
  label,
  value,
  onValueChange,
  hint,
  error,
  suffix = "Rp",
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy }) => (
        <div className="relative">
          <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-text-faint">
            {suffix}
          </span>
          <input
            id={inputId}
            aria-describedby={describedBy}
            inputMode="numeric"
            value={value === 0 ? "" : value.toLocaleString("id-ID")}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              onValueChange(digits ? Number.parseInt(digits, 10) : 0);
            }}
            placeholder="0"
            className={cn(controlBase, "num pl-9", error ? "border-danger" : "border-border-strong")}
          />
        </div>
      )}
    </FieldShell>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  const inputId = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border-border-strong text-accent accent-[var(--accent)]"
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-[13px] font-medium text-text">
          {label}
        </label>
        {hint ? <p className="text-[12px] leading-snug text-text-faint">{hint}</p> : null}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onValueChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onValueChange: (value: number) => void;
  hint?: ReactNode;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-medium text-text">
          {label}
        </label>
        <span className="num text-[13px] font-medium text-accent">
          {value > 0 && min < 0 ? "+" : ""}
          {value.toLocaleString("id-ID")}
          {suffix}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--accent)]"
      />
      {hint ? <p className="text-[12px] leading-snug text-text-faint">{hint}</p> : null}
    </div>
  );
}
