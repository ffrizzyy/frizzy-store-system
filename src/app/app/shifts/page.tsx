"use client";

/* ============================================================================
   /app/shifts - kas laci per shift: shift berjalan, tutup shift dengan
   hitung denominasi, riwayat selisih, dan tren selisih kas.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";
import { DataRow, Kpi, Sparkline } from "@/components/ui/Kpi";
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatTime,
} from "@/lib/money";
import { useFrizzy } from "@/lib/store";
import type { Dataset, ID, Rupiah, Shift } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ tipe */

type Denomination = { value: Rupiah; label: string };

const DENOMINATIONS: Denomination[] = [
  { value: 100_000, label: "Rp 100.000" },
  { value: 50_000, label: "Rp 50.000" },
  { value: 20_000, label: "Rp 20.000" },
  { value: 10_000, label: "Rp 10.000" },
  { value: 5_000, label: "Rp 5.000" },
  { value: 2_000, label: "Rp 2.000" },
  { value: 1_000, label: "Rp 1.000" },
  { value: 500, label: "Rp 500" },
  { value: 100, label: "Koin (Rp 100)" },
];

type ShiftFacts = {
  inflow: Rupiah;
  outflow: Rupiah;
  expectedCash: Rupiah;
  netFlow: Rupiah;
  saleCount: number;
};

/* ------------------------------------------------------------------ bantu */

function emptyCounts(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of DENOMINATIONS) out[d.value] = 0;
  return out;
}

function varianceTone(selisih: number, threshold: number): "ok" | "warn" | "danger" {
  const abs = Math.abs(selisih);
  if (abs === 0) return "ok";
  if (abs > threshold) return "danger";
  return "warn";
}

function varianceLabel(selisih: number, threshold: number): string {
  const abs = Math.abs(selisih);
  if (abs === 0) return "Cocok";
  if (abs > threshold) return "Butuh persetujuan";
  return "Selisih kecil";
}

function shiftFacts(data: Dataset, shift: Shift): ShiftFacts {
  const drawerTx = data.cashTransactions.filter(
    (c) => c.accountId === "acc_drawer" && Date.parse(c.occurredAt) >= Date.parse(shift.openedAt)
  );
  const inflow = drawerTx.filter((c) => c.direction === "in").reduce((s, c) => s + c.amount, 0);
  const outflow = drawerTx.filter((c) => c.direction === "out").reduce((s, c) => s + c.amount, 0);
  const saleCount = data.sales.filter((s) => s.shiftId === shift.id && s.status !== "void").length;
  return {
    inflow,
    outflow,
    expectedCash: shift.openingFloat + inflow - outflow,
    netFlow: inflow - outflow,
    saleCount,
  };
}

/* -------------------------------------------------------- shift berjalan */

function CurrentShiftCard({
  data,
  shift,
  facts,
  threshold,
}: {
  data: Dataset;
  shift: Shift;
  facts: ShiftFacts;
  threshold: Rupiah;
}) {
  const running = shift.closedAt === null;
  const user = data.users.find((u) => u.id === shift.userId) ?? null;

  return (
    <Card>
      <CardHeader
        title="Shift berjalan"
        hint={running ? "Laci belum dihitung. Kas seharusnya bertambah setiap penjualan tunai dan berkurang setiap kas keluar." : "Shift terakhir sudah ditutup."}
        action={
          <Badge tone={running ? "warn" : "ok"}>{running ? "Berjalan" : `Ditutup ${shift.closedAt ? formatDateTime(shift.closedAt) : ""}`}</Badge>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Kasir" value={user?.name ?? "Kasir tak dikenal"} format="text" hint={user ? `Peran ${user.role}` : undefined} />
          <Kpi
            label="Float awal"
            value={shift.openingFloat}
            hint={`Dibuka ${formatDateTime(shift.openedAt)}`}
          />
          <Kpi
            label="Kas seharusnya"
            value={facts.expectedCash}
            tone={Math.abs(shift.variance ?? 0) > threshold ? "danger" : "neutral"}
            hint="Float awal + kas masuk laci - kas keluar laci sejak jam buka"
          />
          <Kpi label="Transaksi pada shift ini" value={facts.saleCount} format="number" subject="struk" />
        </div>

        <div>
          <DataRow label="Waktu buka" value={formatDateTime(shift.openedAt)} />
          <DataRow label="Kas masuk laci" value={formatRupiah(facts.inflow)} />
          <DataRow label="Kas keluar laci" value={formatRupiah(facts.outflow)} />
          <DataRow label="Arus bersih laci" value={formatRupiah(facts.netFlow)} strong />
          {!running ? (
            <>
              <DataRow label="Kas dihitung" value={shift.countedCash === null ? "-" : formatRupiah(shift.countedCash)} />
              <DataRow
                label="Selisih saat tutup"
                value={shift.variance === null ? "-" : formatRupiah(shift.variance)}
                hint={`Ambang selisih konter ${formatRupiah(threshold)}`}
                strong
              />
              <DataRow label="Alasan selisih" value={shift.varianceReason || "-"} />
            </>
          ) : null}
        </div>

        {running ? (
          <CloseShiftForm data={data} shift={shift} expectedCash={facts.expectedCash} threshold={threshold} />
        ) : (
          <Alert tone="info" title="Tidak ada shift yang sedang berjalan">
            Buka shift baru dari halaman POS saat kasir mulai bekerja. Halaman ini akan menghitung kas seharusnya secara
            otomatis begitu shift dibuka.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------- form tutup shift */

function CloseShiftForm({
  data,
  shift,
  expectedCash,
  threshold,
}: {
  data: Dataset;
  shift: Shift;
  expectedCash: Rupiah;
  threshold: Rupiah;
}) {
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const userId = useFrizzy((s) => s.userId);

  const [counts, setCounts] = useState<Record<number, number>>(() => emptyCounts());
  const [reason, setReason] = useState("");

  const countedCash = useMemo(
    () => DENOMINATIONS.reduce((sum, d) => sum + d.value * (counts[d.value] ?? 0), 0),
    [counts]
  );
  const variance = countedCash - expectedCash;
  const needsApproval = countedCash > 0 && Math.abs(variance) > threshold;
  const actorId: ID = userId ?? shift.userId;

  const setCount = (value: Rupiah, next: number) => {
    setCounts((prev) => ({ ...prev, [value]: Math.max(0, Math.round(next)) }));
  };

  const doClose = () => {
    mutate({ type: "close_shift", shiftId: shift.id, countedCash, reason, actorId });
    toast({
      title: "Shift ditutup",
      body: `Kas dihitung ${formatRupiah(countedCash)} dengan selisih ${formatRupiah(variance)}.`,
      tone: Math.abs(variance) > threshold ? "warn" : "ok",
    });
    setCounts(emptyCounts());
    setReason("");
  };

  const submit = () => {
    if (countedCash <= 0) {
      toast({ title: "Kas dihitung masih nol", body: "Isi minimal satu pecahan sebelum menutup shift.", tone: "warn" });
      return;
    }
    // Bila selisih melewati ambang, jangan bersihkan formulir dulu: pemilik
    // mungkin membatalkan persetujuan dan kasir perlu menghitung ulang.
    if (needsApproval) {
      requestApproval({
        kind: "sensitive",
        message: `Selisih kas ${formatRupiah(variance)} melewati ambang ${formatRupiah(threshold)}. Butuh persetujuan pemilik.`,
        onApprove: doClose,
      });
      return;
    }
    doClose();
  };

  return (
    <div className="hairline flex flex-col gap-4 pt-4">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-text">Tutup shift</h3>
        <p className="mt-0.5 text-[13px] text-text-muted">
          Masukkan jumlah lembar tiap pecahan. Kas dihitung dan selisih dihitung otomatis.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DENOMINATIONS.map((d) => {
          const count = counts[d.value] ?? 0;
          return (
            <Input
              key={d.value}
              label={d.label}
              inputMode="numeric"
              value={count === 0 ? "" : String(count)}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                setCount(d.value, digits ? Number.parseInt(digits, 10) : 0);
              }}
              placeholder="0"
              hint={`${formatNumber(count)} lembar = ${formatNumber(d.value * count)}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-text-muted">
        <span className="num">
          Kas dihitung <span className="font-medium text-text">{formatRupiah(countedCash)}</span>
        </span>
        <span className="num">
          Kas seharusnya <span className="font-medium text-text">{formatRupiah(expectedCash)}</span>
        </span>
        <span className="num">
          Selisih{" "}
          <span className={cn("font-medium", variance === 0 ? "text-accent" : Math.abs(variance) > threshold ? "text-danger" : "text-warning")}>
            {formatRupiah(variance)}
          </span>
        </span>
      </div>

      <Textarea
        label="Catatan alasan selisih"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="mis. kembalian kurang Rp 5.000, tip kurir, atau salah input saat sibuk"
        hint="Wajib diisi bila selisih melewati ambang. Alasan ikut tersimpan bersama penutupan shift."
      />

      {needsApproval ? (
        <Alert tone="danger" title="Butuh persetujuan pemilik">
          Selisih {formatRupiah(variance)} melewati ambang {formatRupiah(threshold)}. Shift hanya bisa ditutup setelah
          pemilik menyetujui lewat permintaan persetujuan.
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={submit} disabled={countedCash <= 0}>
          Tutup shift
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setCounts(emptyCounts());
            setReason("");
          }}
        >
          Kosongkan hitungan
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function ShiftsPage() {
  const hydrate = useFrizzy((s) => s.hydrate);
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const reset = useFrizzy((s) => s.reset);
  const data = useFrizzy((s) => s.data);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <Alert
        tone="danger"
        title="Data shift gagal dimuat"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              void hydrate();
            }}
          >
            Coba lagi
          </Button>
        }
      >
        {error ?? "Data contoh tidak bisa diambil dari server. Periksa koneksi lalu ulangi."}
      </Alert>
    );
  }

  const lastShift = data.shifts[data.shifts.length - 1] ?? null;
  const facts = lastShift ? shiftFacts(data, lastShift) : null;
  const threshold = data.profile.varianceThreshold;

  const history = [...data.shifts]
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))
    .slice(0, 20);

  const recent = data.shifts
    .filter((s) => s.closedAt !== null && s.variance !== null)
    .filter((s) => Date.parse(data.asOf) - Date.parse(s.openedAt) <= 30 * 86_400_000)
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));

  const varianceSeries = recent.map((s) => s.variance ?? 0);
  const varianceTotal = recent.reduce((s, x) => s + (x.variance ?? 0), 0);
  const offShifts = recent.filter((s) => (s.variance ?? 0) !== 0).length;
  const offPct = recent.length === 0 ? 0 : (offShifts / recent.length) * 100;
  const userName = (id: ID): string => data.users.find((u) => u.id === id)?.name ?? "Kasir tak dikenal";

  return (
    <div className="flex flex-col gap-5">
      <SectionTitle
        eyebrow="Kontrol kas"
        title="Shift"
        hint="Selisih kas adalah kebocoran paling awal terlihat. Hitung laci setiap tutup shift dan catat alasannya, bukan hanya angkanya."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.shifts.some((s) => s.closedAt === null) ? "warn" : "ok"}>
              {data.shifts.some((s) => s.closedAt === null) ? "Ada shift terbuka" : "Semua shift tertutup"}
            </Badge>
            <Badge tone={Math.abs(varianceTotal) > threshold ? "danger" : "neutral"}>
              {`Total selisih 30 hari ${formatCompact(varianceTotal)}`}
            </Badge>
          </div>
        }
      />

      {lastShift && facts ? (
        <CurrentShiftCard data={data} shift={lastShift} facts={facts} threshold={threshold} />
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              title="Belum ada shift tercatat"
              body="Shift pertama akan muncul di sini setelah kasir membuka shift dari halaman POS."
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Tren selisih kas 30 hari"
          hint="Garis di atas nol berarti kas laci lebih banyak dari catatan, di bawah nol berarti kurang."
        />
        <CardBody className="flex flex-col gap-4">
          {varianceSeries.length < 2 ? (
            <EmptyState
              title="Belum cukup data untuk tren"
              body="Butuh minimal dua shift tertutup dalam 30 hari terakhir agar tren selisih kas bisa digambar."
            />
          ) : (
            <>
              <Sparkline values={varianceSeries} tone={Math.abs(varianceTotal) > threshold ? "danger" : "accent"} height={56} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi label="Shift tertutup 30 hari" value={recent.length} format="number" subject="shift" />
                <Kpi
                  label="Shift dengan selisih"
                  value={offPct}
                  format="percent"
                  tone={offPct > 40 ? "warn" : "neutral"}
                  hint={`${formatNumber(offShifts)} dari ${formatNumber(recent.length)} shift tidak nol`}
                />
                <Kpi
                  label="Total selisih"
                  value={varianceTotal}
                  tone={Math.abs(varianceTotal) > threshold ? "danger" : "ok"}
                  hint="Akumulasi selisih semua shift tertutup pada periode ini"
                />
              </div>
              <p className="measure text-[12.5px] leading-relaxed text-text-muted">
                Selisih kecil yang sering berulang jauh lebih berbahaya daripada satu selisih besar. Pola seperti itu
                biasanya berasal dari proses kembalian, bukan dari kecurangan, dan nilainya menumpuk menjadi kebocoran
                bulanan bila dibiarkan. Setiap selisih di atas {formatRupiah(threshold)} wajib punya alasan tertulis.
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Riwayat shift" hint="20 shift terakhir, terbaru di atas. Ambang selisih konter mengikuti pengaturan profil toko." />
        <CardBody>
          {history.length === 0 ? (
            <EmptyState title="Riwayat shift masih kosong" body="Setelah shift ditutup, barisnya akan muncul di tabel ini beserta selisih dan alasannya." />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <caption className="sr-only">
                  Riwayat dua puluh shift terakhir: tanggal, kasir, float, kas seharusnya, kas dihitung, selisih, dan alasan
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Tanggal</th>
                    <th scope="col" className="label-caps px-2 py-2">Kasir</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Float</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Seharusnya</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Dihitung</th>
                    <th scope="col" className="label-caps px-2 py-2">Selisih</th>
                    <th scope="col" className="label-caps px-2 py-2">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => {
                    const selisih = s.variance ?? 0;
                    return (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">
                          {formatDate(s.openedAt)}
                          <span className="ml-1 text-text-faint">{formatTime(s.openedAt)}</span>
                        </td>
                        <td className="px-2 py-2.5 text-[13px] text-text">{userName(s.userId)}</td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">{formatNumber(s.openingFloat)}</td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">
                          {s.expectedCash === null ? "-" : formatNumber(s.expectedCash)}
                        </td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text">
                          {s.countedCash === null ? "-" : formatNumber(s.countedCash)}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <Badge tone={varianceTone(selisih, threshold)}>
                              {`${selisih > 0 ? "+" : ""}${formatNumber(selisih)}`}
                            </Badge>
                            <span className="text-[11.5px] text-text-faint">{varianceLabel(selisih, threshold)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-[12.5px] text-text-muted">{s.varianceReason || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
