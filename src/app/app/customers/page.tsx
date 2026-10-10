"use client";

/* ============================================================================
   Pelanggan: KPI basis pelanggan, tabel riwayat, segmentasi, drawer detail,
   dan formulir tambah pelanggan dengan consent UU PDP.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CaretRight, Plus, ShieldCheck, UserPlus, Users } from "@phosphor-icons/react/dist/ssr";
import type { Customer, Dataset, ID, Sale } from "@/lib/types";
import { useData, useFrizzy } from "@/lib/store";
import { PAYMENT_LABEL } from "@/lib/constants";
import { daysBetween, formatCompact, formatDate, formatPct, formatRupiah, relativeDays } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Skeleton, type Tone } from "@/components/ui/Feedback";
import { Checkbox, Input } from "@/components/ui/Field";
import { DataRow, Kpi } from "@/components/ui/Kpi";
import { Overlay } from "@/components/ui/Overlay";

type Segment = "baru" | "berulang" | "bernilai tinggi" | "dormant";

const SEGMENT_LABEL: Record<Segment, string> = {
  baru: "Baru",
  berulang: "Berulang",
  "bernilai tinggi": "Bernilai tinggi",
  dormant: "Dormant 90 hari",
};

const SEGMENT_CARDS: { segment: Segment; label: string; hint: string }[] = [
  { segment: "baru", label: "Pelanggan baru", hint: "Baru 1 struk atau belum pernah belanja" },
  { segment: "berulang", label: "Berulang", hint: "Minimal 2 struk valid" },
  { segment: "bernilai tinggi", label: "Bernilai tinggi", hint: "Total belanja di atas Rp 5 juta" },
  { segment: "dormant", label: "Dormant 90 hari", hint: "Lebih dari 90 hari tanpa struk" },
];

const HIGH_VALUE_THRESHOLD = 5_000_000;
const DORMANT_DAYS = 90;

function segmentTone(segment: Segment): Tone {
  switch (segment) {
    case "bernilai tinggi":
      return "ok";
    case "dormant":
      return "warn";
    default:
      return "neutral";
  }
}

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/* ------------------------------------------------------------- agregasi */

type CustomerAgg = {
  customer: Customer;
  sales: Sale[];
  receiptCount: number;
  totalSpend: number;
  lastAt: string | null;
  daysSinceLast: number;
  segment: Segment;
};

function buildCustomerAggs(data: Dataset): CustomerAgg[] {
  const salesByCustomer = new Map<ID, Sale[]>();

  for (const sale of data.sales) {
    if (sale.customerId === null || sale.status === "void" || sale.status === "refunded") continue;
    const list = salesByCustomer.get(sale.customerId);
    if (list) list.push(sale);
    else salesByCustomer.set(sale.customerId, [sale]);
  }

  return data.customers.map((customer) => {
    const sales = (salesByCustomer.get(customer.id) ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const receiptCount = sales.length;
    const totalSpend = sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const lastAt = sales[0]?.createdAt ?? null;
    const daysSinceLast = Math.max(
      0,
      lastAt === null ? daysBetween(customer.createdAt, data.asOf) : daysBetween(lastAt, data.asOf)
    );
    const segment: Segment =
      totalSpend > HIGH_VALUE_THRESHOLD
        ? "bernilai tinggi"
        : daysSinceLast > DORMANT_DAYS
          ? "dormant"
          : receiptCount >= 2
            ? "berulang"
            : "baru";
    return { customer, sales, receiptCount, totalSpend, lastAt, daysSinceLast, segment };
  });
}

/* ---------------------------------------------------------------- halaman */

export default function CustomersPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const hydrate = useFrizzy((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "error") {
    return (
      <div className="space-y-4">
        <SectionTitle eyebrow="Pelanggan" title="Data pelanggan tidak bisa dimuat" />
        <Alert
          tone="danger"
          title="Gagal memuat data pelanggan"
          action={
            <Button variant="primary" size="sm" icon={<ArrowClockwise size={16} />} onClick={() => void hydrate()}>
              Coba lagi
            </Button>
          }
        >
          {error ?? "Terjadi kesalahan saat mengambil data contoh. Periksa koneksi lalu coba lagi."}
        </Alert>
      </div>
    );
  }

  if (status !== "ready") return <CustomersSkeleton />;

  return <CustomersWorkspace />;
}

function CustomersSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-[56ch]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-[104px]" />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[96px]" />
        ))}
      </div>
      <p className="sr-only">Memuat data pelanggan, struk, dan permintaan ulasan.</p>
    </div>
  );
}

function CustomersWorkspace() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const aggs = useMemo(() => buildCustomerAggs(data), [data]);

  const repeatCount = aggs.filter((agg) => agg.receiptCount >= 2).length;
  const dormantCount = aggs.filter((agg) => agg.daysSinceLast > DORMANT_DAYS).length;
  const reviewsSent = data.reviewRequests.filter((request) => request.sentAt !== null).length;
  const reviewClicks = data.reviewRequests.filter((request) => request.clickedAt !== null).length;
  const clickRate = reviewsSent === 0 ? 0 : (reviewClicks / reviewsSent) * 100;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered =
      needle === ""
        ? aggs
        : aggs.filter(
            (agg) =>
              agg.customer.name.toLowerCase().includes(needle) ||
              agg.customer.phone.includes(needle) ||
              (agg.customer.email ?? "").toLowerCase().includes(needle)
          );
    return [...filtered].sort((a, b) => b.totalSpend - a.totalSpend);
  }, [aggs, query]);

  const selected = aggs.find((agg) => agg.customer.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Pelanggan"
        title="Basis pelanggan dan garansi"
        hint="Lihat siapa yang berulang, siapa yang bernilai tinggi, siapa yang mulai hilang, dan siapa yang pernah diminta menulis ulasan."
        right={
          <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setAddOpen(true)}>
            Tambah pelanggan
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total pelanggan" value={data.customers.length} format="number" sub="Termasuk yang belum pernah belanja" />
        <Kpi label="Pelanggan berulang" value={repeatCount} format="number" sub="Minimal 2 struk valid" />
        <Kpi label="Dormant 90 hari" value={dormantCount} format="number" tone="warn" sub="Tanpa struk lebih dari 90 hari" />
        <Kpi label="Ulasan terkirim" value={reviewsSent} format="number" sub="Permintaan ulasan yang benar-benar terkirim" />
        <Kpi
          label="Klik ulasan"
          value={reviewClicks}
          format="number"
          sub={`Tingkat klik ${formatPct(clickRate)}`}
        />
      </div>

      <Card>
        <CardHeader
          title="Daftar pelanggan"
          hint={`${rows.length} dari ${data.customers.length} pelanggan, urut dari total belanja terbesar.`}
        />
        <CardBody className="space-y-4">
          <Input
            label="Cari pelanggan"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nama, telepon, atau email"
            hint="Pencarian mencakup nama, telepon, dan email."
          />

          {rows.length === 0 ? (
            <EmptyState
              title="Tidak ada pelanggan yang cocok"
              body="Coba kata kunci lain, atau tambahkan pelanggan baru lewat tombol di kanan atas."
              icon={<Users size={28} />}
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[1040px] text-left text-[13px]">
                <caption className="sr-only">
                  Daftar pelanggan: nama, telepon, email, consent email, jumlah struk, total belanja, terakhir belanja,
                  segmen, dan tombol detail.
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-3 py-2">
                      Nama
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Telepon
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Email
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Consent email
                    </th>
                    <th scope="col" className="label-caps px-3 py-2 text-right">
                      Struk
                    </th>
                    <th scope="col" className="label-caps px-3 py-2 text-right">
                      Total belanja
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Terakhir belanja
                    </th>
                    <th scope="col" className="label-caps px-3 py-2">
                      Segmen
                    </th>
                    <th scope="col" className="label-caps px-3 py-2 text-right">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((agg) => (
                    <tr
                      key={agg.customer.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                      onClick={() => setSelectedId(agg.customer.id)}
                    >
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="text-left font-medium text-text hover:text-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(agg.customer.id);
                          }}
                          aria-label={`Buka detail ${agg.customer.name}`}
                        >
                          {agg.customer.name}
                        </button>
                      </td>
                      <td className="num px-3 py-2.5 text-text-muted">{agg.customer.phone}</td>
                      <td className="px-3 py-2.5 text-text-muted">{agg.customer.email ?? "belum ada"}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={agg.customer.consentEmail ? "ok" : "warn"}>
                          {agg.customer.consentEmail ? "Setuju" : "Belum setuju"}
                        </Badge>
                      </td>
                      <td className="num px-3 py-2.5 text-right text-text">{agg.receiptCount}</td>
                      <td className="num px-3 py-2.5 text-right text-text">{formatRupiah(agg.totalSpend)}</td>
                      <td className={cn("px-3 py-2.5", agg.daysSinceLast > DORMANT_DAYS ? "text-warning" : "text-text-muted")}>
                        {agg.lastAt === null ? "belum pernah" : relativeDays(agg.lastAt, data.asOf)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={segmentTone(agg.segment)}>{SEGMENT_LABEL[agg.segment]}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Lihat riwayat ${agg.customer.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(agg.customer.id);
                          }}
                        >
                          <CaretRight size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Segmentasi"
          hint="Satu pelanggan hanya masuk satu segmen. Urutan prioritas: bernilai tinggi, lalu dormant 90 hari, berulang, terakhir baru."
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SEGMENT_CARDS.map((card) => {
              const group = aggs.filter((agg) => agg.segment === card.segment);
              const spend = group.reduce((sum, agg) => sum + agg.totalSpend, 0);
              return (
                <div key={card.segment} className="rounded-[10px] border border-border bg-surface-2 px-3 py-3">
                  <div className="label-caps">{card.label}</div>
                  <div className="num mt-1.5 text-[22px] font-semibold text-text">{group.length}</div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-text-muted">{card.hint}</p>
                  <p className="num mt-2 text-[12px] text-text-muted">
                    Total belanja {formatCompact(spend)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <AddCustomerOverlay open={addOpen} onClose={() => setAddOpen(false)} />

      {selected === null ? null : <CustomerDrawer agg={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- drawer */

type PurchasedUnit = {
  id: string;
  productName: string;
  imei: string;
  warrantyEnd: string;
  active: boolean;
};

function CustomerDrawer({ agg, onClose }: { agg: CustomerAgg; onClose: () => void }) {
  const data = useData();
  const role = useFrizzy((s) => s.role);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const toast = useFrizzy((s) => s.toast);

  const recentSales = agg.sales.slice(0, 10);

  const paymentsBySale = useMemo(() => {
    const map = new Map<ID, string[]>();
    for (const payment of data.payments) {
      const label = PAYMENT_LABEL[payment.method] ?? payment.method;
      const list = map.get(payment.saleId);
      if (list) list.push(label);
      else map.set(payment.saleId, [label]);
    }
    return map;
  }, [data.payments]);

  const methodLabel = (saleId: ID): string => {
    const list = paymentsBySale.get(saleId) ?? [];
    return list.length === 0 ? "belum ada pembayaran" : [...new Set(list)].join(", ");
  };

  const purchasedUnits = useMemo<PurchasedUnit[]>(() => {
    const saleIds = new Set(agg.sales.map((sale) => sale.id));
    const unitById = new Map(data.units.map((unit) => [unit.id, unit] as const));
    const productById = new Map(data.products.map((product) => [product.id, product] as const));
    const seen = new Set<ID>();
    const items: PurchasedUnit[] = [];

    for (const line of data.saleItems) {
      if (line.unitId === null || !saleIds.has(line.saleId) || seen.has(line.unitId)) continue;
      const unit = unitById.get(line.unitId);
      if (!unit) continue;
      seen.add(unit.id);
      const sale = agg.sales.find((item) => item.id === line.saleId) ?? null;
      const soldAt = unit.soldAt ?? sale?.createdAt ?? data.asOf;
      const warrantyEnd = addMonths(soldAt, unit.warrantyMonths);
      items.push({
        id: unit.id,
        productName: productById.get(unit.productId)?.name ?? line.name,
        imei: unit.imei1,
        warrantyEnd,
        active: Date.parse(warrantyEnd) >= Date.parse(data.asOf),
      });
    }

    return items.sort((a, b) => Date.parse(b.warrantyEnd) - Date.parse(a.warrantyEnd));
  }, [agg.sales, data.saleItems, data.units, data.products, data.asOf]);

  const reviews = useMemo(
    () =>
      data.reviewRequests
        .filter((request) => request.customerId === agg.customer.id)
        .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt)),
    [data.reviewRequests, agg.customer.id]
  );

  const requestErasure = () => {
    const name = agg.customer.name;
    requestApproval({
      kind: "sensitive",
      message: `Anonimkan seluruh data pribadi ${name} (nama, telepon, email, dan tautan riwayat struk)? Tindakan ini permanen dan tidak bisa dibatalkan.`,
      onApprove: () => {
        toast({
          title: "Permintaan erasure dicatat",
          body: `Permintaan anonimisasi ${name} masuk antrean audit. Data demo tidak diubah; di produksi identitas dihapus dan struk tetap tersimpan tanpa data pribadi.`,
          tone: "warn",
        });
      },
    });
  };

  return (
    <Overlay
      open
      onClose={onClose}
      variant="drawer"
      title={agg.customer.name}
      description={`${SEGMENT_LABEL[agg.segment]} · ${agg.receiptCount} struk valid · total ${formatRupiah(agg.totalSpend)}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11.5px] leading-snug text-text-muted">
            Consent dan permintaan hapus data dicatat sesuai UU PDP No. 27/2022.
          </span>
          {role === "owner" ? (
            <Button variant="danger" size="sm" onClick={requestErasure}>
              Anonimkan data
            </Button>
          ) : (
            <span className="text-[11.5px] text-text-muted">Hanya pemilik yang bisa meminta anonimisasi.</span>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="label-caps mb-2">Profil</h3>
          <DataRow label="Telepon" value={<span className="num">{agg.customer.phone}</span>} />
          <DataRow label="Email" value={agg.customer.email ?? "belum ada"} />
          <DataRow label="Consent email" value={agg.customer.consentEmail ? "setuju" : "belum setuju"} />
          <DataRow label="Terdaftar sejak" value={formatDate(agg.customer.createdAt)} />
          <DataRow label="Jumlah struk valid" value={String(agg.receiptCount)} />
          <DataRow label="Total belanja" value={formatRupiah(agg.totalSpend)} strong />
          <DataRow
            label="Terakhir belanja"
            value={agg.lastAt === null ? "belum pernah" : relativeDays(agg.lastAt, data.asOf)}
            hint={agg.lastAt === null ? "Tidak ada struk atas nama ini" : formatDate(agg.lastAt)}
          />
        </section>

        <section>
          <h3 className="label-caps mb-2">Riwayat 10 struk terakhir</h3>
          {recentSales.length === 0 ? (
            <p className="text-[13px] text-text-muted">Belum ada struk atas nama pelanggan ini.</p>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <caption className="sr-only">
                  Sepuluh struk terakhir pelanggan ini: nomor struk, tanggal, metode pembayaran, dan total.
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps px-2 py-2">
                      Nomor
                    </th>
                    <th scope="col" className="label-caps px-2 py-2">
                      Tanggal
                    </th>
                    <th scope="col" className="label-caps px-2 py-2">
                      Metode
                    </th>
                    <th scope="col" className="label-caps px-2 py-2 text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-border last:border-0">
                      <td className="num px-2 py-2 text-text">{sale.receiptNo}</td>
                      <td className="px-2 py-2 text-text-muted">{formatDate(sale.createdAt)}</td>
                      <td className="px-2 py-2 text-text-muted">{methodLabel(sale.id)}</td>
                      <td className="num px-2 py-2 text-right text-text">{formatRupiah(sale.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="label-caps mb-2">Unit yang pernah dibeli</h3>
          {purchasedUnits.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              Tidak ada unit berserial atas nama pelanggan ini; pembeliannya berupa aksesori atau jasa.
            </p>
          ) : (
            <ul className="space-y-2">
              {purchasedUnits.slice(0, 12).map((unit) => (
                <li
                  key={unit.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text">{unit.productName}</span>
                    <span className="num block text-[12px] text-text-muted">IMEI {unit.imei}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] text-text-muted">
                      Garansi sampai {formatDate(unit.warrantyEnd)}
                    </span>
                    <Badge tone={unit.active ? "ok" : "warn"}>{unit.active ? "Aktif" : "Berakhir"}</Badge>
                  </span>
                </li>
              ))}
              {purchasedUnits.length > 12 ? (
                <li className="text-[12px] text-text-muted">dan {purchasedUnits.length - 12} unit lainnya.</li>
              ) : null}
            </ul>
          )}
        </section>

        <section>
          <h3 className="label-caps mb-2">Riwayat permintaan ulasan</h3>
          {reviews.length === 0 ? (
            <p className="text-[13px] text-text-muted">Belum pernah diminta menulis ulasan.</p>
          ) : (
            <ul className="space-y-2">
              {reviews.slice(0, 8).map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2"
                >
                  <span className="num text-[12.5px] text-text">{request.shortCode}</span>
                  <span className="text-[12px] text-text-muted">
                    {request.sentAt === null ? "belum terkirim" : `terkirim ${formatDate(request.sentAt)}`}
                  </span>
                  <Badge tone={request.clickedAt === null ? "neutral" : "ok"}>
                    {request.clickedAt === null ? "Belum diklik" : `Diklik ${formatDate(request.clickedAt)}`}
                  </Badge>
                </li>
              ))}
              {reviews.length > 8 ? (
                <li className="text-[12px] text-text-muted">dan {reviews.length - 8} permintaan lainnya.</li>
              ) : null}
            </ul>
          )}
        </section>

        <section>
          <h3 className="label-caps mb-2">Log consent</h3>
          {agg.customer.consentEmail && agg.customer.consentAt !== null ? (
            <DataRow
              label={`Setuju dihubungi lewat email pada ${formatDate(agg.customer.consentAt)}`}
              value="Struk, garansi, dan permintaan ulasan boleh dikirim"
              hint="Consent dapat ditarik kapan saja; tarik consent berarti kanal email berhenti dipakai."
            />
          ) : (
            <DataRow
              label="Belum ada consent email"
              value="Hanya struk cetak"
              hint="Tanpa consent, struk digital dan permintaan ulasan tidak dikirim lewat email."
            />
          )}
        </section>
      </div>
    </Overlay>
  );
}

/* -------------------------------------------------------- tambah pelanggan */

function AddCustomerOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutate = useFrizzy((s) => s.mutate);
  const toast = useFrizzy((s) => s.toast);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setConsent(false);
    setErrors({});
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    const next: { name?: string; phone?: string; email?: string } = {};
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (cleanName.length < 3) next.name = "Nama wajib diisi, minimal 3 karakter.";
    if (phone.length < 9) next.phone = "Telepon wajib diisi, minimal 9 digit angka.";
    if (cleanEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      next.email = "Format email belum benar, contoh: nama@email.com.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    mutate({
      type: "add_customer",
      name: cleanName,
      phone,
      email: cleanEmail === "" ? null : cleanEmail,
      consent,
    });
    toast({
      title: "Pelanggan ditambahkan",
      body: `${cleanName} tersimpan${cleanEmail === "" ? " tanpa email" : " dengan email"}${
        consent ? "; consent email tercatat beserta waktunya." : "; email tanpa consent tidak akan dikirimi struk digital."
      }`,
      tone: "ok",
    });
    close();
  };

  return (
    <Overlay
      open={open}
      onClose={close}
      size="md"
      title="Tambah pelanggan"
      description="Data minimum untuk mengaitkan struk, garansi, dan permintaan ulasan."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Batal
          </Button>
          <Button variant="primary" icon={<UserPlus size={16} />} onClick={submit}>
            Simpan pelanggan
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nama pelanggan"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama lengkap"
          error={errors.name ?? null}
          autoComplete="off"
        />
        <Input
          label="Telepon"
          value={phone}
          inputMode="numeric"
          onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="0812345678"
          hint="Hanya digit angka, minimal 9 digit. Dipakai untuk mencocokkan struk."
          error={errors.phone ?? null}
        />
        <Input
          label="Email (opsional)"
          value={email}
          type="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
          hint="Kosongkan bila pelanggan tidak ingin dihubungi lewat email."
          error={errors.email ?? null}
        />
        <Checkbox
          label="Pelanggan setuju dihubungi lewat email"
          checked={consent}
          onChange={setConsent}
          hint="UU PDP No. 27/2022: struk digital dan permintaan ulasan hanya dikirim bila pelanggan memberi consent. Waktu consent dicatat di profil pelanggan."
        />
        <div className="flex items-start gap-2 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-text-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Data pelanggan dipakai hanya untuk struk, klaim garansi, dan permintaan ulasan. Pemilik dapat meminta
            anonimisasi dari drawer detail pelanggan.
          </span>
        </div>
      </div>
    </Overlay>
  );
}
