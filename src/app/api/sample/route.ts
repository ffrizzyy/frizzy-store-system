import { NextResponse } from "next/server";
import { generateDataset } from "@/lib/generator";

export const dynamic = "force-static";
export const revalidate = 3600;

/** Data operasional konter: dipakai aplikasi untuk menghitung stok, kas, dan laporan. */
export function GET() {
  const data = generateDataset();
  return NextResponse.json(
    { data, generatedAt: new Date().toISOString(), note: "Ringkasan data operasional konter Diva Cell." },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
