"use client";

import { useEffect, useState } from "react";
import {
  DeviceMobile,
  UserPlus,
  ShieldCheck,
  SignOut,
  WarningCircle,
  EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useFrizzy, useData } from "@/lib/store";
import { formatDateTime, relativeDays } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Alert, Badge, Skeleton } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Field";
import { Overlay, Tabs } from "@/components/ui/Overlay";
import { Kpi } from "@/components/ui/Kpi";

type TabId = "anggota" | "perangkat" | "undang";

export default function TeamPage() {
  const status = useFrizzy((s) => s.status);
  const hydrate = useFrizzy((s) => s.hydrate);
  const reset = useFrizzy((s) => s.reset);
  const error = useFrizzy((s) => s.error);
  const role = useFrizzy((s) => s.role);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const [tab, setTab] = useState<TabId>("anggota");
  const [inviteOpen, setInviteOpen] = useState(false);

  if (status === "idle" || status === "loading") {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4" aria-busy="true">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-[380px] rounded-2xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[720px] py-8">
        <Alert tone="danger" title="Data tim gagal dimuat">
          {error ?? "Kesalahan tidak terduga."}
        </Alert>
        <div className="mt-4">
          <Button
            variant="primary"
            onClick={() => {
              reset();
              void hydrate();
            }}
          >
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  return <TeamWorkspace tab={tab} setTab={setTab} inviteOpen={inviteOpen} setInviteOpen={setInviteOpen} role={role} />;
}

function TeamWorkspace({
  tab,
  setTab,
  inviteOpen,
  setInviteOpen,
  role,
}: {
  tab: TabId;
  setTab: (t: TabId) => void;
  inviteOpen: boolean;
  setInviteOpen: (v: boolean) => void;
  role: "owner" | "staff";
}) {
  const data = useData();
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const toast = useFrizzy((s) => s.toast);
  const setRole = useFrizzy((s) => s.setRole);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "owner">("staff");

  const staff = data.users.filter((u) => u.role === "staff");
  const trusted = data.devices.filter((d) => d.trusted);
  const ownerOnly = role !== "owner";

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <SectionTitle
        eyebrow="Akses"
        title="Tim dan perangkat"
        hint="Siapa yang boleh masuk, dari perangkat mana, dan apa batas wewenangnya."
        right={
          <Button
            variant="primary"
            icon={<UserPlus size={16} />}
            onClick={() => {
              if (ownerOnly) {
                requestApproval({
                  kind: "sensitive",
                  message: "Mengundang pengguna baru hanya bisa dilakukan pemilik.",
                  onApprove: () => setInviteOpen(true),
                });
                return;
              }
              setInviteOpen(true);
            }}
          >
            Undang pengguna
          </Button>
        }
      />

      {ownerOnly ? (
        <Alert tone="warn" title="Anda sedang melihat sebagai staf">
          Perubahan peran dan perangkat butuh persetujuan pemilik. Tombolnya tetap bisa diklik untuk melihat alur PIN.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pengguna aktif" value={data.users.length} format="number" sub={`${staff.length} staf, 1 pemilik`} />
        <Kpi label="Perangkat terdaftar" value={data.devices.length} format="number" sub={`${trusted.length} tepercaya`} />
        <Kpi
          label="Perangkat belum tepercaya"
          value={data.devices.length - trusted.length}
          format="number"
          tone={data.devices.length - trusted.length > 0 ? "warn" : "ok"}
          sub="Butuh verifikasi ulang saat masuk"
        />
        <Kpi
          label="Sesi aktif"
          value={data.devices.length}
          format="number"
          sub="Kebijakan: 8 jam idle staf, 7 hari maksimum"
        />
      </div>

      <Tabs
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "anggota", label: "Anggota", badge: data.users.length },
          { id: "perangkat", label: "Perangkat", badge: data.devices.length },
          { id: "undang", label: "Undangan" },
        ]}
      />

      {tab === "anggota" ? (
        <Card className="overflow-hidden">
          <CardHeader title="Daftar anggota" hint="Nonaktifkan, jangan hapus, agar riwayat transaksi tetap utuh" />
          <div className="scroll-x">
            <table className="w-full min-w-[760px] text-[13px]">
              <caption className="sr-only">Daftar pengguna sistem</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-faint">
                  <th className="px-5 py-3 font-medium">Nama</th>
                  <th className="px-3 py-3 font-medium">Peran</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">PIN</th>
                  <th className="px-3 py-3 font-medium">Perangkat</th>
                  <th className="px-5 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const devices = data.devices.filter((d) => d.userId === u.id);
                  const salesCount = data.sales.filter((s) => s.userId === u.id && s.status !== "void").length;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <span className="block font-medium text-text">{u.name}</span>
                        <span className="num block text-[11.5px] text-text-faint">{salesCount} transaksi</span>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={u.role === "owner" ? "info" : "neutral"}>
                          {u.role === "owner" ? "Pemilik" : "Staf"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-text-muted">{u.email}</td>
                      <td className="num px-3 py-3 text-text-faint">{"•".repeat(u.pin.length)}</td>
                      <td className="num px-3 py-3 text-text-muted">{devices.length}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {u.role === "staff" ? (
                            <Button variant="ghost" size="sm" onClick={() => setRole("staff")}>
                              Lihat sebagai staf
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              requestApproval({
                                kind: "sensitive",
                                message: `Menonaktifkan ${u.name} mencabut semua sesinya seketika.`,
                                onApprove: () =>
                                  toast({
                                    title: "Permintaan dicatat",
                                    body: `${u.name} akan dinonaktifkan (bukan dihapus) di produksi.`,
                                    tone: "ok",
                                  }),
                              });
                            }}
                          >
                            Nonaktifkan
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CardBody className="border-t border-border">
            <p className="text-[12.5px] leading-relaxed text-text-muted">
              Peran menentukan akses: staf tidak pernah melihat harga pokok, laba, atau halaman keuangan. Pembatasan dilakukan
              di server, dan setiap aksi sensitif butuh PIN pemilik yang tercatat di audit log.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {tab === "perangkat" ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Perangkat terdaftar"
            hint="Cabut akses perangkat yang hilang atau dipakai bergantian tanpa izin"
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<SignOut size={15} />}
                onClick={() =>
                  requestApproval({
                    kind: "sensitive",
                    message: "Keluar paksa dari semua sesi akan memutus semua perangkat.",
                    onApprove: () => toast({ title: "Semua sesi dicabut", body: "Perangkat harus masuk ulang.", tone: "ok" }),
                  })
                }
              >
                Keluar paksa semua
              </Button>
            }
          />
          <div className="divide-y divide-border">
            {data.devices.map((d) => {
              const user = data.users.find((u) => u.id === d.userId);
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-surface-2 text-text-muted">
                    <DeviceMobile size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-text">{d.label}</p>
                    <p className="num text-[11.5px] text-text-faint">
                      {user?.name ?? "tanpa pengguna"} - {d.city} - terakhir aktif {relativeDays(d.lastSeenAt, data.asOf)}
                    </p>
                  </div>
                  <Badge tone={d.trusted ? "ok" : "warn"} icon={d.trusted ? <ShieldCheck size={12} /> : <WarningCircle size={12} />}>
                    {d.trusted ? "Tepercaya" : "Belum tepercaya"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      requestApproval({
                        kind: "sensitive",
                        message: `Cabut akses ${d.label}? Sesi aktif dan token penyegar akan dimatikan.`,
                        onApprove: () =>
                          toast({ title: "Perangkat dicabut", body: `${d.label} harus masuk ulang dengan 2FA.`, tone: "ok" }),
                      })
                    }
                  >
                    Cabut akses
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {tab === "undang" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Undangan aktif" hint="Sekali pakai, kedaluwarsa 24 jam" />
            <ul className="divide-y divide-border">
              {[
                { email: "kasir.baru@divacell.id", role: "Staf", sent: "2 hari lalu", status: "Menunggu" },
                { email: "pengganti.libur@divacell.id", role: "Staf", sent: "5 hari lalu", status: "Kedaluwarsa" },
              ].map((inv) => (
                <li key={inv.email} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text">{inv.email}</p>
                    <p className="num text-[11.5px] text-text-faint">
                      {inv.role} - dikirim {inv.sent}
                    </p>
                  </div>
                  <Badge tone={inv.status === "Menunggu" ? "info" : "neutral"}>{inv.status}</Badge>
                </li>
              ))}
            </ul>
            <CardBody className="border-t border-border">
              <p className="text-[12.5px] leading-relaxed text-text-muted">
                Undangan berisi tautan sekali pakai. Setelah pengguna masuk dan mengatur kata sandi serta 2FA, tautan langsung
                mati.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Kebijakan akses" hint="Ringkasan yang berlaku di seluruh sistem" />
            <CardBody>
              <ul className="space-y-2.5">
                {[
                  "Tolak secara bawaan: setiap endpoint memeriksa peran, bukan hanya menyembunyikan tombol.",
                  "Pemilik wajib 2FA, staf opsional namun dianjurkan.",
                  "Perangkat tepercaya bisa dilihat dan dicabut kapan saja.",
                  "PIN pemilik dibatasi percobaannya dan setiap percobaan dicatat.",
                  "Data pelanggan diproses dengan consent, sesuai UU PDP.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-text-muted">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Overlay
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Undang pengguna"
        description="Tautan sekali pakai, kedaluwarsa dalam 24 jam."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Batal
            </Button>
            <Button
              variant="primary"
              disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)}
              onClick={() => {
                toast({
                  title: "Undangan dikirim",
                  body: `${inviteEmail} akan menerima tautan untuk membuat kata sandi.`,
                  tone: "ok",
                });
                setInviteEmail("");
                setInviteOpen(false);
              }}
            >
              Kirim undangan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="nama@divacell.id"
            hint="Email kerja lebih baik daripada email pribadi."
            error={inviteEmail.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail) ? "Format email belum benar." : null}
          />
          <Select label="Peran" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "staff" | "owner")}>
            <option value="staff">Staf (tanpa akses harga pokok)</option>
            <option value="owner">Pemilik (akses penuh)</option>
          </Select>
          {inviteRole === "owner" ? (
            <Alert tone="warn" title="Peran pemilik hampir tidak dibatasi">
              Berikan hanya bila orang tersebut memang boleh melihat laba, kas, dan prive.
            </Alert>
          ) : null}
          <p className={cn("flex items-center gap-1.5 text-[12px] text-text-faint")}>
            <EnvelopeSimple size={14} /> Undangan bisa dicabut sebelum dipakai.
          </p>
        </div>
      </Overlay>

      <p className="num text-[11.5px] text-text-faint">
        Sesi terakhir diperbarui {formatDateTime(data.asOf)} WIB
      </p>
    </div>
  );
}
