"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CloudCheck,
  MagnifyingGlass,
  Moon,
  Sun,
  UserSwitch,
  WarningCircle,
  List,
  X,
  Command,
  Plus,
} from "@phosphor-icons/react/dist/ssr";
import { NAV, SHOP, Z } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useFrizzy, useUi } from "@/lib/store";
import { DivaCellLogo } from "@/components/brand/Logo";
import { Badge, StatusDot } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Toaster } from "@/components/app/Toaster";
import { PinGate } from "@/components/app/PinGate";
import { NotificationBell } from "@/components/app/NotificationBell";
import { AddStockDialog } from "@/components/app/AddStockDialog";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = window.localStorage.getItem("frizzy-theme");
    const initial: "light" | "dark" =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    document.documentElement.style.colorScheme = initial;
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("frizzy-theme", next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  };
  return { theme, toggle };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const role = useFrizzy((s) => s.role);
  const setRole = useFrizzy((s) => s.setRole);
  const data = useFrizzy((s) => s.data);
  const ctx = useFrizzy((s) => s.ctx);
  const status = useFrizzy((s) => s.status);
  const [scrolled, setScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const stockOpen = useUi((s) => s.addStockOpen);
  const openAddStock = useUi((s) => s.openAddStock);
  const closeAddStock = useUi((s) => s.closeAddStock);
  const ready = status === "ready";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const items = NAV.filter((n) => !(n.role === "owner" && role !== "owner"));
  const groups = ["operasional", "uang", "analitik", "sistem"] as const;

  const activeHint = items.find((i) => pathname?.startsWith(i.href))?.label ?? "Dashboard";
  const openShift = data?.shifts[data.shifts.length - 1] ?? null;
  const variance = openShift?.variance ?? 0;
  const critical = ctx ? ctx.kpis.runwayState === "critical" : false;

  return (
    <div className="min-h-[100dvh] bg-bg">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[10px] focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
        style={{ zIndex: Z.toast }}
      >
        Lewati ke konten
      </a>

      {/* Sidebar desktop */}
      <aside className="fixed left-0 top-0 hidden h-[100dvh] w-[248px] flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/" aria-label={`${SHOP.name} - beranda`}>
            <DivaCellLogo />
          </Link>
        </div>
        <nav className="scroll-y flex-1 px-3 py-4" aria-label="Navigasi aplikasi">
          {groups.map((g) => {
            const groupItems = items.filter((i) => i.group === g);
            if (groupItems.length === 0) return null;
            return (
              <div key={g} className="mb-5">
                <div className="label-caps px-2 pb-2">{groupLabel(g)}</div>
                <ul className="space-y-0.5">
                  {groupItems.map((item) => {
                    const active = pathname === item.href || (item.href !== "/app" && pathname?.startsWith(item.href));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                            active
                              ? "bg-accent-soft text-accent"
                              : "text-text-muted hover:bg-surface-2 hover:text-text"
                          )}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon name={item.icon} size={20} weight={active ? "bold" : "regular"} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="rounded-[10px] bg-surface-2 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-text">
              <StatusDot tone={critical ? "danger" : "ok"} />
              {critical ? "Kas kritis" : "Sinkron"}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-text-faint">
              {ctx
                ? `Runway ${Number.isFinite(ctx.kpis.runwayDays) ? Math.round(ctx.kpis.runwayDays) : "∞"} hari - True Burn ${Math.round(
                    ctx.kpis.trueBurnPerDay / 1000
                  )} rb/hari`
                : "Memuat data kas..."}
            </p>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <div className="lg:pl-[248px]">
        <header
          className={cn(
            "sticky top-0 border-b bg-bg/85 backdrop-blur-md transition-colors",
            scrolled ? "border-border" : "border-transparent"
          )}
          style={{ zIndex: Z.sticky }}
        >
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu"
            >
              <List size={20} />
            </Button>
            <div className="lg:hidden">
              <DivaCellLogo size={26} showSystem={false} />
            </div>
            <div className="hidden items-center gap-2 text-[13px] text-text-muted md:flex">
              <span className="text-text-faint">Frizzy</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-text">{activeHint}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden h-9 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-[13px] text-text-faint transition-colors hover:bg-surface-2 md:flex"
              >
                <MagnifyingGlass size={16} />
                Cari apa saja
                <span className="num ml-6 flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px]">
                  <Command size={10} />K
                </span>
              </button>
              <Button
                variant="secondary"
                size="md"
                className="hidden md:inline-flex"
                onClick={openAddStock}
                icon={<Plus size={16} weight="bold" />}
                data-testid="open-add-stock"
              >
                Tambah stok
              </Button>
              <button
                type="button"
                data-testid="role-toggle"
                onClick={() => setRole(role === "owner" ? "staff" : "owner")}
                className="flex h-9 items-center gap-2 rounded-full border border-border-strong bg-surface px-3 text-[12px] font-medium text-text transition-colors hover:bg-surface-2"
                title="Ganti peran untuk melihat batas akses"
              >
                <UserSwitch size={16} />
                {role === "owner" ? "Pemilik" : "Staf"}
              </button>
              <Button
                variant="ghost"
                size="icon"
                data-testid="theme-toggle"
                onClick={toggle}
                aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
              {ready ? <NotificationBell /> : null}
            </div>
          </div>
          {critical ? (
            <div className="flex items-center gap-2 border-t border-danger/25 bg-danger-soft px-4 py-2 text-[12.5px] text-danger md:px-6">
              <WarningCircle size={16} weight="fill" />
              Kas di bawah ambang aman. Runway{" "}
              {ctx ? Math.round(ctx.kpis.runwayDays) : 0} hari pada True Burn saat ini.
              <Link href="/app/recovery" className="ml-auto font-semibold underline underline-offset-2">
                Buka Cash Recovery
              </Link>
            </div>
          ) : null}
        </header>

        <main id="konten" className="px-4 pb-24 pt-5 md:px-6 md:pb-10">
          {children}
        </main>
      </div>

      {/* Tab bar bawah untuk ponsel */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
        style={{ zIndex: Z.sticky }}
        aria-label="Navigasi bawah"
      >
        <ul className="grid grid-cols-5">
          {[
            { href: "/app", label: "Dashboard", icon: "Gauge" },
            { href: "/app/pos", label: "POS", icon: "Storefront" },
            { href: "/app/inventory", label: "Stok", icon: "Package" },
            { href: "/app/finance", label: "Uang", icon: "Wallet", ownerOnly: true },
            { href: "/app/recovery", label: "Pulih", icon: "FirstAid", ownerOnly: true },
          ].map((tab) => {
            const active = pathname === tab.href;
            const disabled = tab.ownerOnly && role !== "owner";
            return (
              <li key={tab.href}>
                <Link
                  href={disabled ? "/app" : tab.href}
                  aria-disabled={disabled}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium",
                    active ? "text-accent" : "text-text-muted"
                  )}
                >
                  <Icon name={tab.icon} size={22} weight={active ? "bold" : "regular"} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Drawer navigasi ponsel */}
      {mobileOpen ? (
        <div className="fixed inset-0 bg-[rgb(9_9_11_/_0.5)] lg:hidden" style={{ zIndex: Z.modal }}>
          <div className="flex h-full w-[86%] max-w-[320px] flex-col border-r border-border bg-surface">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <DivaCellLogo size={26} />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">
                <X size={18} />
              </Button>
            </div>
            <nav className="scroll-y flex-1 px-3 py-4">
              {groups.map((g) => {
                const groupItems = items.filter((i) => i.group === g);
                if (groupItems.length === 0) return null;
                return (
                  <div key={g} className="mb-4">
                    <div className="label-caps px-2 pb-1.5">{groupLabel(g)}</div>
                    <ul>
                      {groupItems.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-[14px] font-medium text-text-muted"
                          >
                            <Icon name={item.icon} size={20} />
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
            <div className="border-t border-border p-3">
              <Badge tone={variance === 0 ? "ok" : "warn"}>
                {variance === 0 ? "Kas shift cocok" : `Selisih kas ${variance}`}
              </Badge>
            </div>
          </div>
        </div>
      ) : null}

      {paletteOpen ? (
        <div
          className="fixed inset-0 flex items-start justify-center bg-[rgb(9_9_11_/_0.5)] pt-[12vh] backdrop-blur-[2px]"
          style={{ zIndex: Z.modal }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
        >
          <div className="w-[min(560px,92vw)] overflow-hidden rounded-[20px] border border-border bg-surface shadow-overlay">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <MagnifyingGlass size={18} className="text-text-faint" />
              <span className="text-[13px] text-text-faint">Lompat ke halaman atau aksi</span>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto p-2">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setPaletteOpen(false)}
                    className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-surface-2"
                  >
                    <Icon name={item.icon} size={20} />
                    <span className="text-[13.5px] font-medium text-text">{item.label}</span>
                    <span className="ml-auto truncate text-[12px] text-text-faint">{item.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[11.5px] text-text-faint">
              <CloudCheck size={15} /> Data contoh deterministik, aman untuk dibagikan
            </div>
          </div>
        </div>
      ) : null}

      <Toaster />
      <PinGate />
      {ready && stockOpen ? <AddStockDialog open onClose={closeAddStock} /> : null}
    </div>
  );
}

function groupLabel(g: "operasional" | "uang" | "analitik" | "sistem"): string {
  switch (g) {
    case "operasional":
      return "Operasional";
    case "uang":
      return "Uang";
    case "analitik":
      return "Analitik";
    default:
      return "Sistem";
  }
}
