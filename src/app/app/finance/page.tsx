"use client";

/* ============================================================================
   /app/finance - pusat uang konter: kas, beban, prive, utang, piutang,
   prakiraan 13 minggu, anggaran, dan tutup bulan.
   Semua angka dihitung dari store (data + ctx) dan mutate() hanya lewat store.
   ========================================================================= */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, Delta, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Checkbox, Input, MoneyInput, Select } from "@/components/ui/Field";
import { DataRow, Kpi, MiniBar } from "@/components/ui/Kpi";
import { Tabs } from "@/components/ui/Overlay";
import { CashBridge, LineWithBand } from "@/components/charts/CashBridge";
import { CASH_CATEGORY_LABEL } from "@/lib/constants";
import { forecast13Weeks, buildCashBridge, type Context } from "@/lib/metrics";
import {
  daysBetween,
  formatCompact,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatMonth,
  formatNumber,
  formatPct,
  formatRupiah,
  pctChange,
} from "@/lib/money";
import { useFrizzy, type Role } from "@/lib/store";
import type { Dataset, ID, Rupiah } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ tipe */

type FinanceTab = "kas" | "beban" | "prive" | "utang" | "piutang" | "prakiraan" | "anggaran" | "tutup-bulan";

const FINANCE_TABS: { id: FinanceTab; label: string }[] = [
  { id: "kas", label: "Kas" },
  { id: "beban", label: "Beban" },
  { id: "prive", label: "Prive" },
  { id: "utang", label: "Utang" },
  { id: "piutang", label: "Piutang" },
  { id: "prakiraan", label: "Prakiraan" },
  { id: "anggaran", label: "Anggaran" },
  { id: "tutup-bulan", label: "Tutup Bulan" },
];

const DETAIL_CATEGORIES = ["rent", "salary", "utilities", "marketing", "other"] as const;
type DetailCategory = (typeof DETAIL_CATEGORIES)[number];

/* ------------------------------------------------------------------ bantu */

function categoryLabel(category: string): string {
  return CASH_CATEGORY_LABEL[category] ?? category;
}

function runwayStateLabel(state: Context["kpis"]["runwayState"]): string {
  if (state === "safe") return "Aman";
  if (state === "watch") return "Waspada";
  return "Kritis";
}

function runwaySentence(days: number): string {
  return Number.isFinite(days) ? `${Math.round(days)} hari` : "tak terbatas";
}

/** Umur piutang atau utang dalam hari kalender terhadap tanggal data. */
function ageDays(fromIso: string, asOfIso: string): number {
  return daysBetween(fromIso, asOfIso);
}

function bucketOf(days: number): "0-7" | "8-14" | "15-30" | ">30" {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return ">30";
}

const AGING_BUCKETS: ("0-7" | "8-14" | "15-30" | ">30")[] = ["0-7", "8-14", "15-30", ">30"];

function emptyAging(): Record<string, { total: Rupiah; count: number }> {
  const out: Record<string, { total: Rupiah; count: number }> = {};
  for (const b of AGING_BUCKETS) out[b] = { total: 0, count: 0 };
  return out;
}

/** Kas awal periode aktif: kas akhir hari terakhir dikurangi arus hari itu. */
function openingCashOfPeriod(ctx: Context): Rupiah {
  const first = ctx.daily[0];
  if (!first) return ctx.cashNow;
  return first.cashEod - first.cashIn + first.cashOut;
}

/* --------------------------------------------------- kartu akses terbatas */

function FinanceAccessCard() {
  return (
    <div className="mx-auto max-w-[640px] py-8">
      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="label-caps">Akses terbatas</div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Laporan finansial hanya untuk pemilik</h1>
          <p className="measure text-sm leading-relaxed text-text-muted">
            Halaman Keuangan memuat kas, beban, prive, utang, piutang, prakiraan, dan anggaran konter. Data ini hanya
            boleh dilihat pemilik karena menyangkut posisi kas dan keputusan harga.
          </p>
          <p className="measure text-sm leading-relaxed text-text-muted">
            Sebagai staf, Anda tetap bisa melihat ringkasan shift sendiri: float awal, kas seharusnya, kas dihitung, dan
            selisih kas saat tutup shift.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href="/app/shifts"
              className="inline-flex h-10 items-center rounded-[10px] border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              Buka ringkasan shift saya
            </a>
            <a
              href="/app"
              className="inline-flex h-10 items-center rounded-[10px] border border-transparent px-4 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              Kembali ke dashboard
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- tab: kas */

function KasTab({ data, ctx }: { data: Dataset; ctx: Context }) {
  const [accountId, setAccountId] = useState("all");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(150);

  const asOfMs = Date.parse(data.asOf);

  const balances = useMemo(() => {
    return data.accounts.map((account) => {
      const movement = data.cashTransactions
        .filter((c) => c.accountId === account.id && Date.parse(c.occurredAt) <= asOfMs)
        .reduce((sum, c) => sum + (c.direction === "in" ? c.amount : -c.amount), 0);
      return { account, balance: account.openingBalance + movement };
    });
  }, [data.accounts, data.cashTransactions, asOfMs]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of data.cashTransactions) set.add(c.category);
    return [...set].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "id"));
  }, [data.cashTransactions]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.cashTransactions
      .filter((c) => {
        if (accountId !== "all" && c.accountId !== accountId) return false;
        if (direction !== "all" && c.direction !== direction) return false;
        if (category !== "all" && c.category !== category) return false;
        if (needle) {
          const haystack = `${c.label} ${c.refId ?? ""} ${categoryLabel(c.category)} ${c.refType}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  }, [data.cashTransactions, accountId, direction, category, search]);

  const visible = filtered.slice(0, limit);
  const bridge = buildCashBridge(ctx, 30);
  const totalIn = filtered.filter((c) => c.direction === "in").reduce((s, c) => s + c.amount, 0);
  const totalOut = filtered.filter((c) => c.direction === "out").reduce((s, c) => s + c.amount, 0);

  const accountName = (id: ID): string => data.accounts.find((a) => a.id === id)?.label ?? "Akun tak dikenal";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {balances.map(({ account, balance }) => (
          <Kpi
            key={account.id}
            label={account.label}
            value={balance}
            hint={`Saldo awal ${formatRupiah(account.openingBalance)} + seluruh mutasi sampai ${formatDate(data.asOf)}`}
          />
        ))}
        <Kpi
          label="Kas awal periode"
          value={openingCashOfPeriod(ctx)}
          hint={`Posisi kas sebelum ${formatDate(ctx.daily[0]?.date ?? data.startDate)}`}
        />
      </div>

      <Card>
        <CardHeader
          title="Cash bridge 30 hari"
          hint="Setiap batang adalah satu sebab perubahan kas. Belanja stok tidak hilang, ia berubah bentuk menjadi persediaan."
        />
        <CardBody>
          <CashBridge steps={bridge} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ledger kas"
          hint={`${formatNumber(filtered.length)} baris cocok dengan filter. Menampilkan ${formatNumber(visible.length)} baris.`}
        />
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Select label="Akun" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="all">Semua akun</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
            <Select
              label="Arah"
              value={direction}
              onChange={(e) => setDirection(e.target.value === "in" ? "in" : e.target.value === "out" ? "out" : "all")}
            >
              <option value="all">Masuk dan keluar</option>
              <option value="in">Kas masuk</option>
              <option value="out">Kas keluar</option>
            </Select>
            <Select label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">Semua kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </Select>
            <Input
              label="Cari label atau referensi"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="mis. struk, supplier, prive"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-text-muted">
            <span className="num">
              Masuk <span className="font-medium text-accent">{formatRupiah(totalIn)}</span>
            </span>
            <span className="num">
              Keluar <span className="font-medium text-text">{formatRupiah(totalOut)}</span>
            </span>
            <span className="num">
              Netto <span className="font-medium text-text">{formatRupiah(totalIn - totalOut)}</span>
            </span>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="Tidak ada transaksi kas yang cocok"
              body="Longgarkan filter akun, arah, kategori, atau kata kunci untuk melihat baris lain di ledger kas."
            />
          ) : (
            <div className="scroll-x -mx-1">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <caption className="sr-only">
                  Ledger kas konter: waktu, akun, arah, jumlah, kategori, label, dan referensi transaksi
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Waktu</th>
                    <th scope="col" className="label-caps px-2 py-2">Akun</th>
                    <th scope="col" className="label-caps px-2 py-2">Arah</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Jumlah</th>
                    <th scope="col" className="label-caps px-2 py-2">Kategori</th>
                    <th scope="col" className="label-caps px-2 py-2">Label</th>
                    <th scope="col" className="label-caps px-2 py-2">Referensi</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">{formatDateTime(c.occurredAt)}</td>
                      <td className="px-2 py-2.5 text-[13px] text-text">{accountName(c.accountId)}</td>
                      <td className="px-2 py-2.5 text-[13px]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={c.direction === "in" ? "text-accent" : "text-text"}>
                            {c.direction === "in" ? "↑ Masuk" : "↓ Keluar"}
                          </span>
                        </span>
                      </td>
                      <td
                        className={cn(
                          "num px-2 py-2.5 text-right text-[13px]",
                          c.direction === "in" ? "text-accent" : "text-text"
                        )}
                      >
                        {c.direction === "in" ? "+" : "-"}
                        {formatNumber(c.amount)}
                      </td>
                      <td className="px-2 py-2.5 text-[13px] text-text-muted">{categoryLabel(c.category)}</td>
                      <td className="px-2 py-2.5 text-[13px] text-text">{c.label}</td>
                      <td className="num px-2 py-2.5 text-[12px] text-text-faint">
                        {c.refType}
                        {c.refId ? ` · ${c.refId}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > visible.length ? (
            <Button variant="secondary" onClick={() => setLimit((n) => n + 150)}>
              Muat 150 baris lagi
            </Button>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- tab: beban */

function BebanTab({ data, actorId }: { data: Dataset; actorId: ID }) {
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);

  const [category, setCategory] = useState<DetailCategory>("rent");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const expenses = useMemo(
    () => data.expenses.filter((e) => e.category !== "owner_draw"),
    [data.expenses]
  );

  const months = useMemo(() => {
    const map = new Map<string, typeof expenses>();
    for (const e of expenses) {
      const key = (e.paidAt ?? e.dueDate).slice(0, 7);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [expenses]);

  const byCategory = useMemo(() => {
    const map = new Map<string, Rupiah>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const maxCategory = byCategory[0]?.[1] ?? 0;
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);

  const submit = () => {
    if (amount <= 0) {
      setError("Jumlah beban harus lebih besar dari nol.");
      return;
    }
    setError(null);
    mutate({ type: "add_expense", category, amount, note, actorId });
    toast({
      title: "Beban tercatat",
      body: `${categoryLabel(category)} ${formatRupiah(amount)} masuk ke ledger kas dan daftar beban.`,
      tone: "ok",
    });
    setAmount(0);
    setNote("");
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Beban per kategori"
          hint={`Total beban tercatat di luar prive: ${formatRupiah(totalAll)}. Batang menunjukkan porsi terhadap kategori terbesar.`}
        />
        <CardBody className="flex flex-col gap-3">
          {byCategory.length === 0 ? (
            <EmptyState title="Belum ada beban" body="Catat beban pertama lewat formulir di bawah." />
          ) : (
            byCategory.map(([cat, total]) => (
              <div key={cat} className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-text">{categoryLabel(cat)}</div>
                  <div className="mt-1">
                    <MiniBar value={total} max={maxCategory} />
                  </div>
                </div>
                <div className="num shrink-0 text-right text-[13px] text-text">{formatRupiah(total)}</div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Catat beban" hint="Beban langsung mengurangi kas dan menambah True Burn harian." />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Select
            label="Kategori"
            value={category}
            onChange={(e) => {
              const next = DETAIL_CATEGORIES.find((c) => c === e.target.value);
              setCategory(next ?? "other");
            }}
          >
            {DETAIL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
          <MoneyInput
            label="Jumlah"
            value={amount}
            onValueChange={setAmount}
            error={error}
            hint="Hanya digit. Pemisah ribuan otomatis."
          />
          <Input label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. token listrik Februari" />
          <div className="md:col-span-3">
            <Button variant="primary" onClick={submit}>
              Simpan beban
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Detail beban per bulan" hint="Dikelompokkan dari tanggal bayar, jatuh tempo dipakai bila belum dibayar." />
        <CardBody className="flex flex-col gap-6">
          {months.length === 0 ? (
            <EmptyState title="Belum ada beban tercatat" body="Beban yang Anda catat akan muncul di sini, dikelompokkan per bulan." />
          ) : (
            months.map(([month, list]) => {
              const monthTotal = list.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={month} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-[14px] font-semibold text-text">{formatMonth(`${month}-01T00:00:00.000Z`)}</h3>
                    <span className="num text-[13px] text-text-muted">{formatRupiah(monthTotal)}</span>
                  </div>
                  <div className="scroll-x">
                    <table className="w-full min-w-[620px] border-collapse text-left">
                      <caption className="sr-only">Detail beban bulan {month}</caption>
                      <thead>
                        <tr className="border-b border-border">
                          <th scope="col" className="label-caps px-2 py-2">Tanggal</th>
                          <th scope="col" className="label-caps px-2 py-2">Kategori</th>
                          <th scope="col" className="label-caps px-2 py-2 text-right">Jumlah</th>
                          <th scope="col" className="label-caps px-2 py-2">Catatan</th>
                          <th scope="col" className="label-caps px-2 py-2">Lampiran</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((e) => (
                          <tr key={e.id} className="border-b border-border last:border-0">
                            <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">
                              {formatDate(e.paidAt ?? e.dueDate)}
                            </td>
                            <td className="px-2 py-2.5 text-[13px] text-text">{categoryLabel(e.category)}</td>
                            <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(e.amount)}</td>
                            <td className="px-2 py-2.5 text-[13px] text-text-muted">{e.note || "-"}</td>
                            <td className="px-2 py-2.5 text-[13px]">
                              <Badge tone={e.attachment ? "ok" : "neutral"}>{e.attachment ? "Ada" : "Tidak ada"}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- tab: prive */

function PriveTab({ data, ctx, actorId }: { data: Dataset; ctx: Context; actorId: ID }) {
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);
  const [cap, setCap] = useState(data.profile.ownerDrawMonthlyCap);

  const window30 = ctx.daily.slice(-30);
  const draws30 = window30.reduce((s, d) => s + d.draws, 0);
  const monthlyCap = data.profile.ownerDrawMonthlyCap;
  const ratio = monthlyCap === 0 ? 0 : (draws30 / monthlyCap) * 100;
  const over = draws30 > monthlyCap;

  let running = 0;
  const dailyRows = window30
    .filter((d) => d.draws > 0)
    .map((d) => {
      running += d.draws;
      return { date: d.date, amount: d.draws, cumulative: running };
    })
    .reverse();

  const save = () => {
    if (cap <= 0) {
      toast({ title: "Batas tidak valid", body: "Batas prive bulanan harus lebih besar dari nol.", tone: "warn" });
      return;
    }
    mutate({ type: "set_draw_cap", amount: cap, actorId });
    toast({
      title: "Batas prive diperbarui",
      body: `Batas bulanan menjadi ${formatRupiah(cap)}. Setiap Rp 1 juta per bulan memangkas True Burn sekitar Rp 33 ribu per hari.`,
      tone: "ok",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Prive 30 hari" value={draws30} tone={over ? "danger" : "neutral"} />
        <Kpi label="Batas bulanan" value={monthlyCap} />
        <Kpi
          label="Pemakaian batas"
          value={ratio}
          format="percent"
          tone={over ? "danger" : ratio > 80 ? "warn" : "ok"}
        />
        <Kpi
          label="Dampak True Burn"
          value={Math.round(draws30 / 30)}
          subject="/hari"
          hint="Prive bukan beban usaha, tetapi tetap menguras kas setiap hari."
        />
      </div>

      <Card>
        <CardHeader
          title="Prive 30 hari terhadap batas bulanan"
          hint="Prive pemilik adalah pengambilan kas, bukan beban. Tetap dihitung penuh di True Burn."
        />
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="num text-[13px] text-text">{formatRupiah(draws30)}</span>
            <span className="num text-[13px] text-text-muted">dari {formatRupiah(monthlyCap)}</span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={`Pemakaian batas prive ${formatPct(ratio, 1)} dari batas bulanan`}
          >
            {ratio > 0 ? (
              <div
                className={cn("h-2.5 rounded-full", over ? "bg-danger" : "bg-accent")}
                style={{ width: `${Math.min(100, Math.max(1, ratio))}%` }}
              />
            ) : null}
          </div>
          <p className="text-[12px] text-text-faint">
            Angka di atas 100% berarti prive 30 hari terakhir sudah melewati batas bulanan yang Anda tetapkan.
          </p>
          {over ? (
            <Alert tone="danger" title="Prive melewati batas bulanan">
              Kelebihan {formatRupiah(draws30 - monthlyCap)} dari batas {formatRupiah(monthlyCap)}. Setiap Rp 1 juta
              per bulan yang dipangkas memangkas True Burn sekitar Rp 33 ribu per hari, yang langsung menambah runway.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ubah batas prive bulanan" hint="Batas ini dipakai mesin pemulihan kas untuk menghitung True Burn dan runway." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <MoneyInput
            label="Batas prive bulanan"
            value={cap}
            onValueChange={setCap}
            hint="Setiap Rp 1 juta per bulan memangkas True Burn sekitar Rp 33 ribu per hari."
          />
          <div className="flex items-end">
            <Button variant="primary" onClick={save}>
              Simpan batas
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Prive harian 30 hari terakhir" hint="Hanya hari dengan prive yang ditampilkan, akumulasi dihitung mundur dari hari tertua." />
        <CardBody>
          {dailyRows.length === 0 ? (
            <EmptyState title="Tidak ada prive 30 hari terakhir" body="Bagus. Pemilik belum mengambil kas untuk keperluan pribadi pada periode ini." />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <caption className="sr-only">Prive harian 30 hari terakhir beserta akumulasinya</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Tanggal</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Jumlah</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Akumulasi</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr key={row.date} className="border-b border-border last:border-0">
                      <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">{formatDayMonth(row.date)}</td>
                      <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(row.amount)}</td>
                      <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">
                        {formatNumber(row.cumulative)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- tab: utang */

function UtangTab({ data }: { data: Dataset }) {
  const unpaid = data.purchaseOrders.filter((po) => po.paidAt === null);
  const paid = data.purchaseOrders
    .filter((po) => po.paidAt !== null)
    .sort((a, b) => Date.parse(b.paidAt ?? b.orderedAt) - Date.parse(a.paidAt ?? a.orderedAt))
    .slice(0, 10);

  const aging = emptyAging();
  for (const po of unpaid) {
    const key = bucketOf(Math.max(0, ageDays(po.dueDate, data.asOf)));
    const bucket = aging[key];
    if (bucket) {
      bucket.total += po.total;
      bucket.count += 1;
    }
  }

  const supplierName = (id: ID): string => data.suppliers.find((s) => s.id === id)?.name ?? "Supplier tak dikenal";
  const totalUnpaid = unpaid.reduce((s, po) => s + po.total, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {AGING_BUCKETS.map((b) => {
          const bucket = aging[b] ?? { total: 0, count: 0 };
          return (
            <Kpi
              key={b}
              label={`Umur ${b} hari`}
              value={bucket.total}
              tone={b === ">30" && bucket.total > 0 ? "warn" : "neutral"}
              hint={`${formatNumber(bucket.count)} PO belum lunas di rentang ini`}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="PO belum lunas"
          hint={`Total utang supplier ${formatRupiah(totalUnpaid)} pada ${formatNumber(unpaid.length)} PO. Umur dihitung dari jatuh tempo ke tanggal data.`}
        />
        <CardBody>
          {unpaid.length === 0 ? (
            <Alert tone="ok" title="Semua PO periode ini sudah lunas">
              Tidak ada utang supplier yang menggantung. Kas tidak punya kewajiban jatuh tempo pada periode ini, dan
              seluruh PO tercatat sudah dibayar.
            </Alert>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <caption className="sr-only">Purchase order yang belum dibayar beserta umur dan jumlahnya</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Nomor</th>
                    <th scope="col" className="label-caps px-2 py-2">Supplier</th>
                    <th scope="col" className="label-caps px-2 py-2">Jatuh tempo</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Umur</th>
                    <th scope="col" className="label-caps px-2 py-2">Status</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaid.map((po) => {
                    const days = Math.max(0, ageDays(po.dueDate, data.asOf));
                    return (
                      <tr key={po.id} className="border-b border-border last:border-0">
                        <td className="num px-2 py-2.5 text-[13px] text-text">{po.number}</td>
                        <td className="px-2 py-2.5 text-[13px] text-text">{supplierName(po.supplierId)}</td>
                        <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">{formatDate(po.dueDate)}</td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">{days} hari</td>
                        <td className="px-2 py-2.5 text-[13px]">
                          <Badge tone={po.status === "received" ? "ok" : "neutral"}>{po.status}</Badge>
                        </td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(po.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Riwayat PO sudah dibayar" hint="10 pembayaran supplier terakhir, untuk melihat ritme belanja stok." />
        <CardBody>
          {paid.length === 0 ? (
            <EmptyState title="Belum ada PO yang dibayar" body="Pembayaran supplier akan tercatat di sini setelah PO ditandai lunas." />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">Riwayat sepuluh purchase order yang sudah dibayar</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Nomor</th>
                    <th scope="col" className="label-caps px-2 py-2">Supplier</th>
                    <th scope="col" className="label-caps px-2 py-2">Tanggal bayar</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((po) => (
                    <tr key={po.id} className="border-b border-border last:border-0">
                      <td className="num px-2 py-2.5 text-[13px] text-text">{po.number}</td>
                      <td className="px-2 py-2.5 text-[13px] text-text-muted">{supplierName(po.supplierId)}</td>
                      <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">
                        {po.paidAt ? formatDate(po.paidAt) : "-"}
                      </td>
                      <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(po.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- tab: piutang */

const RECEIVABLE_STATUS_LABEL: Record<string, string> = {
  open: "Terbuka",
  overdue: "Lewat tempo",
  paid: "Lunas",
};

function PiutangTab({ data }: { data: Dataset }) {
  const asOfMs = Date.parse(data.asOf);

  const rows = useMemo(() => {
    return data.receivables
      .map((r) => {
        const customer = data.customers.find((c) => c.id === r.customerId) ?? null;
        const outstanding = Math.max(0, r.amount - r.paidAmount);
        const days = ageDays(r.dueDate, data.asOf);
        return {
          receivable: r,
          customerName: customer?.name ?? "Pelanggan tak dikenal",
          customerPhone: customer?.phone ?? "-",
          outstanding,
          days,
          bucket: bucketOf(Math.max(0, days)),
          overdue: r.status !== "paid" && Date.parse(r.dueDate) < asOfMs,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [data.receivables, data.customers, asOfMs]);

  const aging = emptyAging();
  for (const row of rows) {
    if (row.receivable.status === "paid") continue;
    const bucket = aging[row.bucket];
    if (bucket) {
      bucket.total += row.outstanding;
      bucket.count += 1;
    }
  }

  const outstandingTotal = rows
    .filter((r) => r.receivable.status !== "paid")
    .reduce((s, r) => s + r.outstanding, 0);
  const overdueTotal = rows.filter((r) => r.overdue).reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total outstanding" value={outstandingTotal} />
        <Kpi label="Lewat tempo" value={overdueTotal} tone={overdueTotal > 0 ? "danger" : "ok"} />
        {AGING_BUCKETS.slice(0, 2).map((b) => {
          const bucket = aging[b] ?? { total: 0, count: 0 };
          return <Kpi key={b} label={`Umur ${b} hari`} value={bucket.total} hint={`${formatNumber(bucket.count)} bon`} />;
        })}
      </div>

      <Card>
        <CardHeader title="Aging piutang" hint="Bon pelanggan dikelompokkan menurut umur terhadap jatuh tempo." />
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AGING_BUCKETS.map((b) => {
            const bucket = aging[b] ?? { total: 0, count: 0 };
            return (
              <div key={b} className="rounded-[10px] border border-border bg-surface-2 px-4 py-3">
                <div className="label-caps">{b} hari</div>
                <div className="num mt-1 text-[18px] text-text">{formatRupiah(bucket.total)}</div>
                <div className="text-[12px] text-text-faint">{formatNumber(bucket.count)} bon terbuka</div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Daftar piutang"
          hint="Status mengikuti catatan sistem. Bon lewat tempo tetap bisa ditagih dan tidak otomatis menjadi kerugian."
        />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState title="Belum ada piutang" body="Konter ini belum mencatat penjualan bon atau cicilan pelanggan." />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <caption className="sr-only">Daftar piutang pelanggan beserta umur, status, dan sisa tagihan</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Pelanggan</th>
                    <th scope="col" className="label-caps px-2 py-2">Jatuh tempo</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Umur</th>
                    <th scope="col" className="label-caps px-2 py-2">Status</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Nilai bon</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.receivable.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-2.5 text-[13px] text-text">
                        {row.customerName}
                        <span className="num ml-2 text-[12px] text-text-faint">{row.customerPhone}</span>
                      </td>
                      <td className="num px-2 py-2.5 text-[12.5px] text-text-muted">{formatDate(row.receivable.dueDate)}</td>
                      <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">{row.days} hari</td>
                      <td className="px-2 py-2.5 text-[13px]">
                        <Badge tone={row.receivable.status === "paid" ? "ok" : row.overdue ? "danger" : "warn"}>
                          {RECEIVABLE_STATUS_LABEL[row.receivable.status] ?? row.receivable.status}
                        </Badge>
                      </td>
                      <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">
                        {formatNumber(row.receivable.amount)}
                      </td>
                      <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(row.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------- tab: prakiraan */

function PrakiraanTab({ ctx }: { ctx: Context }) {
  const weeks = useMemo(() => forecast13Weeks(ctx), [ctx]);
  const points = weeks.map((w) => ({ x: w.label, y: w.base }));
  const band = weeks.map((w) => ({ x: w.label, low: w.conservative, high: w.recovery }));
  const last = weeks[weeks.length - 1];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Kas pekan 13 - base" value={last?.base ?? ctx.cashNow} />
        <Kpi label="Kas pekan 13 - konservatif" value={last?.conservative ?? ctx.cashNow} tone="warn" />
        <Kpi label="Kas pekan 13 - pemulihan" value={last?.recovery ?? ctx.cashNow} tone="ok" />
      </div>

      <Card>
        <CardHeader
          title="Prakiraan kas 13 minggu"
          hint="Pita abu menunjukkan rentang antara skenario konservatif dan pemulihan, garis tegas adalah skenario base."
        />
        <CardBody>
          <LineWithBand points={points} band={band} label="Prakiraan kas 13 minggu skenario base" />
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardBody>
            <div className="label-caps">Base</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
              Rata-rata 42 hari terakhir berlanjut apa adanya: margin kotor, beban, dan prive berjalan pada ritme yang
              sama seperti sekarang.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="label-caps">Konservatif</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
              Burn memburuk 35% dan penjualan turun 3% dari rata-rata, menggambarkan stok makin tipis dan belanja stok
              tersendat.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="label-caps">Pemulihan</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
              Margin kotor naik 12%, beban dipangkas 8%, dan prive dipotong setengah. Ini hasil bila semua tuas
              pemulihan kas dijalankan.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Tabel prakiraan" hint="Semua angka posisi kas akhir pekan, bukan arus per pekan." />
        <CardBody>
          <div className="scroll-x">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <caption className="sr-only">Prakiraan posisi kas akhir setiap pekan untuk tiga skenario</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="label-caps px-2 py-2">Pekan</th>
                  <th scope="col" className="label-caps px-2 py-2 text-right">Base</th>
                  <th scope="col" className="label-caps px-2 py-2 text-right">Konservatif</th>
                  <th scope="col" className="label-caps px-2 py-2 text-right">Pemulihan</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week} className="border-b border-border last:border-0">
                    <td className="num px-2 py-2.5 text-[13px] text-text">{w.label}</td>
                    <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(w.base)}</td>
                    <td
                      className={cn(
                        "num px-2 py-2.5 text-right text-[13px]",
                        w.conservative < 0 ? "text-danger" : "text-text-muted"
                      )}
                    >
                      {formatNumber(w.conservative)}
                    </td>
                    <td className="num px-2 py-2.5 text-right text-[13px] text-accent">{formatNumber(w.recovery)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------- tab: anggaran */

type BudgetRow = {
  category: string;
  current: Rupiah;
  previous: Rupiah;
  change: number;
};

function AnggaranTab({ data }: { data: Dataset }) {
  const rows = useMemo<BudgetRow[]>(() => {
    const relevant = data.expenses.filter((e) => e.category !== "owner_draw");
    const keys = [...new Set(relevant.map((e) => (e.paidAt ?? e.dueDate).slice(0, 7)))].sort();
    const currentKey = keys[keys.length - 1];
    const previousKey = keys[keys.length - 2];

    const totalsFor = (monthKey: string | undefined): Map<string, Rupiah> => {
      const map = new Map<string, Rupiah>();
      if (!monthKey) return map;
      for (const e of relevant) {
        if ((e.paidAt ?? e.dueDate).slice(0, 7) !== monthKey) continue;
        map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
      }
      return map;
    };

    const current = totalsFor(currentKey);
    const previous = totalsFor(previousKey);
    const categories = [...new Set([...current.keys(), ...previous.keys()])];
    return categories
      .map((category) => {
        const currentTotal = current.get(category) ?? 0;
        const previousTotal = previous.get(category) ?? 0;
        return { category, current: currentTotal, previous: previousTotal, change: pctChange(currentTotal, previousTotal) };
      })
      .sort((a, b) => b.current - a.current);
  }, [data.expenses]);

  const monthKeys = useMemo(() => {
    const relevant = data.expenses.filter((e) => e.category !== "owner_draw");
    return [...new Set(relevant.map((e) => (e.paidAt ?? e.dueDate).slice(0, 7)))].sort().slice(-2);
  }, [data.expenses]);

  const currentLabel = monthKeys[1] ? formatMonth(`${monthKeys[1]}-01T00:00:00.000Z`) : "bulan berjalan";
  const previousLabel = monthKeys[0] ? formatMonth(`${monthKeys[0]}-01T00:00:00.000Z`) : "bulan sebelumnya";

  const currentTotal = rows.reduce((s, r) => s + r.current, 0);
  const previousTotal = rows.reduce((s, r) => s + r.previous, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={`Beban ${currentLabel}`} value={currentTotal} />
        <Kpi label={`Beban ${previousLabel}`} value={previousTotal} />
        <Kpi
          label="Perubahan total"
          value={pctChange(currentTotal, previousTotal)}
          format="percent"
          tone={currentTotal > previousTotal ? "warn" : "ok"}
        />
      </div>

      <Card>
        <CardHeader
          title="Beban bulan berjalan vs bulan sebelumnya"
          hint="Kategori dengan kenaikan lebih dari 25% ditandai, karena laju seperti itu biasanya menggerus runway tanpa terasa."
        />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState title="Belum ada beban untuk dibandingkan" body="Catat beban pada tab Beban agar perbandingan bulan terbentuk." />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <caption className="sr-only">
                  Perbandingan beban per kategori antara bulan berjalan dan bulan sebelumnya
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">Kategori</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">{previousLabel}</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">{currentLabel}</th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">Perubahan</th>
                    <th scope="col" className="label-caps px-2 py-2">Tanda</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const jump = row.change > 25;
                    return (
                      <tr key={row.category} className="border-b border-border last:border-0">
                        <td className="px-2 py-2.5 text-[13px] text-text">{categoryLabel(row.category)}</td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text-muted">{formatNumber(row.previous)}</td>
                        <td className="num px-2 py-2.5 text-right text-[13px] text-text">{formatNumber(row.current)}</td>
                        <td className="px-2 py-2.5 text-right">
                          <Delta value={Number(row.change.toFixed(1))} invert />
                        </td>
                        <td className="px-2 py-2.5">
                          {jump ? <Badge tone="warn">Naik di atas 25%</Badge> : <Badge tone="neutral">Dalam batas</Badge>}
                        </td>
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

/* ----------------------------------------------------- tab: tutup bulan */

type ChecklistId = "shift" | "opname" | "beban" | "rekonsiliasi";

function TutupBulanTab({ data, ctx }: { data: Dataset; ctx: Context }) {
  const toast = useFrizzy((s) => s.toast);
  const [checked, setChecked] = useState<Record<ChecklistId, boolean>>({
    shift: false,
    opname: false,
    beban: false,
    rekonsiliasi: false,
  });

  const openShifts = data.shifts.filter((s) => s.closedAt === null).length;
  const openOpname = data.opnameSessions.filter((s) => s.status === "open").length;
  const draftExpenses = data.expenses.filter((e) => e.paidAt === null && e.category !== "owner_draw").length;
  const unlinkedCash = data.cashTransactions.filter((c) => c.refType === "manual").length;

  const items: { id: ChecklistId; label: string; hint: string }[] = [
    {
      id: "shift",
      label: "Semua shift tertutup",
      hint:
        openShifts === 0
          ? `Tidak ada shift terbuka. Total selisih kas periode ini ${formatRupiah(ctx.kpis.shiftVarianceTotal)}.`
          : `${formatNumber(openShifts)} shift masih terbuka. Tutup lewat halaman Shift sebelum mengunci periode.`,
    },
    {
      id: "opname",
      label: "Opname selesai",
      hint:
        openOpname === 0
          ? `Semua sesi opname sudah tertutup. Selisih fisik ${formatPct(ctx.kpis.shrinkagePct, 2)} dari nilai persediaan.`
          : `${formatNumber(openOpname)} sesi opname masih terbuka.`,
    },
    {
      id: "beban",
      label: "Beban tercatat",
      hint:
        draftExpenses === 0
          ? `Tidak ada beban menunggu bayar. Total beban 30 hari ${formatRupiah(ctx.kpis.opex)}.`
          : `${formatNumber(draftExpenses)} beban belum dibayar masih menunggu pencatatan.`,
    },
    {
      id: "rekonsiliasi",
      label: "Rekonsiliasi bank",
      hint: `Saldo sistem ${formatRupiah(ctx.cashNow)} harus sama dengan mutasi rekening. ${formatNumber(
        unlinkedCash
      )} transaksi manual perlu dicocokkan.`,
    },
  ];

  const done = items.filter((i) => checked[i.id]).length;
  const allDone = done === items.length;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Checklist tutup bulan"
          hint="Progres tersimpan selama halaman terbuka. Setiap butir harus dicentang sebelum periode bisa dikunci."
          action={<Badge tone={allDone ? "ok" : "warn"}>{`${done} dari ${items.length} selesai`}</Badge>}
        />
        <CardBody className="flex flex-col gap-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-[10px] border border-border px-4 py-3">
              <Checkbox
                label={item.label}
                hint={item.hint}
                checked={checked[item.id]}
                onChange={(value) => setChecked((prev) => ({ ...prev, [item.id]: value }))}
              />
            </div>
          ))}

          <div className="hairline pt-4">
            {allDone ? (
              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  onClick={() =>
                    toast({
                      title: "Periode terkunci",
                      body: "Periode ini dikunci. Jurnal, beban, dan prive tidak lagi bisa diubah tanpa membuka kunci oleh pemilik.",
                      tone: "ok",
                    })
                  }
                >
                  Kunci periode
                </Button>
                <p className="text-[12.5px] leading-relaxed text-text-muted">
                  Setelah dikunci, angka periode ini menjadi dasar pembanding laporan berikutnya. Tidak ada data yang
                  berubah pada demo ini, tombol hanya memperlihatkan alurnya.
                </p>
              </div>
            ) : (
              <Alert tone="info" title="Belum semua butir selesai">
                Selesaikan seluruh butir checklist agar periode bisa dikunci. Mengunci periode lebih awal biasanya
                memaksa koreksi jurnal di bulan berikutnya.
              </Alert>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ringkasan sebelum kunci" hint="Angka kunci yang dibekukan saat periode dikunci." />
        <CardBody>
          <DataRow label="Kas akhir periode" value={formatRupiah(ctx.cashNow)} />
          <DataRow label="Penjualan neto 30 hari" value={formatRupiah(ctx.kpis.netSales)} />
          <DataRow label="Laba kotor 30 hari" value={formatRupiah(ctx.kpis.grossProfit)} />
          <DataRow label="Beban 30 hari" value={formatRupiah(ctx.kpis.opex)} />
          <DataRow label="Prive 30 hari" value={formatRupiah(ctx.kpis.draws)} />
          <DataRow
            label="True Burn harian"
            value={`${formatRupiah(ctx.kpis.trueBurnPerDay)} / hari`}
            hint={`Runway ${runwaySentence(ctx.kpis.runwayDays)} pada kas saat ini.`}
            strong
          />
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

function FinanceShell({ role }: { role: Role }) {
  const hydrate = useFrizzy((s) => s.hydrate);
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const reset = useFrizzy((s) => s.reset);
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const userId = useFrizzy((s) => s.userId);

  const [tab, setTab] = useState<FinanceTab>("kas");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    const found = FINANCE_TABS.find((t) => t.id === requested);
    if (found) setTab(found.id);
  }, []);

  if (role !== "owner") return <FinanceAccessCard />;

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (status === "error" || !data || !ctx) {
    return (
      <Alert
        tone="danger"
        title="Data keuangan gagal dimuat"
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

  const actorId: ID = userId ?? "user_owner";
  const periodStart = ctx.daily[0]?.date ?? data.startDate;
  const periodEnd = ctx.daily[ctx.daily.length - 1]?.date ?? data.asOf;

  const content: Record<FinanceTab, ReactNode> = {
    kas: <KasTab data={data} ctx={ctx} />,
    beban: <BebanTab data={data} actorId={actorId} />,
    prive: <PriveTab data={data} ctx={ctx} actorId={actorId} />,
    utang: <UtangTab data={data} />,
    piutang: <PiutangTab data={data} />,
    prakiraan: <PrakiraanTab ctx={ctx} />,
    anggaran: <AnggaranTab data={data} />,
    "tutup-bulan": <TutupBulanTab data={data} ctx={ctx} />,
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionTitle
        eyebrow="Keuangan konter"
        title="Keuangan"
        hint={`Periode aktif 30 hari terakhir (${formatDate(periodStart)} - ${formatDate(periodEnd)}). Semua angka dihitung dari ledger kas, bukan dari perkiraan.`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ctx.kpis.runwayState === "critical" ? "danger" : ctx.kpis.runwayState === "watch" ? "warn" : "ok"}>
              {`Runway ${runwayStateLabel(ctx.kpis.runwayState)} - ${runwaySentence(ctx.kpis.runwayDays)}`}
            </Badge>
            <Badge tone="neutral">{`Kas ${formatCompact(ctx.cashNow)}`}</Badge>
            <Badge tone={ctx.kpis.trueBurnPerDay > 0 ? "danger" : "ok"}>
              {`True Burn ${formatCompact(ctx.kpis.trueBurnPerDay)}/hari`}
            </Badge>
          </div>
        }
      />

      <Tabs tabs={FINANCE_TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={(id) => setTab(id as FinanceTab)} />

      {content[tab]}
    </div>
  );
}

export default function FinancePage() {
  const role = useFrizzy((s) => s.role);
  return <FinanceShell role={role} />;
}
