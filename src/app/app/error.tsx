"use client";

import { useEffect } from "react";
import { WarningOctagon, ArrowCounterClockwise, House } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

/**
 * Batas galat untuk seluruh halaman /app. Satu blok yang gagal tidak boleh
 * membuat seluruh dashboard kosong: pengguna diberi penjelasan dan dua jalan keluar.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* Di produksi di sini dikirim ke Sentry tanpa data pribadi. */
    console.error("Galat halaman app:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-[720px] py-10">
      <Card>
        <CardBody className="flex flex-col items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger">
            <WarningOctagon size={22} weight="fill" />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-text">Halaman ini gagal dimuat</h1>
            <p className="measure mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
              Bagian lain aplikasi tetap berjalan. Coba muat ulang halaman ini; kalau masih gagal, kembali ke dashboard dan
              laporkan ke pemilik sistem.
            </p>
          </div>

          <div className="w-full rounded-[10px] border border-border bg-surface-2 px-4 py-3">
            <p className="label-caps mb-1">Pesan teknis</p>
            <p className="num break-words text-[12px] leading-relaxed text-text-muted">
              {error.message || "Tanpa pesan"}
              {error.digest ? ` (digest ${error.digest})` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<ArrowCounterClockwise size={16} />} onClick={reset}>
              Coba lagi
            </Button>
            <a
              href="/app"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              <House size={16} />
              Kembali ke dashboard
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
