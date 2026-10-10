import Link from "next/link";
import { DivaCellMark } from "@/components/brand/Logo";
import { NAV } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[720px] flex-col items-center justify-center px-4 text-center">
      <DivaCellMark size={44} />
      <p className="num mt-6 text-[12px] uppercase tracking-[0.2em] text-text-faint">404</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-text md:text-[34px]">
        Halaman ini tidak ada di rak.
      </h1>
      <p className="measure mt-3 text-[14px] leading-relaxed text-text-muted">
        Alamatnya mungkin salah ketik atau sudah dipindahkan. Dari sini Anda bisa langsung masuk ke kasir, melihat stok, atau
        kembali ke halaman utama.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link
          href="/app/pos"
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Buka POS
        </Link>
        <Link
          href="/app"
          className="inline-flex h-11 items-center rounded-[10px] border border-border-strong bg-surface px-5 text-[14px] font-medium text-text transition-colors hover:bg-surface-2"
        >
          Buka dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[10px] px-5 text-[14px] font-medium text-text-muted transition-colors hover:text-text"
        >
          Halaman utama
        </Link>
      </div>

      <div className="mt-10 w-full border-t border-border pt-5">
        <p className="label-caps mb-3">Halaman yang tersedia</p>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[13px]">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-text-muted transition-colors hover:text-text">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
