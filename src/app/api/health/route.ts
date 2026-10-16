import { NextResponse } from "next/server";

/** Selalu dievaluasi per-request: uptime berubah tiap panggilan, jadi jangan di-cache. */
export const dynamic = "force-dynamic";

/**
 * Pemeriksaan kesehatan ringan untuk load balancer, Docker HEALTHCHECK, dan uptime monitor.
 * Sengaja tidak mengimpor dataset/metrik apa pun agar respons tetap murah dan cepat.
 */
export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      app: "frizzy",
      time: new Date().toISOString(),
      uptimeSec: process.uptime(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
