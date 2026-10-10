"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  WarningOctagon,
  Warning,
  Info,
  X,
  ArrowRight,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useFrizzy, useCtx } from "@/lib/store";
import { detectLeaks, lowStockList } from "@/lib/metrics";
import { formatCompact, formatRupiah, relativeDays } from "@/lib/money";
import { Z } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  severity: "danger" | "warn" | "info";
  title: string;
  body: string;
  href: string;
  action?: string;
};

const SEEN_KEY = "frizzy-alerts-seen";

/**
 * Panel notifikasi. Isinya dihitung dari data yang sama dengan dashboard,
 * bukan hiasan: stok menipis, temuan kebocoran, utang jatuh tempo, selisih kas,
 * status runway, dan kegagalan pengiriman struk.
 */
export function NotificationBell() {
  const ctx = useCtx();
  const data = ctx.data;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      setSeen(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setSeen([]);
    }
  }, []);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    const k = ctx.kpis;

    if (k.runwayState === "critical") {
      out.push({
        id: "runway-critical",
        severity: "danger",
        title: `Runway kas ${Number.isFinite(k.runwayDays) ? Math.round(k.runwayDays) : 0} hari`,
        body: `True Burn ${formatRupiah(Math.abs(k.trueBurnPerDay))} per hari. Kas di bawah ambang aman.`,
        href: "/app/recovery",
        action: "Jalankan pemulihan",
      });
    } else if (k.runwayState === "watch") {
      out.push({
        id: "runway-watch",
        severity: "warn",
        title: `Runway kas ${Math.round(k.runwayDays)} hari`,
        body: "Masih di zona waspada. Tinjau prive dan belanja stok minggu ini.",
        href: "/app/recovery?tab=what-if",
        action: "Simulasikan",
      });
    }

    for (const l of detectLeaks(ctx).slice(0, 3)) {
      out.push({
        id: `leak-${l.id}`,
        severity: l.severity === "high" ? "danger" : l.severity === "medium" ? "warn" : "info",
        title: l.rule,
        body: `${formatCompact(l.impactPerMonth)}/bulan. ${l.action}`,
        href: l.href,
        action: "Lihat bukti",
      });
    }

    const low = lowStockList(ctx, 5);
    for (const m of low.slice(0, 2)) {
      out.push({
        id: `low-${m.product.id}`,
        severity: m.qty === 0 ? "danger" : "warn",
        title: `${m.product.name} ${m.qty === 0 ? "habis" : `sisa ${m.qty}`}`,
        body: `Titik pesan ulang ${m.product.reorderPoint}. Perkiraan habis dalam ${
          Number.isFinite(m.daysOfCover) ? Math.max(0, Math.round(m.daysOfCover)) : 0
        } hari.`,
        href: "/app/products",
        action: "Tambah stok",
      });
    }

    const dueSoon = data.purchaseOrders.filter(
      (po) => po.paidAt === null && Date.parse(po.dueDate) <= Date.parse(data.asOf) + 3 * 86_400_000
    );
    if (dueSoon.length > 0) {
      const total = dueSoon.reduce((s, po) => s + po.total, 0);
      out.push({
        id: "payables-due",
        severity: total > k.cashOnHand ? "danger" : "warn",
        title: `${dueSoon.length} tagihan supplier jatuh tempo 3 hari`,
        body: `Total ${formatRupiah(total)}. Kas tersedia ${formatRupiah(k.cashOnHand)}.`,
        href: "/app/purchasing?tab=utang",
        action: "Atur prioritas",
      });
    }

    if (Math.abs(k.shiftVarianceTotal) > data.profile.varianceThreshold) {
      out.push({
        id: "shift-variance",
        severity: "warn",
        title: "Selisih kas saat tutup shift",
        body: `Total selisih ${formatRupiah(k.shiftVarianceTotal)} pada periode ini. Batas toleransi ${formatRupiah(
          data.profile.varianceThreshold
        )}.`,
        href: "/app/shifts",
        action: "Periksa shift",
      });
    }

    const failedReceipts = data.receiptDeliveries.filter((r) => r.status === "failed");
    if (failedReceipts.length > 0) {
      out.push({
        id: "receipt-failed",
        severity: "info",
        title: `${failedReceipts.length} struk email gagal terkirim`,
        body: "Kirim ulang dari riwayat penjualan agar pelanggan tetap menerima bukti pembelian.",
        href: "/app/sales",
        action: "Buka penjualan",
      });
    }

    const pendingReviews = data.reviewRequests.filter((r) => r.clickedAt === null).length;
    if (pendingReviews > 0) {
      out.push({
        id: "reviews-pending",
        severity: "info",
        title: `${pendingReviews} tautan ulasan belum diklik`,
        body: `Tingkat klik saat ini ${k.reviewClickRatePct.toFixed(1)}% dari ${k.reviewRequestsSent} permintaan terkirim.`,
        href: "/app/reports",
        action: "Lihat laporan",
      });
    }

    const openTasks = data.recoveryTasks.filter((t) => t.status === "open");
    if (openTasks.length > 0) {
      out.push({
        id: "tasks-open",
        severity: "info",
        title: `${openTasks.length} tugas pemulihan terbuka`,
        body: `Dampak gabungan ${formatCompact(openTasks.reduce((s, t) => s + t.impactPerMonth, 0))} per bulan bila selesai.`,
        href: "/app/recovery?tab=playbook",
        action: "Buka playbook",
      });
    }

    return out;
  }, [ctx, data]);

  const unseen = alerts.filter((a) => !seen.includes(a.id));
  const urgent = alerts.filter((a) => a.severity !== "info").length;

  const markAllSeen = () => {
    const ids = alerts.map((a) => a.id);
    setSeen(ids);
    try {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    } catch {
      /* penyimpanan bisa diblokir; penanda tetap berlaku untuk sesi ini */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="notification-bell"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unseen.length > 0 ? `Notifikasi, ${unseen.length} belum dibaca` : "Notifikasi, tidak ada yang baru"
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Bell size={19} weight={unseen.length > 0 ? "fill" : "regular"} />
        {unseen.length > 0 ? (
          <span
            className={cn(
              "num absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
              urgent > 0 ? "bg-danger text-white" : "bg-accent text-on-accent"
            )}
          >
            {unseen.length > 9 ? "9+" : unseen.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: Z.dropdown }}
            onMouseDown={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Notifikasi"
            className="fixed left-1/2 top-16 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[20px] border border-border bg-surface shadow-overlay md:absolute md:left-auto md:right-0 md:top-11 md:translate-x-0"
            style={{ zIndex: Z.drawer }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-[14px] font-semibold text-text">Notifikasi</p>
                <p className="num text-[11.5px] text-text-faint">
                  {alerts.length} aturan aktif - data sampai {relativeDays(data.asOf, data.asOf)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unseen.length > 0 ? (
                  <button
                    type="button"
                    onClick={markAllSeen}
                    className="rounded-[10px] px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft"
                  >
                    Tandai terbaca
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-accent">
                    <CheckCircle size={13} weight="fill" /> Semua terbaca
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup notifikasi"
                  className="rounded p-1.5 text-text-faint hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <ul className="scroll-y max-h-[58vh] divide-y divide-border">
              {alerts.map((a) => {
                const Icon = a.severity === "danger" ? WarningOctagon : a.severity === "warn" ? Warning : Info;
                const isNew = !seen.includes(a.id);
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      onClick={() => setOpen(false)}
                      className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2", isNew && "bg-surface-2/60")}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          a.severity === "danger"
                            ? "bg-danger-soft text-danger"
                            : a.severity === "warn"
                              ? "bg-warning-soft text-warning"
                              : "bg-info-soft text-info"
                        )}
                      >
                        <Icon size={15} weight="fill" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold leading-snug text-text">{a.title}</span>
                          {isNew ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" /> : null}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-text-muted">{a.body}</span>
                        {a.action ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent">
                            {a.action}
                            <ArrowRight size={11} weight="bold" />
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <span className="text-[11.5px] text-text-faint">
                {urgent > 0 ? `${urgent} notifikasi butuh tindakan` : "Tidak ada yang mendesak"}
              </span>
              <Link
                href="/app/recovery"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
              >
                Cash Recovery <ArrowRight size={12} weight="bold" />
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
