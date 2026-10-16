"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { formatCompact, formatRupiah } from "@/lib/money";
import { Sparkline } from "@/components/ui/Kpi";
import type { Headline } from "@/app/api/sample/headline/route";

/**
 * Widget Cash Runway di hero. Angka datang dari /api/sample/headline yang
 * memakai mesin metrik yang sama dengan dashboard.
 */
export function RunwayWidget() {
  const [h, setH] = useState<Headline | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/sample/headline", { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Headline;
        if (alive) setH(json);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="card px-5 py-6">
        <p className="text-[13px] text-text-muted">
          Angka konter tidak bisa dimuat. Buka{" "}
          <Link href="/data-konter" className="underline underline-offset-2">
            halaman data konter
          </Link>{" "}
          untuk detailnya.
        </p>
      </div>
    );
  }

  if (!h) {
    return (
      <div className="card space-y-3 px-5 py-6" aria-busy="true">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-9 w-52" />
        <div className="skeleton h-14 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
        </div>
      </div>
    );
  }

  const critical = h.state === "critical";
  const toneText = critical ? "text-danger" : h.state === "watch" ? "text-warning" : "text-accent";
  const toneBg = critical ? "bg-danger-soft" : h.state === "watch" ? "bg-warning-soft" : "bg-accent-soft";
  const dot = critical ? "bg-danger" : h.state === "watch" ? "bg-warning" : "bg-accent";

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="flex items-center gap-2">
          <span className={`live-dot inline-block h-2 w-2 rounded-full ${dot}`} />
          <span className="label-caps">Cash runway hari ini</span>
        </span>
        <span className="num text-[11px] text-text-faint">{h.days} hari terakhir</span>
      </div>

      <div className="px-5 py-5">
        <p className="text-[12px] text-text-muted">Kas di tangan</p>
        <p className="kpi-number mt-1 text-[36px] text-text md:text-[42px]">{formatRupiah(h.cash)}</p>

        <div className={`mt-4 rounded-[10px] ${toneBg} px-4 py-3`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-text-muted">Runway pada True Burn</span>
            <span className={`num text-[20px] font-semibold ${toneText}`}>
              {h.trueBurn >= 0 ? "positif" : `${Math.round(h.runway)} hari`}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-text-muted">
            True Burn {formatRupiah(Math.abs(h.trueBurn))} per hari {h.trueBurn < 0 ? "(kas menurun)" : "(kas bertambah)"}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="label-caps mb-1">Kas 90 hari</p>
            <Sparkline values={h.cashSeries} height={44} tone={critical ? "danger" : "accent"} />
          </div>
          <div>
            <p className="label-caps mb-1">Nilai stok 90 hari</p>
            <Sparkline values={h.inventorySeries} height={44} tone="muted" />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-4">
          <Metric label="Stok mati" value={formatCompact(h.deadStock)} tone={h.deadShare > 20 ? "danger" : "warn"} />
          <Metric
            label="Belanja stok vs HPP"
            value={`${(h.replenishment * 100).toFixed(0)}%`}
            tone={h.replenishment < 1 ? "danger" : "ok"}
          />
          <Metric label="Temuan kebocoran" value={`${h.leakCount} aturan`} tone="warn" />
          <Metric label="Prive 30 hari" value={formatCompact(h.drawMonthly)} tone={h.drawMonthly > h.drawCap ? "danger" : "ok"} />
        </dl>

        <p className="mt-3 text-[11.5px] leading-snug text-text-faint">
          Potensi kebocoran terdeteksi {formatCompact(h.leakImpact)} per bulan, dihitung dari aturan yang sama dengan Leak
          Detector.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/data-konter"
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            Lihat data konter
            <ArrowRight size={16} weight="bold" />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-faint">
            <ShieldCheck size={14} /> Dihitung dari catatan penjualan, stok, dan kas konter
          </span>
        </div>
      </div>

      {critical ? (
        <div className="flex items-start gap-2 border-t border-danger/25 bg-danger-soft px-5 py-3 text-[12px] text-danger">
          <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
          Runway di bawah 30 hari. Tanpa perubahan, kas habis sebelum akhir bulan depan.
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" }) {
  const cls = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warning" : "text-text";
  return (
    <div>
      <dt className="text-[11.5px] text-text-muted">{label}</dt>
      <dd className={`num mt-0.5 text-[15px] font-semibold ${cls}`}>{value}</dd>
    </div>
  );
}
