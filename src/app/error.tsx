"use client";

import { WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

/** Batas galat tingkat akar: menangkap kegagalan pada halaman publik. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-[640px] items-center px-4">
      <Card className="w-full">
        <CardBody className="flex flex-col items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger">
            <WarningOctagon size={22} weight="fill" />
          </span>
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight text-text">Terjadi kesalahan</h1>
            <p className="measure mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
              Halaman ini tidak bisa ditampilkan. Coba muat ulang; bila tetap gagal, buka halaman data konter atau hubungi
              pemilik.
            </p>
          </div>
          <p className="num w-full break-words rounded-[10px] border border-border bg-surface-2 px-4 py-3 text-[12px] text-text-muted">
            {error.message || "Tanpa pesan"}
            {error.digest ? ` (digest ${error.digest})` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={reset}>
              Coba lagi
            </Button>
            <a
              href="/data-konter"
              className="inline-flex h-10 items-center rounded-[10px] border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              Lihat data konter
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
