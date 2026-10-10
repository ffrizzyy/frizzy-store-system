import type { Metadata } from "next";
import { SHOP } from "@/lib/constants";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: `${SHOP.system} - ${SHOP.name}`,
    template: `%s | ${SHOP.system}`,
  },
  description:
    "Frizzy menyatukan penjualan, stok, dan kas konter Diva Cell dalam satu tempat, lengkap dengan Cash Recovery Engine yang menghitung True Burn dan runway setiap hari.",
  applicationName: SHOP.system,
  keywords: ["konter hp", "POS", "inventory", "cash flow", "Diva Cell", "Frizzy"],
  authors: [{ name: SHOP.name }],
  openGraph: {
    title: `${SHOP.system} - sistem operasi konter ${SHOP.name}`,
    description: "Kas, stok, dan penjualan dalam satu tempat. Tahu posisi kas sebelum kehabisan.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('frizzy-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='dark'||s==='light'?s:(d?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
