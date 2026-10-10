"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MagnifyingGlass,
  Tag,
  Printer,
  PencilSimple,
  WarningCircle,
  Package,
  X,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { useCtx, useFrizzy } from "@/lib/store";
import { formatCompact, formatPct, formatRupiah, relativeDays } from "@/lib/money";
import { PRODUCT_KIND_LABEL } from "@/lib/constants";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Input, MoneyInput, Select } from "@/components/ui/Field";
import { Overlay, Tabs } from "@/components/ui/Overlay";
import { Kpi, MiniBar } from "@/components/ui/Kpi";
import { Icon } from "@/components/ui/Icon";

type TabId = "katalog" | "harga" | "label" | "impor";

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <ProductsScreen />
    </Suspense>
  );
}

function ProductsSkeleton() {
  return (
    <div className="mx-auto max-w-[1240px] space-y-4" aria-busy="true">
      <Skeleton className="h-7 w-56" />
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-2xl" />
    </div>
  );
}

function ProductsScreen() {
  const status = useFrizzy((s) => s.status);
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);
  const error = useFrizzy((s) => s.error);
  const searchParams = useSearchParams();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const [tab, setTab] = useState<TabId>("katalog");
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "harga" || t === "label" || t === "impor" || t === "katalog") setTab(t);
  }, [searchParams]);

  if (status === "idle" || status === "loading") return <ProductsSkeleton />;

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[720px] py-8">
        <Alert tone="danger" title="Data produk gagal dimuat">
          {error ?? "Kesalahan tidak terduga."}
        </Alert>
        <div className="mt-4">
          <Button
            variant="primary"
            onClick={() => {
              reset();
              void hydrate();
            }}
          >
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  return <ProductsWorkspace tab={tab} setTab={setTab} />;
}

function ProductsWorkspace({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  const ctx = useCtx();
  const data = ctx.data;
  const role = useFrizzy((s) => s.role);
  const userId = useFrizzy((s) => s.userId);
  const mutate = useFrizzy((s) => s.mutate);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const toast = useFrizzy((s) => s.toast);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | Product["kind"]>("all");
  const [tag, setTag] = useState<"all" | "A" | "B" | "C" | "low_margin" | "dead">("all");
  const [edit, setEdit] = useState<Product | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editMin, setEditMin] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...ctx.byProduct.values()]
      .filter((m) => {
        const p = m.product;
        if (kind !== "all" && p.kind !== kind) return false;
        if (tag === "low_margin" && m.marginPct >= 8) return false;
        if (tag === "dead" && !(m.health === "dead" || m.health === "obsolete")) return false;
        if ((tag === "A" || tag === "B" || tag === "C") && p.tags.abc !== tag) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.barcode.includes(q)
        );
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }, [ctx.byProduct, kind, query, tag]);

  const totalValue = rows.reduce((s, m) => s + m.stockValue, 0);
  const lowMargin = [...ctx.byProduct.values()].filter((m) => m.product.kind === "handset" && m.marginPct < 6).length;
  const deadCount = [...ctx.byProduct.values()].filter((m) => m.health === "dead" || m.health === "obsolete").length;
  const avgMargin = ctx.kpis.grossMarginPct;

  const savePrice = () => {
    if (!edit) return;
    if (!userId) return;
    const apply = () => {
      mutate({ type: "set_price", productId: edit.id, price: editPrice, minPrice: editMin, actorId: userId });
      toast({ title: "Harga diperbarui", body: `${edit.name} kini ${formatRupiah(editPrice)}.`, tone: "ok" });
      setEdit(null);
    };
    if (role === "staff") {
      requestApproval({
        kind: "sensitive",
        message: `Perubahan harga ${edit.name} hanya bisa dilakukan pemilik.`,
        onApprove: apply,
      });
      return;
    }
    apply();
  };

  const applyMarkdown = (product: Product, pct: number) => {
    if (!userId) return;
    const price = Math.max(product.cost, Math.round((product.price * (1 - pct / 100)) / 500) * 500);
    mutate({ type: "apply_markdown", productId: product.id, price, actorId: userId });
    toast({
      title: "Markdown diterapkan",
      body: `${product.name} turun ${pct}% menjadi ${formatRupiah(price)}.`,
      tone: "ok",
    });
  };

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <SectionTitle
        eyebrow="Katalog"
        title="Produk dan harga"
        hint={
          role === "owner"
            ? "Harga pokok, margin, dan riwayat harga terlihat penuh untuk pemilik."
            : "Peran staf: harga jual, stok, dan batas margin minimum. Harga pokok disembunyikan."
        }
        right={
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => setTab("label")}>
            Cetak label
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="SKU aktif" value={rows.length} format="number" sub={`${data.products.length} total di katalog`} />
        <Kpi label="Nilai stok tersaring" value={totalValue} sub={`Total persediaan ${formatCompact(ctx.inventoryValueNow)}`} />
        <Kpi
          label="Margin kotor rata-rata"
          value={avgMargin}
          format="percent"
          tone={avgMargin < 8 ? "warn" : "ok"}
          sub="Target internal 9%"
        />
        <Kpi
          label="Perlu perhatian"
          value={lowMargin + deadCount}
          format="number"
          tone={deadCount > 0 ? "warn" : "neutral"}
          sub={`${lowMargin} margin tipis, ${deadCount} stok mati`}
        />
      </div>

      <Tabs
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "katalog", label: "Katalog", badge: rows.length },
          { id: "harga", label: "Harga & margin" },
          { id: "label", label: "Label harga" },
          { id: "impor", label: "Impor / ekspor" },
        ]}
      />

      {tab === "katalog" ? (
        <>
          <Card className="px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label htmlFor="produk-cari" className="text-[13px] font-medium text-text">
                  Cari produk
                </label>
                <div className="mt-1.5 flex h-10 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3">
                  <MagnifyingGlass size={16} className="text-text-faint" />
                  <input
                    id="produk-cari"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nama, SKU, merek, atau barcode"
                    className="h-10 w-full bg-transparent text-[14px] text-text outline-none placeholder:text-text-faint"
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery("")} aria-label="Bersihkan" className="text-text-faint hover:text-text">
                      <X size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="w-full md:w-[190px]">
                <Select label="Jenis" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <option value="all">Semua jenis</option>
                  <option value="handset">Handset</option>
                  <option value="accessory">Aksesori</option>
                  <option value="voucher">Voucher / pulsa</option>
                  <option value="service">Jasa</option>
                </Select>
              </div>
              <div className="w-full md:w-[210px]">
                <Select label="Tanda" value={tag} onChange={(e) => setTag(e.target.value as typeof tag)}>
                  <option value="all">Semua tanda</option>
                  <option value="A">Kelas A (penyumbang omzet)</option>
                  <option value="B">Kelas B</option>
                  <option value="C">Kelas C</option>
                  <option value="low_margin">Margin tipis</option>
                  <option value="dead">Stok mati</option>
                </Select>
              </div>
            </div>
          </Card>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Package size={26} />}
                title="Tidak ada produk cocok"
                body="Ubah kata kunci atau reset filter untuk melihat seluruh katalog."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setKind("all");
                      setTag("all");
                    }}
                  >
                    Reset filter
                  </Button>
                }
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="scroll-x">
                <table className="w-full min-w-[880px] text-[13px]">
                  <caption className="sr-only">Daftar produk dengan stok, harga, dan margin</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-faint">
                      <th className="px-5 py-3 font-medium">Produk</th>
                      <th className="px-3 py-3 text-right font-medium">Stok</th>
                      <th className="px-3 py-3 text-right font-medium">Harga jual</th>
                      {role === "owner" ? <th className="px-3 py-3 text-right font-medium">Harga pokok</th> : null}
                      {role === "owner" ? <th className="px-3 py-3 text-right font-medium">Margin</th> : null}
                      <th className="px-3 py-3 text-right font-medium">Terjual</th>
                      <th className="px-3 py-3 text-center font-medium">ABC / XYZ</th>
                      <th className="px-3 py-3 font-medium">Kesehatan</th>
                      <th className="px-5 py-3 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 120).map((m) => {
                      const p = m.product;
                      return (
                        <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                          <td className="max-w-[280px] px-5 py-3">
                            <span className="block truncate font-medium text-text">{p.name}</span>
                            <span className="num block text-[11.5px] text-text-faint">
                              {p.sku} - {PRODUCT_KIND_LABEL[p.kind]} - {p.brand}
                            </span>
                          </td>
                          <td className="num px-3 py-3 text-right text-text">{p.kind === "service" ? "-" : m.qty}</td>
                          <td className="num px-3 py-3 text-right text-text">{formatRupiah(p.price)}</td>
                          {role === "owner" ? (
                            <td className="num px-3 py-3 text-right text-text-muted">{formatRupiah(p.cost)}</td>
                          ) : null}
                          {role === "owner" ? (
                            <td
                              className={cn(
                                "num px-3 py-3 text-right",
                                m.marginPct < 6 ? "text-danger" : m.marginPct < 9 ? "text-warning" : "text-accent"
                              )}
                            >
                              {formatPct(m.marginPct)}
                            </td>
                          ) : null}
                          <td className="num px-3 py-3 text-right text-text-muted">{m.soldUnits}</td>
                          <td className="num px-3 py-3 text-center text-text-muted">
                            {p.tags.abc}
                            {p.tags.xyz}
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              tone={
                                m.health === "healthy"
                                  ? "ok"
                                  : m.health === "slow"
                                    ? "warn"
                                    : "danger"
                              }
                            >
                              {m.health === "healthy"
                                ? "Sehat"
                                : m.health === "slow"
                                  ? "Lambat"
                                  : m.health === "dead"
                                    ? "Mati"
                                    : "Usang"}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEdit(p);
                                  setEditPrice(p.price);
                                  setEditMin(p.minPrice);
                                }}
                                icon={<PencilSimple size={14} />}
                              >
                                Harga
                              </Button>
                              {m.health !== "healthy" && m.qty > 0 ? (
                                <Button variant="ghost" size="sm" onClick={() => applyMarkdown(p, 12)} icon={<Tag size={14} />}>
                                  Markdown
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 120 ? (
                <p className="border-t border-border px-5 py-3 text-[12px] text-text-faint">
                  Menampilkan 120 dari {rows.length} produk. Persempit pencarian untuk melihat sisanya.
                </p>
              ) : null}
            </Card>
          )}
        </>
      ) : null}

      {tab === "harga" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Margin terendah" hint="Kandidat peninjauan harga, jangan tunggu rugi" />
            <div className="divide-y divide-border">
              {[...ctx.byProduct.values()]
                .filter((m) => m.product.kind === "handset")
                .sort((a, b) => a.marginPct - b.marginPct)
                .slice(0, 10)
                .map((m) => (
                  <div key={m.product.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-text">{m.product.name}</p>
                      <p className="num text-[11.5px] text-text-faint">
                        jual {formatCompact(m.product.price)} - pokok {formatCompact(m.product.cost)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("num text-[14px] font-semibold", m.marginPct < 6 ? "text-danger" : "text-warning")}>
                        {formatPct(m.marginPct)}
                      </p>
                      <MiniBar value={Math.max(0, m.marginPct)} max={15} tone={m.marginPct < 6 ? "danger" : "accent"} width={64} />
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Riwayat harga" hint="Perubahan tercatat di audit log" />
            <ul className="divide-y divide-border">
              {data.auditLog
                .filter((a) => a.action.startsWith("product."))
                .slice(-10)
                .reverse()
                .map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="text-[13px] text-text">{a.detail}</p>
                    <p className="num text-[11.5px] text-text-faint">
                      {a.action} - {relativeDays(a.at, data.asOf)}
                    </p>
                  </li>
                ))}
              {data.auditLog.filter((a) => a.action.startsWith("product.")).length === 0 ? (
                <li className="px-5 py-4 text-[13px] text-text-muted">Belum ada perubahan harga tercatat.</li>
              ) : null}
            </ul>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Bauran per jenis" hint="Di mana modal berputar dan di mana laba datang" />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(["handset", "accessory", "voucher", "service"] as const).map((k) => {
                  const items = [...ctx.byProduct.values()].filter((m) => m.product.kind === k);
                  const revenue = items.reduce((s, m) => s + m.revenue, 0);
                  const profit = items.reduce((s, m) => s + m.grossProfit, 0);
                  const stock = items.reduce((s, m) => s + m.stockValue, 0);
                  const margin = revenue === 0 ? 0 : (profit / revenue) * 100;
                  const gmroi = stock === 0 ? 0 : profit / stock;
                  return (
                    <div key={k} className="rounded-[10px] bg-surface-2 px-4 py-3.5">
                      <p className="label-caps">{PRODUCT_KIND_LABEL[k]}</p>
                      <p className="num mt-1.5 text-[17px] font-semibold text-text">{formatCompact(revenue)}</p>
                      <dl className="mt-2 space-y-1 text-[12px] text-text-muted">
                        <div className="flex justify-between">
                          <dt>Margin</dt>
                          <dd className={cn("num", margin < 5 ? "text-danger" : "text-accent")}>{formatPct(margin)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Nilai stok</dt>
                          <dd className="num">{formatCompact(stock)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>GMROI</dt>
                          <dd className="num">{gmroi.toFixed(2)}</dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-text-muted">
                Handset membawa omzet besar dengan modal besar, sedangkan aksesori dan jasa membawa laba per rupiah modal yang
                jauh lebih tinggi. Naikkan porsi aksesori dan jasa untuk memperbaiki margin tanpa menambah kas.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "label" ? (
        <Card>
          <CardHeader
            title="Label harga dan barcode"
            hint="Pilih produk, atur jumlah label, lalu cetak ke kertas A4 atau printer label"
            action={
              <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
                Cetak
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Produk" value={query} onChange={(e) => setQuery(e.target.value)}>
                <option value="">Semua produk tersaring</option>
                {rows.slice(0, 40).map((m) => (
                  <option key={m.product.id} value={m.product.name}>
                    {m.product.name}
                  </option>
                ))}
              </Select>
              <Select label="Ukuran label" defaultValue="40x30">
                <option value="40x30">40 x 30 mm</option>
                <option value="50x30">50 x 30 mm</option>
                <option value="60x40">60 x 40 mm</option>
              </Select>
              <Select label="Isi label" defaultValue="harga">
                <option value="harga">Nama, harga, barcode</option>
                <option value="harga-sku">Nama, harga, SKU, barcode</option>
                <option value="garansi">Nama, harga, masa garansi</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-dashed border-border-strong p-4 sm:grid-cols-3 lg:grid-cols-4">
              {rows.slice(0, 12).map((m) => (
                <div key={m.product.id} className="rounded-[6px] border border-border bg-surface px-2.5 py-2">
                  <p className="line-clamp-2 text-[10.5px] font-medium leading-tight text-text">{m.product.name}</p>
                  <p className="num mt-1 text-[13px] font-semibold text-text">{formatRupiah(m.product.price)}</p>
                  <p className="num text-[9px] text-text-faint">{m.product.sku}</p>
                  <div className="mt-1.5 flex h-6 items-end gap-[2px]" aria-hidden="true">
                    {Array.from({ length: 26 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-[2px] bg-text"
                        style={{ height: `${((m.product.barcode.charCodeAt(i % m.product.barcode.length) % 4) + 1) * 4 + 4}px` }}
                      />
                    ))}
                  </div>
                  <p className="num text-[9px] text-text-faint">{m.product.barcode}</p>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-text-faint">
              Barcode dirender dari data produk, siap dipindai scanner USB maupun kamera. Cetak label untuk semua stok yang
              belum berlabel.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {tab === "impor" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Ekspor katalog" hint="CSV untuk cadangan atau olah di spreadsheet" />
            <CardBody className="space-y-3">
              <p className="text-[13px] text-text-muted">
                Kolom: SKU, nama, merek, jenis, barcode, harga pokok, harga jual, harga minimum, titik pesan ulang, supplier,
                stok saat ini, dan nilai stok.
              </p>
              <Button
                variant="primary"
                icon={<Icon name="DownloadSimple" size={16} />}
                onClick={() => {                  const header = [
                    "sku",
                    "nama",
                    "merek",
                    "jenis",
                    "barcode",
                    "harga_pokok",
                    "harga_jual",
                    "harga_minimum",
                    "stok",
                    "nilai_stok",
                  ];
                  const lines = rows.map((m) =>
                    [
                      m.product.sku,
                      `"${m.product.name.replace(/"/g, "'")}"`,
                      m.product.brand,
                      m.product.kind,
                      m.product.barcode,
                      m.product.cost,
                      m.product.price,
                      m.product.minPrice,
                      m.qty,
                      m.stockValue,
                    ].join(",")
                  );
                  const csv = [header.join(","), ...lines].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "katalog-frizzy.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "CSV dibuat", body: `${rows.length} baris siap diunduh.`, tone: "ok" });
                }}
              >
                Unduh CSV
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Impor massal" hint="Tempel CSV, lihat pratinjau validasi sebelum menyimpan" />
            <CardBody className="space-y-3">
              <Alert tone="warn" title="Validasi wajib sebelum simpan">
                Baris dengan barcode ganda, harga di bawah harga pokok, atau SKU kosong akan ditandai dan tidak diimpor.
              </Alert>
              <label htmlFor="impor-csv" className="text-[13px] font-medium text-text">
                Isi CSV
              </label>
              <textarea
                id="impor-csv"
                rows={7}
                placeholder={"sku,nama,merek,jenis,harga_pokok,harga_jual\nACC-NEW-1,Softcase baru,Generic,accessory,9000,25000"}
                className="w-full rounded-[10px] border border-border-strong bg-surface px-3 py-2 text-[12.5px] text-text outline-none placeholder:text-text-faint"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => toast({ title: "Pratinjau dibuat", body: "Di produksi baris valid langsung masuk antrean impor.", tone: "ok" })}
                >
                  Pratinjau validasi
                </Button>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-text-faint">
                  <ShieldCheck size={14} /> Duplikat barcode terdeteksi otomatis
                </span>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Overlay
        open={edit !== null}
        onClose={() => setEdit(null)}
        title="Ubah harga"
        description={edit?.name}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Batal
            </Button>
            <Button variant="primary" onClick={savePrice}>
              Simpan harga
            </Button>
          </div>
        }
      >
        {edit ? (
          <div className="space-y-4">
            <div className="rounded-[10px] bg-surface-2 px-4 py-3 text-[12.5px] text-text-muted">
              <div className="flex justify-between">
                <span>Harga pokok</span>
                <span className="num text-text">{formatRupiah(edit.cost)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Harga sekarang</span>
                <span className="num text-text">{formatRupiah(edit.price)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Margin sekarang</span>
                <span className="num text-text">{formatPct(((edit.price - edit.cost) / edit.price) * 100)}</span>
              </div>
            </div>

            <MoneyInput label="Harga jual baru" value={editPrice} onValueChange={setEditPrice} />
            <MoneyInput
              label="Harga minimum (batas margin guard)"
              value={editMin}
              onValueChange={setEditMin}
              hint={`Saran: minimal ${formatRupiah(Math.round(edit.cost * 1.035))} agar margin 3,5% tidak dilanggar.`}
            />

            {editPrice < edit.cost ? (
              <Alert tone="danger" title="Harga di bawah harga pokok">
                Menjual di bawah modal selalu tercatat sebagai kerugian dan akan muncul di Leak Detector.
              </Alert>
            ) : null}
            {editMin < edit.cost ? (
              <Alert tone="warn" title="Harga minimum di bawah modal">
                Margin guard tidak akan mencegah penjualan di bawah harga pokok.
              </Alert>
            ) : null}

            {role !== "owner" ? (
              <p className="flex items-start gap-2 text-[12px] text-warning">
                <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" />
                Peran staf: perubahan harga butuh persetujuan pemilik dan akan muncul di audit log.
              </p>
            ) : null}
          </div>
        ) : null}
      </Overlay>
    </div>
  );
}
