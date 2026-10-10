import type { SVGProps } from "react";

/**
 * Mark Diva Cell, dilacak langsung dari logo resmi yang diberikan pemilik
 * konter. Geometrinya bukan perkiraan: kontur gambar asli ditelusuri dan
 * disederhanakan, lalu diverifikasi ulang terhadap gambar itu
 * (IoU 0,953 untuk bagian putih dan 0,972 untuk pita oranye).
 *
 * viewBox 0 0 100 100 di dalam kotak mark sendiri (rasio sekitar 2,1 : 1).
 * Bentuk aslinya putih dengan satu pita oranye, jadi di latar terang mark
 * diletakkan di atas bidang gelap agar tetap sesuai identitas aslinya.
 */

const WHITE_PATHS = [
  "M19.23 0 L38.11 39.56 L47.38 39.56 L51.75 30.4 L42.48 30.04 L28.15 0 Z",
  "M57.34 0 L43.01 30.04 L51.92 30.04 L66.26 0 Z",
  "M71.5 0 L67.13 9.16 L76.22 9.52 L90.56 39.56 L99.65 39.56 L80.59 0 Z",
  "M0 2.93 L0 19.05 L14.51 49.45 L0 80.59 L0 96.7 L1.22 96.7 L18.71 60.07 L18.88 39.93 L1.22 2.93 Z",
  "M66.96 9.52 L52.62 39.56 L61.54 39.56 L75.87 9.52 Z",
];

const ORANGE_PATHS = ["M5.07 0 L23.95 39.56 L32.87 39.56 L13.99 0 Z"];

/** Rasio mark: lebar dibagi tinggi (dari kotak 572 x 273 piksel). */
export const MARK_RATIO = 572 / 273;

export type MarkVariant = "light" | "dark" | "tile";

/**
 * variant:
 * - "light"  : mark putih + oranye, untuk latar gelap
 * - "dark"   : mark gelap + oranye, untuk latar terang
 * - "tile"   : mark putih di atas bidang gelap membulat, aman di latar apa pun
 */
export function DivaCellMark({
  size = 30,
  variant = "tile",
  className,
  ...rest
}: { size?: number; variant?: MarkVariant } & SVGProps<SVGSVGElement>) {
  const ink = variant === "dark" ? "var(--logo-ink, #111214)" : "#FFFFFF";
  const height = size;
  const width = Math.round(size * MARK_RATIO);

  const mark = (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      width={width}
      height={height}
      role="img"
      aria-label="Diva Cell"
      {...rest}
    >
      {WHITE_PATHS.map((d) => (
        <path key={d} d={d} fill={ink} />
      ))}
      {ORANGE_PATHS.map((d) => (
        <path key={d} d={d} fill="var(--logo-accent, #E2683A)" />
      ))}
    </svg>
  );

  if (variant !== "tile") return mark;

  /* Bidang gelap membulat: mark asli memang putih di atas hitam. */
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--logo-tile, #111214)",
        borderRadius: Math.max(6, Math.round(size * 0.26)),
        padding: Math.max(3, Math.round(size * 0.16)),
        lineHeight: 0,
      }}
    >
      {mark}
    </span>
  );
}

export function DivaCellLogo({
  size = 30,
  variant = "tile",
  showSystem = true,
}: {
  size?: number;
  variant?: MarkVariant;
  showSystem?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <DivaCellMark size={size} variant={variant} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-text">Diva Cell</span>
        {showSystem ? (
          <span className="num text-[10px] uppercase tracking-[0.16em] text-text-faint">Frizzy</span>
        ) : null}
      </span>
    </span>
  );
}

/** Versi kecil untuk kepala struk termal. */
export function ReceiptMark({ size = 26 }: { size?: number }) {
  return <DivaCellMark size={size} variant="dark" />;
}
