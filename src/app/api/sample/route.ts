import { NextResponse } from "next/server";
import { generateDataset } from "@/lib/generator";

export const dynamic = "force-static";
export const revalidate = 3600;

/** Data contoh deterministik untuk mode demo. Tidak ada data nyata di sini. */
export function GET() {
  const data = generateDataset();
  return NextResponse.json(
    { data, generatedAt: new Date().toISOString(), note: "Data sintetis skenario cash crisis untuk demo Frizzy." },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
