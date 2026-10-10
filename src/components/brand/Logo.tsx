import type { SVGProps } from "react";

/**
 * Logo Diva Cell: mark geometris (chevron + bilah) dengan satu aksen oranye.
 * Dipakai konsisten di landing, app shell, dan struk.
 */
export function DivaCellMark({ size = 32, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" {...rest}>
      <path d="M20 14 L52 14 L20 50 Z" fill="var(--logo-ink, #111214)" />
      <path d="M20 50 L52 14 L98 14 L66 50 Z" fill="var(--logo-accent, #E2683A)" />
      <path d="M36 50 L68 14 L98 14 L66 50 Z" fill="var(--logo-ink, #111214)" />
      <path d="M20 50 L98 50 L98 65 L20 65 Z" fill="var(--logo-ink, #111214)" />
      <path d="M20 65 L49 95 L20 95 Z" fill="var(--logo-ink, #111214)" />
    </svg>
  );
}

export function DivaCellLogo({ size = 32, showSystem = true }: { size?: number; showSystem?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <DivaCellMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-text">Diva Cell</span>
        {showSystem ? (
          <span className="num text-[10px] uppercase tracking-[0.16em] text-text-faint">Frizzy</span>
        ) : null}
      </span>
    </span>
  );
}

/** Versi kecil untuk struk termal. */
export function ReceiptMark({ size = 26 }: { size?: number }) {
  return <DivaCellMark size={size} />;
}
