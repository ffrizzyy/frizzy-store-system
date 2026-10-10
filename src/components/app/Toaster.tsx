"use client";

import { CheckCircle, Info, Warning, WarningOctagon, X } from "@phosphor-icons/react/dist/ssr";
import { useFrizzy } from "@/lib/store";
import { Z } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useFrizzy((s) => s.toasts);
  const dismiss = useFrizzy((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-20 right-4 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-5"
      style={{ zIndex: Z.toast }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = t.tone === "ok" ? CheckCircle : t.tone === "warn" ? Warning : t.tone === "danger" ? WarningOctagon : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "fade-in pointer-events-auto flex items-start gap-3 rounded-[16px] border bg-surface px-4 py-3 shadow-overlay",
              t.tone === "ok"
                ? "border-accent/35"
                : t.tone === "warn"
                  ? "border-warning/35"
                  : t.tone === "danger"
                    ? "border-danger/35"
                    : "border-border"
            )}
          >
            <Icon
              size={18}
              weight="fill"
              className={cn(
                "mt-0.5 shrink-0",
                t.tone === "ok" ? "text-accent" : t.tone === "warn" ? "text-warning" : t.tone === "danger" ? "text-danger" : "text-info"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text">{t.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{t.body}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-1 text-text-faint hover:text-text"
              aria-label="Tutup notifikasi"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
