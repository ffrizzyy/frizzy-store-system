import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* Hasilkan server mandiri (.next/standalone) agar image Docker kecil:
     Node server plus hanya dependensi runtime yang benar-benar dipakai. */
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "recharts"],
  },
  /* Typecheck dijalankan sebagai langkah terpisah (`pnpm typecheck`) agar build
     tidak men-spawn proses tsc sendiri. Ini juga mempercepat build di CI. */
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
