"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Barcode,
  Plus,
  Storefront,
  Info,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useFrizzy, useCtx } from "@/lib/store";
import { formatRupiah, formatNumber } from "@/lib/money";
import type { ID, MovementReason, Product } from "@/lib/types";
import { Overlay, Tabs } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Alert, Badge } from "@/components/ui/Feedback";
import { Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";

type Mode = "cepat" | "po" | "imei";

/**
 * Alur "Tambah stok" yang bisa dibuka dari mana saja.
 * Tiga cara masuk barang: penyesuaian cepat, penerimaan barang dari supplier,
 * dan pemasukan unit per IMEI untuk handset.
 */
export function AddStockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useCtx();
  const data = ctx.data;
  const role = useFrizzy((s) => s.role);
  const userId = useFrizzy((s) => s.userId);
  const mutate = useFrizzy((s) => s.mutate);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const toast = useFrizzy((s) => s.toast);

  const [mode, setMode] = useState<Mode>("cepat");
  const [productId, setProductId] = useState<ID>("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [reason, setReason] = useState<MovementReason>("purchase");
  const [note, setNote] = useState("");
  const [imeis, setImeis] = useState("");
  const [importer, setImporter] = useState("");

  const products = useMemo(
    () => [...data.products].filter((p) => p.kind !== "service").sort((a, b) => a.name.localeCompare(b.name)),
    [data.products]
  );
  const selected: Product | null = products.find((p) => p.id === productId) ?? null;
  const metric = selected ? ctx.byProduct.get(selected.id) : null;

  useEffect(() => {
    if (!open) return;
    if (!selected && products[0]) {
      setProductId(products[0].id);
      setUnitCost(products[0].cost);
    }
  }, [open, products, selected]);

  useEffect(() => {
    if (selected) setUnitCost(selected.cost);
  }, [selected]);

  const suppliers = data.suppliers;
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");

  const parsedImeis = imeis
    .split(/[\s,;]+/)
    .map((s) => s.replace(/[^\d]/g, ""))
    .filter((s) => s.length > 0);
  const validImeis = parsedImeis.filter((s) => /^\d{15}$/.test(s));
  const duplicateImeis = parsedImeis.filter((s, i) => parsedImeis.indexOf(s) !== i);
  const existingImeis = parsedImeis.filter((s) => data.units.some((u) => u.imei1 === s || u.imei2 === s));

  const totalValue = selected ? qty * (mode === "imei" ? selected.cost : unitCost || selected.cost) : 0;

  const reset = () => {
    setQty(1);
    setNote("");
    setImeis("");
    setImporter("");
  };

  const doQuick = () => {
    if (!selected) return;
    const delta = mode === "imei" ? validImeis.length : qty;
    if (delta <= 0) {
      toast({ title: "Jumlah belum diisi", body: "Masukkan jumlah barang yang masuk.", tone: "warn" });
      return;
    }
    if (mode === "imei" && validImeis.length === 0) {
      toast({ title: "IMEI belum valid", body: "Setiap IMEI harus 15 digit angka.", tone: "warn" });
      return;
    }
    if (!userId) return;

    const apply = () => {
      mutate({
        type: "adjust_stock",
        productId: selected.id,
        qtyDelta: delta,
        reason: mode === "po" ? "purchase" : reason,
        note:
          note ||
          (mode === "po"
            ? `Penerimaan barang dari ${suppliers.find((s) => s.id === supplierId)?.name ?? "supplier"}`
            : "Tambah stok manual"),
        actorId: userId,
      });
      toast({
        title: "Stok ditambahkan",
        body: `${delta} unit ${selected.name} masuk ke ledger stok.`,
        tone: "ok",
      });
      reset();
      onClose();
    };

    if (role === "staff" && mode === "po") {
      requestApproval({
        kind: "sensitive",
        message: "Penerimaan barang dari supplier dicatat atas nama kasir; pemilik perlu menyetujui.",
        onApprove: apply,
      });
      return;
    }
    apply();
  };

  const stockNow = metric?.qty ?? 0;
  const after = stockNow + (mode === "imei" ? validImeis.length : qty);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Tambah stok"
      description="Semua penambahan tercatat di ledger stok dan audit log."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] text-text-muted">
            {selected ? (
              <>
                Stok sekarang <span className="num font-medium text-text">{formatNumber(stockNow)}</span> {"->"} setelah
                masuk <span className="num font-medium text-accent">{formatNumber(after)}</span>
              </>
            ) : (
              "Pilih produk dulu"
            )}
            {totalValue > 0 ? (
              <>
                {" "}
                - nilai <span className="num font-medium text-text">{formatRupiah(totalValue)}</span>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button variant="primary" onClick={doQuick} disabled={!selected} data-testid="confirm-add-stock">
              Tambah ke stok
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Tabs
          value={mode}
          onChange={(id) => setMode(id as Mode)}
          tabs={[
            { id: "cepat", label: "Penyesuaian cepat" },
            { id: "po", label: "Terima dari supplier" },
            { id: "imei", label: "Masuk per IMEI" },
          ]}
        />

        {mode === "po" ? (
          <Alert tone="info" title="Penerimaan barang tercatat sebagai pembelian">
            Di produksi, langkah ini menautkan barang masuk ke nomor PO sehingga utang supplier dan jatuh temponya otomatis
            ikut tercatat di halaman Pembelian.
          </Alert>
        ) : null}

        {mode === "imei" ? (
          <Alert tone="warn" title="Produk ini dicatat per unit">
            Setiap IMEI menjadi satu unit tersendiri dengan garansi dan riwayatnya sendiri. IMEI ganda atau sudah
            terdaftar akan ditolak.
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Produk"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            hint={selected ? `${selected.sku} - jenis ${selected.kind}` : undefined}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </Select>

          {mode === "po" ? (
            <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} - termin {s.paymentTermsDays} hari
                </option>
              ))}
            </Select>
          ) : (
            <Select
              label="Alasan penambahan"
              value={reason}
              onChange={(e) => setReason(e.target.value as MovementReason)}
              hint="Pilih Pembelian untuk barang dari supplier, Penyesuaian untuk koreksi hitungan."
            >
              <option value="purchase">Pembelian dari supplier</option>
              <option value="adjust">Penyesuaian / koreksi</option>
              <option value="opname">Hasil opname</option>
              <option value="return">Barang retur masuk kembali</option>
              <option value="transfer">Transfer antar konter</option>
            </Select>
          )}

          {mode === "imei" ? (
            <div className="md:col-span-2">
              <Textarea
                label="Daftar IMEI (satu per baris atau dipisah koma)"
                value={imeis}
                onChange={(e) => setImeis(e.target.value)}
                placeholder={"356789012345678\n356789012345686"}
                hint={`${validImeis.length} IMEI valid dari ${parsedImeis.length} baris.`}
                error={
                  duplicateImeis.length > 0
                    ? `Ada IMEI ganda: ${duplicateImeis.slice(0, 3).join(", ")}`
                    : existingImeis.length > 0
                      ? `IMEI sudah terdaftar: ${existingImeis.slice(0, 3).join(", ")}`
                      : null
                }
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {parsedImeis.slice(0, 8).map((v) => (
                  <Badge key={v} tone={/^\d{15}$/.test(v) ? "ok" : "warn"} icon={<Barcode size={12} />}>
                    {v.slice(-6)}
                  </Badge>
                ))}
                {parsedImeis.length > 8 ? (
                  <span className="num text-[11.5px] text-text-faint">+{parsedImeis.length - 8} lagi</span>
                ) : null}
              </div>
            </div>
          ) : (
            <Input
              label="Jumlah masuk"
              inputMode="numeric"
              value={String(qty)}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value.replace(/[^\d]/g, "")) || 1))}
              hint={`Stok sekarang ${formatNumber(stockNow)} unit.`}
            />
          )}

          {mode === "po" ? (
            <MoneyInput
              label="Harga beli per unit"
              value={unitCost}
              onValueChange={setUnitCost}
              hint={
                selected
                  ? `Harga pokok tercatat ${formatRupiah(selected.cost)}. Selisih lebih dari 3% akan ditandai.`
                  : undefined
              }
            />
          ) : null}

          {mode === "imei" ? (
            <Input
              label="Asal barang (opsional)"
              value={importer}
              onChange={(e) => setImporter(e.target.value)}
              placeholder="Contoh: PT Sinar Handphone Jaya"
            />
          ) : (
            <Input
              label="Catatan (opsional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: kiriman pagi dari supplier"
            />
          )}
        </div>

        <div className="rounded-[10px] bg-surface-2 px-4 py-3.5">
          <p className="label-caps mb-2">Yang akan tercatat</p>
          <ul className="space-y-1.5 text-[12.5px] text-text-muted">
            <li className="flex items-start gap-2">
              <Package size={15} className="mt-0.5 shrink-0 text-accent" />
              Satu baris ledger stok masuk, tidak pernah menimpa angka stok sebelumnya.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle size={15} className="mt-0.5 shrink-0 text-accent" />
              Audit log mencatat siapa, kapan, dan berapa jumlahnya.
            </li>
            <li className="flex items-start gap-2">
              <Storefront size={15} className="mt-0.5 shrink-0 text-accent" />
              Produk langsung bisa dijual di POS begitu tersimpan.
            </li>
          </ul>
        </div>

        {selected && unitCost > 0 && Math.abs(unitCost - selected.cost) / selected.cost > 0.03 && mode === "po" ? (
          <Alert tone="warn" title="Harga beli berbeda dari harga pokok">
            Selisih {(Math.abs(unitCost - selected.cost) / selected.cost * 100).toFixed(1)}% dari harga pokok tercatat{" "}
            {formatRupiah(selected.cost)}. Periksa apakah ada perubahan harga dari supplier.
          </Alert>
        ) : null}

        <p className="flex items-start gap-2 text-[12px] text-text-faint">
          <Info size={14} className="mt-0.5 shrink-0" />
          Cara lain: buka halaman Pembelian untuk menerima barang dengan nomor PO, atau Stok lalu tab Penyesuaian untuk
          koreksi hasil hitung.
        </p>
      </div>
    </Overlay>
  );
}
