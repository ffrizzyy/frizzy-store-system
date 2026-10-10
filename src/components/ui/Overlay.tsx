"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { Z } from "@/lib/constants";
import { Button } from "./Button";

/** Dialog/panel sederhana dengan Escape, klik latar, dan fokus awal. */
export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "modal",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "modal" | "drawer";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = {
    sm: "max-w-[420px]",
    md: "max-w-[560px]",
    lg: "max-w-[760px]",
    xl: "max-w-[1040px]",
  }[size];

  return (
    <div
      className="fixed inset-0 flex bg-[rgb(9_9_11_/_0.5)] backdrop-blur-[2px]"
      style={{ zIndex: Z.modal }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn(
          "m-auto flex max-h-[92dvh] w-[calc(100%-2rem)] flex-col border border-border bg-surface shadow-overlay",
          variant === "drawer"
            ? "ml-auto mr-0 h-[100dvh] max-h-[100dvh] w-[min(560px,100%-1rem)] rounded-l-[20px] rounded-r-none"
            : "rounded-[20px]",
          variant === "modal" && width
        )}
        style={variant === "drawer" ? { zIndex: Z.drawer } : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-tight text-text">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-text-muted">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </Button>
        </div>
        <div className="scroll-y min-h-0 flex-1 px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-border px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; badge?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("scroll-x flex items-center gap-1 border-b border-border", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-accent text-text"
                : "border-transparent text-text-muted hover:border-border-strong hover:text-text"
            )}
          >
            {t.label}
            {t.badge !== undefined ? (
              <span className="num rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-muted">{t.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
