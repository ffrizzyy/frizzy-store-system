"use client";

/* ============================================================================
   Pengaturan. Delapan tab: toko, struk, ulasan, pembayaran, pajak, notifikasi,
   AI, dan data. Perubahan di halaman ini
   disimpan di state lokal dan diumumkan lewat toast, tidak menulis ke server.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle,
  CreditCard,
  Database,
  DownloadSimple,
  FloppyDisk,
  Key,
  LockKey,
  Percent,
  Printer,
  QrCode,
  Robot,
  Sparkle,
  Star,
  Storefront,
  Trash,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import type { Dataset, Sale, SaleItem } from "@/lib/types";
import { useFrizzy } from "@/lib/store";
import { SHOP } from "@/lib/constants";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/money";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Overlay";
import { DataRow } from "@/components/ui/Kpi";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "toko", label: "Toko" },
  { id: "struk", label: "Struk" },
  { id: "ulasan", label: "Ulasan" },
  { id: "pembayaran", label: "Pembayaran" },
  { id: "pajak", label: "Pajak" },
  { id: "notifikasi", label: "Notifikasi" },
  { id: "ai", label: "AI" },
  { id: "data", label: "Data" },
];

const WARRANTY_OPTIONS = [3, 6, 12, 18, 24];

const NOTIFICATION_RULES: { id: string; label: string; hint: string; on: boolean }[] = [
  { id: "low_stock", label: "Stok menipis", hint: "Kirim saat unit tersisa di bawah titik pesan ulang.", on: true },
  { id: "dead_stock", label: "Stok mati melewati ambang", hint: "Peringatan bila nilai stok mati melewati batas yang ditentukan.", on: true },
  { id: "payable_due", label: "Utang jatuh tempo 3 hari", hint: "Pengingat sebelum tagihan supplier jatuh tempo.", on: true },
  { id: "shift_variance", label: "Selisih kas shift", hint: "Langsung kirim bila hitungan laci berbeda dari sistem.", on: true },
  { id: "runway_state", label: "Perubahan status runway", hint: "Berubah antara aman, waspada, dan kritis.", on: true },
  { id: "anomaly", label: "Anomali transaksi", hint: "Diskon tak wajar, void berulang, atau harga di bawah HPP.", on: false },
  { id: "daily_brief", label: "Ringkasan AI harian", hint: "Daily Cash Brief dikirim setiap pagi pukul 07.00.", on: true },
];

export default function SettingsPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const data = useFrizzy((s) => s.data);
  const hydrate = useFrizzy((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <SectionTitle eyebrow="Sistem" title="Pengaturan" hint="Profil toko, struk, pembayaran, pajak, dan data." />
        <Alert
          tone="danger"
          title="Data gagal dimuat"
          action={
            <Button variant="secondary" size="sm" onClick={() => void hydrate()}>
              Coba lagi
            </Button>
          }
        >
          {error ?? "Penyebab tidak diketahui."} Pengaturan butuh profil toko dan riwayat struk untuk pratinjau.
        </Alert>
      </div>
    );
  }

  if (status !== "ready" || !data) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <SectionTitle eyebrow="Sistem" title="Pengaturan" hint="Profil toko, struk, pembayaran, pajak, dan data." />
        <Skeleton className="h-10 w-full max-w-[520px]" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return <Settings data={data} />;
}

function Settings({ data }: { data: Dataset }) {
  const [tab, setTab] = useState("toko");

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <SectionTitle
        eyebrow="Sistem"
        title="Pengaturan"
        hint="Nilai awal diambil dari profil konter. Setiap perubahan disimpan dan dicatat di audit log."
        right={<Badge tone="ok">Aktif</Badge>}
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "toko" ? <ShopTab data={data} /> : null}
      {tab === "struk" ? <ReceiptTab data={data} /> : null}
      {tab === "ulasan" ? <ReviewTab data={data} /> : null}
      {tab === "pembayaran" ? <PaymentTab /> : null}
      {tab === "pajak" ? <TaxTab data={data} /> : null}
      {tab === "notifikasi" ? <NotificationTab /> : null}
      {tab === "ai" ? <AiTab /> : null}
      {tab === "data" ? <DataTab data={data} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ toko */

function ShopTab({ data }: { data: Dataset }) {
  const toast = useFrizzy((s) => s.toast);
  const [name, setName] = useState(data.profile.name);
  const [tagline, setTagline] = useState(data.profile.tagline);
  const [address, setAddress] = useState(data.profile.address);
  const [phone, setPhone] = useState(data.profile.phone);
  const [hours, setHours] = useState(data.profile.hours);

  return (
    <Card>
      <CardHeader
        title="Profil toko"
        hint="Nama dan alamat ini muncul di struk, tautan ulasan, dan ringkasan harian."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              toast({
                title: "Profil disimpan",
                body: "Perubahan profil konter tersimpan dan tercatat di audit log.",
                tone: "ok",
              })
            }
            icon={<FloppyDisk size={15} />}
            aria-label="Simpan profil toko"
          >
            Simpan
          </Button>
        }
      />
      <CardBody className="grid gap-4 md:grid-cols-2">
        <Input label="Nama toko" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <Input
          label="Alamat"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="md:col-span-2"
          hint="Alamat lengkap dipakai untuk tautan peta dan struk cetak."
        />
        <Input label="Telepon" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        <Input label="Jam buka" value={hours} onChange={(e) => setHours(e.target.value)} />
        <div className="md:col-span-2">
          <Alert tone="info" title="Zona waktu dan mata uang">
            Zona waktu toko {data.profile.timezone}. Semua nilai uang disimpan sebagai integer rupiah, tanpa pecahan
            sen, agar tidak ada pembulatan yang hilang.
          </Alert>
        </div>
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------- struk */

function ReceiptTab({ data }: { data: Dataset }) {
  const toast = useFrizzy((s) => s.toast);
  const [width, setWidth] = useState<"58" | "80">("58");
  const [footer, setFooter] = useState("Terima kasih sudah belanja di DIVA CELL. Garansi tukar 7 hari dengan struk ini.");
  const [warranty, setWarranty] = useState("12");

  const sample = useMemo(() => {
    const completed = data.sales.filter((s) => s.status === "completed");
    const sale: Sale | undefined = completed.at(-1);
    if (!sale) return null;
    const items: SaleItem[] = data.saleItems.filter((it) => it.saleId === sale.id);
    return { sale, items };
  }, [data.sales, data.saleItems]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <Card>
        <CardHeader
          title="Cetak dan struk"
          hint="Lebar kertas mengikuti printer termal di kasir. Pratinjau memakai struk terakhir yang benar-benar tercatat."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: "Setelan struk disimpan",
                  body: `Lebar ${width}mm, garansi default ${warranty} bulan.`,
                  tone: "ok",
                })
              }
              icon={<FloppyDisk size={15} />}
              aria-label="Simpan setelan struk"
            >
              Simpan
            </Button>
          }
        />
        <CardBody className="space-y-5">
          <fieldset>
            <legend className="text-[13px] font-medium">Lebar kertas</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["58", "80"] as const).map((option) => {
                const active = width === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWidth(option)}
                    className={cn(
                      "num rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                      active
                        ? "border-border bg-accent-soft text-accent"
                        : "border-border bg-surface-2 text-text-muted hover:text-accent"
                    )}
                  >
                    {option}mm
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-text-muted">
              58mm untuk printer kasir laci, 80mm untuk printer meja yang lebih lega.
            </p>
          </fieldset>

          <Textarea
            label="Pesan kaki struk"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={3}
            hint="Muncul di bagian bawah setiap struk. Hindari janji garansi yang tidak bisa dipenuhi."
          />

          <Select
            label="Masa garansi default"
            value={warranty}
            onChange={(e) => setWarranty(e.target.value)}
            hint="Dipakai saat kasir menambahkan unit berserial tanpa mengetik masa garansi."
          >
            {WARRANTY_OPTIONS.map((m) => (
              <option key={m} value={String(m)}>
                {m} bulan
              </option>
            ))}
          </Select>

          <Alert tone="info" title="Struk digital punya tautan publik">
            Setiap struk punya tautan publik berisi nomor struk, IMEI, dan tanggal garansi. Tautan ini yang dicetak
            sebagai QR, jadi pelanggan bisa membuka riwayat garansi tanpa memasang aplikasi.
          </Alert>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pratinjau struk" hint={`Dirender pada lebar ${width}mm.`} />
        <CardBody className="flex justify-center">
          {sample === null ? (
            <EmptyState
              icon={<Printer size={28} />}
              title="Belum ada struk"
              body="Belum ada transaksi selesai, jadi pratinjau struk belum bisa dibuat."
            />
          ) : (
            <div
              className="num card px-3 py-4 text-[11px] leading-relaxed"
              style={{ width: "58mm" }}
            >
              <div className="flex flex-col items-center gap-1 border-b border-dashed border-border pb-2 text-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent">
                  DC
                </span>
                <span className="text-[12px] font-semibold tracking-[0.14em]">{SHOP.name.toUpperCase()}</span>
                <span className="text-[9.5px] text-text-muted">{data.profile.address}</span>
                <span className="text-[9.5px] text-text-muted">{data.profile.phone}</span>
              </div>

              <div className="flex justify-between border-b border-dashed border-border py-1.5 text-[9.5px] text-text-muted">
                <span>{sample.sale.receiptNo}</span>
                <span>{formatDateTime(sample.sale.createdAt)}</span>
              </div>

              <ul className="space-y-1.5 py-2">
                {sample.items.map((item) => (
                  <li key={item.id}>
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0">{item.name}</span>
                      <span className="shrink-0">{formatRupiah(item.lineTotal)}</span>
                    </div>
                    <div className="text-[9px] text-text-muted">
                      {formatNumber(item.qty)} x {formatRupiah(item.unitPrice)}
                      {item.imei ? ` - IMEI ${item.imei}` : ""}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-dashed border-border pt-1.5">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatRupiah(sample.sale.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Diskon</span>
                  <span>{formatRupiah(sample.sale.discountTotal)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border pt-1 text-[12px] font-semibold">
                  <span>TOTAL</span>
                  <span>{formatRupiah(sample.sale.grandTotal)}</span>
                </div>
              </div>

              <p className="mt-2 border-t border-dashed border-border pt-2 text-[9.5px] leading-snug text-text-muted">
                {footer}
              </p>

              <div className="mt-3 flex flex-col items-center gap-1">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-text-muted"
                  role="img"
                  aria-label="Placeholder QR tautan publik struk"
                >
                  <QrCode size={26} />
                </div>
                <span className="text-[9px] text-text-muted">QR tautan publik</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- ulasan */

function ReviewTab({ data }: { data: Dataset }) {
  const toast = useFrizzy((s) => s.toast);
  const [sendTime, setSendTime] = useState("3 jam");
  const [cooldown, setCooldown] = useState(String(data.profile.reviewCooldownDays));

  const link = `https://search.google.com/local/writereview?placeid=${data.profile.placeId}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Permintaan ulasan Google"
          hint="Satu tautan, tanpa penyaringan, tanpa imbalan."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: "Setelan ulasan disimpan",
                  body: `Kirim ${sendTime}, cooldown ${cooldown} hari.`,
                  tone: "ok",
                })
              }
              icon={<FloppyDisk size={15} />}
              aria-label="Simpan setelan ulasan"
            >
              Simpan
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div>
            <span className="label-caps">Place ID Google</span>
            <p className="num mt-1 break-all rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[12px]">
              {data.profile.placeId}
            </p>
          </div>
          <div>
            <span className="label-caps">Tautan tulis ulasan</span>
            <p className="num mt-1 break-all rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[12px]">
              {link}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-text-muted">
              <Star size={14} weight="fill" /> Pelanggan menulis ulasan di Google, bukan di dalam aplikasi.
            </p>
          </div>
          <Select
            label="Waktu kirim"
            value={sendTime}
            onChange={(e) => setSendTime(e.target.value)}
            hint="Terkirim lewat WhatsApp atau email sesuai persetujuan pelanggan."
          >
            <option value="3 jam">3 jam setelah pembelian</option>
            <option value="besok 10.00">Besok pukul 10.00</option>
          </Select>
          <Input
            label="Cooldown per pelanggan (hari)"
            type="number"
            min={1}
            max={365}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            hint="Jeda minimum sebelum pelanggan yang sama diminta ulasan lagi."
          />
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Aturan yang tidak boleh dilanggar" hint="Pelanggaran bisa membuat profil Google ditangguhkan." />
          <CardBody className="space-y-3">
            <Alert tone="danger" title="Tidak boleh menyaring pelanggan">
              Review gating dilarang. Jangan tanyakan &quot;puas atau tidak?&quot; lalu hanya mengirim tautan ke yang
              puas. Semua pelanggan mendapat tautan yang sama, termasuk yang pernah komplain.
            </Alert>
            <ul className="space-y-2 text-[13px] leading-relaxed text-text-muted">
              <li>Tanpa insentif: tidak ada diskon, hadiah, atau bonus karena menulis ulasan.</li>
              <li>Tidak boleh menulis ulasan atas nama pelanggan, termasuk meminjamkan ponsel kasir.</li>
              <li>Hormati daftar berhenti berlangganan: pelanggan yang menolak tidak dihubungi lagi.</li>
              <li>Permintaan hanya dikirim ke pelanggan yang memberi persetujuan kontak.</li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Statistik permintaan" hint="Dari seluruh permintaan ulasan yang tercatat." />
          <CardBody className="pt-1">
            <DataRow label="Pelanggan dengan persetujuan" value={formatNumber(data.customers.filter((c) => c.consentEmail).length)} />
            <DataRow label="Permintaan terkirim" value={formatNumber(data.reviewRequests.filter((r) => r.sentAt !== null).length)} />
            <DataRow label="Tautan diklik" value={formatNumber(data.reviewRequests.filter((r) => r.clickedAt !== null).length)} />
            <DataRow label="Cooldown aktif" value={`${data.profile.reviewCooldownDays} hari`} hint="Nilai awal dari profil toko" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pembayaran */

function PaymentTab() {
  const toast = useFrizzy((s) => s.toast);
  const [providerKey, setProviderKey] = useState("");

  const channels: { id: string; label: string; status: string; tone: "ok" | "warn" | "neutral" }[] = [
    { id: "qris", label: "QRIS", status: "Aktif - settlement H+1", tone: "ok" },
    { id: "edc", label: "EDC kartu", status: "Aktif - mesin bank", tone: "ok" },
    { id: "transfer", label: "Transfer bank", status: "Verifikasi manual", tone: "warn" },
    { id: "ewallet", label: "E-wallet", status: "Belum dihubungkan", tone: "neutral" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Kanal pembayaran" hint="Status kanal pembayaran. Angka settlement final datang dari penyedia." />
        <CardBody className="space-y-3">
          <ul className="divide-y divide-border">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <CreditCard size={16} className="text-text-muted" />
                  {c.label}
                </span>
                <Badge tone={c.tone}>{c.status}</Badge>
              </li>
            ))}
          </ul>
          <Alert tone="info" title="Data kartu tidak pernah disimpan">
            Nomor kartu, CVV, dan jalur magnetik tidak pernah masuk ke sistem ini. Yang disimpan hanya referensi
            transaksi dari penyedia, sehingga ruang lingkup PCI DSS bisa dihindari sepenuhnya.
          </Alert>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Kunci penyedia"
          hint="Dikirim sekali ke server, tidak pernah ditampilkan kembali."
          action={
            <Button
              variant="primary"
              size="sm"
              disabled={providerKey.length === 0}
              onClick={() => {
                setProviderKey("");
                toast({
                  title: "Kunci penyedia disimpan",
                  body: "Kunci bersifat write-only: setelah disimpan, nilainya tidak bisa dibaca lagi dari antarmuka.",
                  tone: "ok",
                });
              }}
              icon={<Key size={15} />}
              aria-label="Simpan kunci penyedia pembayaran"
            >
              Simpan
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <Input
            label="Kunci API penyedia (write-only)"
            type="password"
            value={providerKey}
            onChange={(e) => setProviderKey(e.target.value)}
            placeholder="sk_live_..."
            autoComplete="new-password"
            hint="Disimpan terenkripsi di server. Isi ulang hanya bila kunci dirotasi."
          />
          <ul className="space-y-2 text-[13px] leading-relaxed text-text-muted">
            <li className="flex gap-2">
              <LockKey size={15} className="mt-0.5 shrink-0 text-text-muted" />
              Kunci disimpan di server dan hanya dipakai untuk memanggil penyedia, bukan disimpan di peramban.
            </li>
            <li className="flex gap-2">
              <CheckCircle size={15} className="mt-0.5 shrink-0 text-text-muted" />
              Rotasi kunci dicatat di audit log beserta pengguna yang melakukannya.
            </li>
            <li className="flex gap-2">
              <Warning size={15} className="mt-0.5 shrink-0 text-text-muted" />
              Jangan pernah menempelkan kunci ke catatan transaksi atau pesan pelanggan.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- pajak */

function TaxTab({ data }: { data: Dataset }) {
  const toast = useFrizzy((s) => s.toast);
  const [enabled, setEnabled] = useState(data.profile.taxEnabled);
  const [pct, setPct] = useState(String(data.profile.taxPct));

  const rate = Number.parseFloat(pct.replace(",", "."));
  const safeRate = Number.isFinite(rate) ? Math.max(0, Math.min(30, rate)) : 0;
  const lastSale = data.sales.filter((s) => s.status === "completed").at(-1);
  const base = lastSale ? lastSale.grandTotal : 0;
  const taxValue = Math.round((base * safeRate) / 100);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Pajak"
          hint="Nonaktif secara default agar tidak ada tagihan yang muncul tanpa sengaja."
          action={<Badge tone={enabled ? "ok" : "neutral"}>{enabled ? "Aktif" : "Nonaktif"}</Badge>}
        />
        <CardBody className="space-y-4">
          <Checkbox
            label="Aktifkan pajak pada struk"
            checked={enabled}
            onChange={setEnabled}
            hint="Bila aktif, pajak dihitung di baris terpisah pada struk dan laporan."
          />
          <Input
            label="Persentase pajak"
            type="number"
            min={0}
            max={30}
            step={0.1}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            disabled={!enabled}
            hint="Contoh: 11 untuk PPN 11%."
          />
          <DataRow label="Dasar perhitungan (struk terakhir)" value={lastSale ? lastSale.receiptNo : "-"} />
          <DataRow label="Nilai penjualan" value={formatRupiah(base)} />
          <DataRow label="Pajak terhitung" value={formatRupiah(taxValue)} strong />
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Setelan pajak disimpan",
                body: enabled ? `Pajak aktif pada ${formatNumber(safeRate, 1)}%.` : "Pajak dinonaktifkan.",
                tone: enabled ? "warn" : "info",
              })
            }
            icon={<Percent size={15} />}
            aria-label="Simpan setelan pajak"
          >
            Simpan setelan pajak
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sebelum mengaktifkan" hint="Pajak bukan sekadar angka di struk." />
        <CardBody className="space-y-3">
          <Alert tone="warn" title="Konfirmasi ke konsultan pajak lebih dulu">
            Status pengusaha kena pajak, jenis pajak yang berlaku, dan dasar pengenaan berbeda untuk setiap bentuk
            usaha. Pastikan ke konsultan pajak sebelum menyalakan opsi ini supaya struk dan faktur tidak salah.
          </Alert>
          <ul className="space-y-2 text-[13px] leading-relaxed text-text-muted">
            <li>Simpan nomor faktur pajak dan dokumen pendukung minimal sesuai masa simpan yang diwajibkan.</li>
            <li>Pisahkan pajak keluaran dan masukan agar pelaporan bulanan tidak tercampur dengan kas harian.</li>
            <li>Uji satu struk contoh dan bandingkan dengan perhitungan manual sebelum dipakai di jam sibuk.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ notifikasi */

function NotificationTab() {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const rule of NOTIFICATION_RULES) initial[rule.id] = rule.on;
    return initial;
  });

  const activeCount = Object.values(state).filter(Boolean).length;

  return (
    <Card>
      <CardHeader
        title="Aturan notifikasi"
        hint="Notifikasi dikirim ke pemilik lewat aplikasi dan WhatsApp bisnis."
        action={<Badge tone={activeCount > 0 ? "ok" : "neutral"}>{formatNumber(activeCount)} aktif</Badge>}
      />
      <CardBody className="space-y-4">
        <ul className="divide-y divide-border">
          {NOTIFICATION_RULES.map((rule) => (
            <li key={rule.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{rule.label}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{rule.hint}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[12px] text-text-muted">{state[rule.id] ? "Aktif" : "Mati"}</span>
                <Checkbox
                  label={state[rule.id] ? "Matikan" : "Aktifkan"}
                  checked={state[rule.id] ?? false}
                  onChange={(next) => setState((prev) => ({ ...prev, [rule.id]: next }))}
                />
              </div>
            </li>
          ))}
        </ul>
        <Alert tone="info" title="Jangan sampai banjir notifikasi">
          Notifikasi yang terlalu sering akan diabaikan. Mulai dari aturan yang paling berdampak pada kas, lalu tambah
          satu per satu sambil melihat apakah benar-benar ditindaklanjuti.
        </Alert>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------- ai */

function AiTab() {
  const toast = useFrizzy((s) => s.toast);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("analisis");
  const [budget, setBudget] = useState(250_000);
  const [redact, setRedact] = useState(true);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Kunci API"
          hint="Write-only: setelah disimpan, nilainya tidak bisa dibaca lagi dari antarmuka."
          action={
            <Button
              variant="primary"
              size="sm"
              disabled={apiKey.length === 0}
              onClick={() => {
                setApiKey("");
                toast({
                  title: "Kunci API disimpan",
                  body: "Kunci disimpan di server dan hanya dipakai untuk meringkas fakta metrik.",
                  tone: "ok",
                });
              }}
              icon={<Key size={15} />}
              aria-label="Simpan kunci API penyedia model"
            >
              Simpan
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <Input
            label="Kunci API (write-only)"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="kunci rahasia penyedia model"
            autoComplete="new-password"
          />
          <Alert tone="info" title="Kunci disimpan di server">
            Peramban tidak menyimpan kunci ini. Permintaan ke penyedia model dikirim dari server, dan yang dikirim hanya
            fakta metrik, bukan basis data konter.
          </Alert>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Model dan batas" hint="Dua model dengan tugas berbeda supaya biaya tetap terkendali." />
        <CardBody className="space-y-4">
          <Select
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            hint="Model analisis untuk narasi dan strategi, model klasifikasi untuk kategori dan tag."
          >
            <option value="analisis">Analisis - narasi, ringkasan, rekomendasi</option>
            <option value="klasifikasi">Klasifikasi - kategori produk, tag, sentimen ulasan</option>
          </Select>
          <MoneyInput
            label="Batas anggaran bulanan"
            value={budget}
            onValueChange={setBudget}
            hint="Bila anggaran habis, AI Analyst otomatis memakai jawaban berbasis aturan saja."
          />
          <Checkbox
            label="Redaksi data pribadi (PII)"
            checked={redact}
            onChange={setRedact}
            hint="Nama, nomor telepon, email, dan IMEI disamarkan sebelum dikirim ke penyedia model. Default aktif."
          />
          {!redact ? (
            <Alert tone="warn" title="PII akan ikut terkirim">
              Tanpa redaksi, data pelanggan bisa masuk ke penyedia pihak ketiga. Nyalakan kembali kecuali ada dasar
              hukum yang jelas.
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Badge tone="ok" icon={<Sparkle size={13} weight="fill" />}>
              Angka selalu dari mesin metrik
            </Badge>
            <Badge tone="neutral" icon={<Robot size={13} />}>
              {model === "analisis" ? "Model analisis" : "Model klasifikasi"}
            </Badge>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ data */

function DataTab({ data }: { data: Dataset }) {
  const toast = useFrizzy((s) => s.toast);
  const requestApproval = useFrizzy((s) => s.requestApproval);

  const exportAll = () => {
    const lines: string[] = [];
    lines.push("PENJUALAN");
    lines.push(["no_struk", "tanggal", "status", "subtotal", "diskon", "total", "hpp", "margin"].join(","));
    for (const s of data.sales) {
      lines.push(
        [s.receiptNo, s.createdAt, s.status, s.subtotal, s.discountTotal, s.grandTotal, s.cogsTotal, s.grandTotal - s.cogsTotal]
          .map((cell) => csvCell(String(cell)))
          .join(",")
      );
    }
    lines.push("");
    lines.push("PRODUK");
    lines.push(["sku", "nama", "jenis", "harga_pokok", "harga_jual", "harga_minimum"].join(","));
    for (const p of data.products) {
      lines.push([p.sku, p.name, p.kind, p.cost, p.price, p.minPrice].map((cell) => csvCell(String(cell))).join(","));
    }
    lines.push("");
    lines.push("KAS");
    lines.push(["tanggal", "arah", "kategori", "label", "jumlah"].join(","));
    for (const c of data.cashTransactions) {
      lines.push([c.occurredAt, c.direction, c.category, c.label, c.amount].map((cell) => csvCell(String(cell))).join(","));
    }

    const csv = lines.join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `frizzy-export-${data.asOf.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Ekspor dibuat",
      body: `${formatNumber(data.sales.length)} penjualan, ${formatNumber(data.products.length)} produk, dan ${formatNumber(data.cashTransactions.length)} baris kas diunduh.`,
      tone: "ok",
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Ekspor dan cadangan" hint="Data tetap milik konter: bisa diunduh kapan saja." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={exportAll}
              icon={<DownloadSimple size={16} />}
              aria-label="Ekspor semua data ke CSV"
            >
              Ekspor semua data (CSV)
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() =>
                toast({
                  title: "Pulihkan dari cadangan",
                  body: "Unggah berkas cadangan untuk memulihkan data. Aksi ini butuh persetujuan pemilik di produksi.",
                  tone: "info",
                })
              }
              icon={<UploadSimple size={16} />}
              aria-label="Pulihkan data dari berkas cadangan"
            >
              Pulihkan
            </Button>
          </div>
          <div className="hairline pt-1">
            <DataRow label="Cadangan terakhir" value={formatDate(data.asOf)} hint="Waktu cadangan terakhir dibuat" />
            <DataRow label="Ukuran berkas" value="1,2 MB" hint="Terenkripsi saat diunggah" />
            <DataRow label="Baris tersimpan" value={formatNumber(18_420)} hint="Seluruh tabel, termasuk unit IMEI" />
            <DataRow
              label="Status"
              value={
                <Badge tone="ok" icon={<CheckCircle size={13} weight="fill" />}>
                  Berhasil
                </Badge>
              }
              hint="Cadangan harian pukul 23.00 WIB"
            />
          </div>
          <Alert tone="info" title="Retensi 90 hari">
            Cadangan disimpan 90 hari, lalu dihapus otomatis. Simpan salinan di penyimpanan sendiri untuk arsip pajak
            jangka panjang.
          </Alert>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Zona bahaya"
            hint="Aksi di bawah ini tidak bisa dibatalkan."
            action={
              <Badge tone="danger" icon={<Trash size={13} weight="fill" />}>
                Iritasi
              </Badge>
            }
          />
          <CardBody className="space-y-4">
            <Alert tone="danger" title="Hapus semua data">
              Menghapus seluruh penjualan, stok, unit IMEI, kas, dan audit log. Cadangan terakhir tetap ada, tetapi
              transaksi setelah cadangan itu hilang permanen.
            </Alert>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                requestApproval({
                  kind: "sensitive",
                  message:
                    "Menghapus semua data konter. Di produksi aksi ini wajib memakai PIN pemilik dan verifikasi dua langkah.",
                  onApprove: () =>
                    toast({
                      title: "Penghapusan disetujui pemilik",
                      body: "Setelah disetujui pemilik, penghapusan berjalan bertahap dan setiap langkahnya dicatat di audit log.",
                      tone: "danger",
                    }),
                });
                toast({
                  title: "Butuh PIN + 2FA",
                  body: "Di produksi, menghapus semua data wajib memakai PIN pemilik dan verifikasi dua langkah. Aksi ini dicatat di audit log.",
                  tone: "warn",
                });
              }}
              icon={<Trash size={16} weight="fill" />}
              aria-label="Hapus semua data konter"
            >
              Hapus semua data
            </Button>
            <p className="text-[12px] leading-snug text-text-muted">
              Alternatif yang lebih aman: ekspor dulu, uji pemulihan di lingkungan latihan, baru hapus bila memang
              diperlukan.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ringkasan isi data" hint="Apa saja yang ikut terhapus atau terekspor." />
          <CardBody className="pt-1">
            <DataRow label="Penjualan" value={formatNumber(data.sales.length)} />
            <DataRow label="Baris penjualan" value={formatNumber(data.saleItems.length)} />
            <DataRow label="Produk" value={formatNumber(data.products.length)} />
            <DataRow label="Unit berserial" value={formatNumber(data.units.length)} />
            <DataRow label="Transaksi kas" value={formatNumber(data.cashTransactions.length)} />
            <DataRow label="Baris audit" value={formatNumber(data.auditLog.length)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Bantuan" hint="Kalau ragu, mulai dari sini." />
          <CardBody>
            <ul className="space-y-2 text-[13px] leading-relaxed text-text-muted">
              <li className="flex gap-2">
                <Database size={15} className="mt-0.5 shrink-0 text-text-muted" />
                Ekspor CSV bisa dibuka di aplikasi spreadsheet mana pun, tanpa perangkat lunak tambahan.
              </li>
              <li className="flex gap-2">
                <Bell size={15} className="mt-0.5 shrink-0 text-text-muted" />
                Aktifkan notifikasi cadangan gagal supaya tidak diam-diam berhenti.
              </li>
              <li className="flex gap-2">
                <Storefront size={15} className="mt-0.5 shrink-0 text-text-muted" />
                Profil toko {data.profile.name} dipakai di struk, tautan ulasan, dan ringkasan harian.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
