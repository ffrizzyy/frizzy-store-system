"use client";

import { useEffect, useState } from "react";
import { LockKey, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { useFrizzy } from "@/lib/store";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Gerbang PIN pemilik. Dipakai untuk aksi sensitif: diskon di atas batas,
 * harga di bawah minimum, void, dan perubahan setelan kas.
 */
export function PinGate() {
  const approval = useFrizzy((s) => s.approval);
  const clear = useFrizzy((s) => s.clearApproval);
  const data = useFrizzy((s) => s.data);
  const userId = useFrizzy((s) => s.userId);
  const toast = useFrizzy((s) => s.toast);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (approval) {
      setPin("");
      setError(null);
    }
  }, [approval]);

  if (!approval) return null;

  const ownerPin = data?.users.find((u) => u.role === "owner")?.pin ?? "2468";

  const submit = () => {
    if (pin === ownerPin) {
      approval.onApprove();
      toast({ title: "Disetujui pemilik", body: "Aksi sensitif dicatat di audit log.", tone: "ok" });
      clear();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setError(next >= 3 ? "PIN salah tiga kali. Coba lagi atau batalkan transaksi." : "PIN tidak cocok.");
    setPin("");
  };

  return (
    <Overlay
      open
      onClose={clear}
      size="sm"
      title="Persetujuan pemilik"
      description="Aksi ini di luar batas wewenang kasir."
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="num text-[11.5px] text-text-faint">PIN contoh: 2468</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={clear}>
              Batalkan
            </Button>
            <Button variant="primary" onClick={submit} disabled={pin.length < 4}>
              Setujui
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-[10px] border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <LockKey size={18} weight="fill" className="mt-0.5 shrink-0" />
          <p>{approval.message}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="pin-input" className="text-[13px] font-medium text-text">
            PIN pemilik
          </label>
          <input
            id="pin-input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/[^\d]/g, ""));
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin.length >= 4) submit();
            }}
            className={cn(
              "num w-full rounded-[10px] border bg-surface px-3 py-2.5 text-center text-[22px] tracking-[0.5em] text-text focus:border-accent focus:outline-none",
              error ? "border-danger" : "border-border-strong"
            )}
            placeholder="••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "pin-error" : undefined}
          />
          {error ? (
            <p id="pin-error" className="text-[12px] font-medium text-danger">
              {error}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[12px] text-text-faint">
              <ShieldCheck size={14} /> Percobaan PIN dicatat beserta perangkat yang menyetujui.
            </p>
          )}
        </div>

        <p className="text-[12px] leading-relaxed text-text-faint">
          Pemilik yang sedang masuk: {data?.users.find((u) => u.id === userId)?.name ?? "belum dipilih"}
        </p>
      </div>
    </Overlay>
  );
}
