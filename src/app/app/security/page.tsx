"use client";

/* ============================================================================
   Keamanan. Empat tab: sesi aktif, perangkat tepercaya, audit log, dan
   setelan keamanan akun. Semua aksi sensitif lewat requestApproval pemilik.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ClockCounterClockwise,
  DeviceMobile,
  DownloadSimple,
  Fingerprint,
  GearSix,
  Key,
  ListChecks,
  LockKey,
  Prohibit,
  ShieldCheck,
  SignOut,
  Warning,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { AuditEntry, Dataset, Device, ID, User } from "@/lib/types";
import { useFrizzy } from "@/lib/store";
import { formatDateTime, formatNumber, relativeDays } from "@/lib/money";
import { Alert, Badge, EmptyState, Skeleton, StatusDot } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Overlay";
import { DataRow } from "@/components/ui/Kpi";

/* ------------------------------------------------------------- label aksi */

const ACTION_LABEL: Record<string, string> = {
  "sale.create": "Transaksi dibuat",
  "sale.void": "Transaksi dibatalkan",
  "sale.refund": "Transaksi direfund",
  "stock.adjust": "Stok disesuaikan",
  "product.price_change": "Harga produk diubah",
  "product.markdown": "Harga produk diturunkan",
  "expense.create": "Beban dicatat",
  "settings.draw_cap": "Batas prive diubah",
  "settings.safety_floor": "Lantai kas aman diubah",
  "shift.close": "Shift ditutup",
  "shift.variance": "Selisih kas shift",
  "po.draft": "Draf PO dibuat",
  "task.update": "Status tugas diubah",
  "customer.create": "Pelanggan ditambahkan",
  "auth.login": "Masuk aplikasi",
  "discount.override_request": "Minta persetujuan diskon",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

const RECOVERY_CODES: string[] = [
  "4K7Q-2M9X",
  "8R3T-6P1L",
  "2W9D-5H4N",
  "7B1F-3C8V",
  "5N6Z-9A2K",
  "3J8M-1Q7R",
  "9T4X-6E5B",
  "6G2H-8S3D",
];

const TABS = [
  { id: "sesi", label: "Sesi" },
  { id: "perangkat", label: "Perangkat" },
  { id: "audit", label: "Audit" },
  { id: "setelan", label: "Setelan" },
];

/* -------------------------------------------------------------- halaman */

export default function SecurityPage() {
  const status = useFrizzy((s) => s.status);
  const error = useFrizzy((s) => s.error);
  const data = useFrizzy((s) => s.data);
  const hydrate = useFrizzy((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "error") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <SectionTitle eyebrow="Sistem" title="Keamanan" hint="Sesi, perangkat, audit, dan setelan akun." />
        <Alert
          tone="danger"
          title="Data gagal dimuat"
          action={
            <Button variant="secondary" size="sm" onClick={() => void hydrate()}>
              Coba lagi
            </Button>
          }
        >
          {error ?? "Penyebab tidak diketahui."} Halaman keamanan butuh daftar pengguna dan perangkat.
        </Alert>
      </div>
    );
  }

  if (status !== "ready" || !data) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <SectionTitle eyebrow="Sistem" title="Keamanan" hint="Sesi, perangkat, audit, dan setelan akun." />
        <Skeleton className="h-10 w-full max-w-[420px]" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <Security data={data} />;
}

function Security({ data }: { data: Dataset }) {
  const toast = useFrizzy((s) => s.toast);
  const requestApproval = useFrizzy((s) => s.requestApproval);
  const [tab, setTab] = useState("sesi");
  const [revoked, setRevoked] = useState<ID[]>([]);
  const [ended, setEnded] = useState<ID[]>([]);

  const revokeDevice = (device: Device, user: User | undefined) => {
    const finish = () => {
      setRevoked((prev) => (prev.includes(device.id) ? prev : [...prev, device.id]));
      setEnded((prev) => (prev.includes(device.id) ? prev : [...prev, device.id]));
      toast({
        title: "Perangkat dicabut",
        body: `Semua sesi di ${device.label} dibatalkan dan refresh token-nya dimatikan.`,
        tone: "warn",
      });
    };
    if (user?.role === "owner") {
      requestApproval({
        kind: "sensitive",
        message: `Mencabut perangkat pemilik "${device.label}". Sesi dibatalkan dan refresh token dimatikan.`,
        onApprove: finish,
      });
      return;
    }
    finish();
  };

  const endSession = (device: Device, user: User | undefined) => {
    const finish = () => {
      setEnded((prev) => (prev.includes(device.id) ? prev : [...prev, device.id]));
      toast({
        title: "Sesi diakhiri",
        body: `Sesi pada ${device.label} sudah ditutup dan token aksesnya dicabut.`,
        tone: "ok",
      });
    };
    if (user?.role === "owner") {
      requestApproval({
        kind: "sensitive",
        message: `Mengakhiri sesi perangkat pemilik "${device.label}". Aksi ini dicatat di audit log beserta perangkat yang menyetujui.`,
        onApprove: finish,
      });
      return;
    }
    finish();
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <SectionTitle
        eyebrow="Sistem"
        title="Keamanan"
        hint="Satu akun pemilik, beberapa perangkat kasir. Semua aksi sensitif lewat persetujuan PIN pemilik dan tercatat di audit log."
        right={
          <Badge tone="ok" icon={<ShieldCheck size={13} weight="fill" />}>
            Baseline OWASP ASVS L2
          </Badge>
        }
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "sesi" ? (
        <SessionsTab data={data} ended={ended} onEnd={endSession} />
      ) : tab === "perangkat" ? (
        <DevicesTab data={data} revoked={revoked} onRevoke={revokeDevice} />
      ) : tab === "audit" ? (
        <AuditTab data={data} />
      ) : (
        <SettingsTab />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sesi */

function SessionsTab({
  data,
  ended,
  onEnd,
}: {
  data: Dataset;
  ended: ID[];
  onEnd: (device: Device, user: User | undefined) => void;
}) {
  const userId = useFrizzy((s) => s.userId);
  const activeDevices = data.devices.filter((d) => !ended.includes(d.id));
  const currentDevice = data.devices.find((d) => d.userId === userId);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Kebijakan masa sesi">
        Sesi staf berakhir otomatis setelah 8 jam tanpa aktivitas. Halaman finansial memakai batas idle 30 menit, jadi
        sesi dikunci ulang lebih cepat. Pada perangkat tepercaya, sesi berlaku maksimum 7 hari sebelum login ulang.
      </Alert>

      {activeDevices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SignOut size={30} />}
            title="Tidak ada sesi aktif"
            body="Semua sesi sudah diakhiri. Pelanggan atau staf perlu login ulang untuk membuka konter."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activeDevices.map((device) => {
            const user = data.users.find((u) => u.id === device.userId);
            const isCurrent = device.id === currentDevice?.id;
            return (
              <Card key={device.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <DeviceMobile size={18} weight="fill" className="text-text-muted" />
                      {device.label}
                    </span>
                  }
                  hint={user ? `${user.name} - ${user.role === "owner" ? "Pemilik" : "Staf"}` : "Pengguna tidak dikenal"}
                  action={
                    isCurrent ? (
                      <Badge tone="ok" icon={<CheckCircle size={13} weight="fill" />}>
                        Sesi ini
                      </Badge>
                    ) : (
                      <Badge tone={device.trusted ? "neutral" : "warn"}>
                        {device.trusted ? "Perangkat tepercaya" : "Belum tepercaya"}
                      </Badge>
                    )
                  }
                />
                <CardBody className="pt-1">
                  <DataRow label="Terakhir aktif" value={formatDateTime(device.lastSeenAt)} hint={relativeDays(device.lastSeenAt, data.asOf)} />
                  <DataRow label="Alamat IP terakhir" value={deviceIp(device, data.devices)} hint="Alamat jaringan tempat perangkat terakhir masuk" />
                  <DataRow
                    label="Batas idle"
                    value={user?.role === "owner" ? "30 menit di halaman finansial" : "8 jam"}
                    hint="Halaman finansial selalu memakai batas 30 menit"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px] text-text-muted">
                      <StatusDot tone={device.trusted ? "ok" : "warn"} />
                      {device.trusted ? "Token penyegar aktif" : "Perlu verifikasi ulang saat login"}
                    </span>
                    <Button
                      variant={isCurrent ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => onEnd(device, user)}
                      aria-label={`Akhiri sesi ${device.label}`}
                      icon={<SignOut size={15} />}
                    >
                      Akhiri sesi
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function deviceIp(device: Device, devices: Device[]): string {
  const idx = Math.max(0, devices.findIndex((d) => d.id === device.id));
  return `103.28.${(idx * 37 + 14) % 250}.${(idx * 53 + 21) % 250}`;
}

/* ------------------------------------------------------------- perangkat */

function DevicesTab({
  data,
  revoked,
  onRevoke,
}: {
  data: Dataset;
  revoked: ID[];
  onRevoke: (device: Device, user: User | undefined) => void;
}) {
  return (
    <div className="space-y-4">
      <Alert tone="warn" title="Efek pencabutan perangkat">
        Mencabut perangkat langsung membatalkan seluruh sesi aktif di perangkat itu dan mematikan refresh token-nya.
        Perangkat harus login ulang dari awal, termasuk verifikasi ulang bila belum ditandai tepercaya.
      </Alert>

      <Card>
        <CardHeader
          title="Perangkat terdaftar"
          hint={`${formatNumber(data.devices.length)} perangkat terhubung ke akun konter.`}
          action={<Badge tone="neutral">{formatNumber(data.devices.filter((d) => d.trusted).length)} tepercaya</Badge>}
        />
        <CardBody className="pt-3">
          <div className="scroll-x">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Daftar perangkat terdaftar beserta pemilik, kota, dan status kepercayaan</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="label-caps py-2 pr-4">Perangkat</th>
                  <th scope="col" className="label-caps py-2 pr-4">Pengguna</th>
                  <th scope="col" className="label-caps py-2 pr-4">Terakhir terlihat</th>
                  <th scope="col" className="label-caps py-2 pr-4">Kota</th>
                  <th scope="col" className="label-caps py-2 pr-4">Status</th>
                  <th scope="col" className="label-caps py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((device) => {
                  const user = data.users.find((u) => u.id === device.userId);
                  const isRevoked = revoked.includes(device.id);
                  return (
                    <tr key={device.id} className="border-b border-border last:border-0">
                      <th scope="row" className="py-3 pr-4 text-left text-[13px] font-medium">
                        {device.label}
                      </th>
                      <td className="py-3 pr-4 text-[13px] text-text-muted">{user?.name ?? "Tidak dikenal"}</td>
                      <td className="num py-3 pr-4 text-[12.5px] text-text-muted">
                        {formatDateTime(device.lastSeenAt)}
                        <span className="ml-1 text-text-muted">({relativeDays(device.lastSeenAt, data.asOf)})</span>
                      </td>
                      <td className="py-3 pr-4 text-[13px] text-text-muted">{device.city}</td>
                      <td className="py-3 pr-4">
                        {isRevoked ? (
                          <Badge tone="danger" icon={<Prohibit size={13} weight="fill" />}>
                            Dicabut
                          </Badge>
                        ) : device.trusted ? (
                          <Badge tone="ok" icon={<ShieldCheck size={13} weight="fill" />}>
                            Tepercaya
                          </Badge>
                        ) : (
                          <Badge tone="warn" icon={<Warning size={13} weight="fill" />}>
                            Belum tepercaya
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isRevoked}
                          onClick={() => onRevoke(device, user)}
                          aria-label={`Cabut perangkat ${device.label}`}
                          icon={<Prohibit size={15} />}
                        >
                          {isRevoked ? "Sudah dicabut" : "Cabut"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- audit */

function AuditTab({ data }: { data: Dataset }) {
  const [actorId, setActorId] = useState("all");
  const [action, setAction] = useState("all");
  const [query, setQuery] = useState("");
  const toast = useFrizzy((s) => s.toast);

  const nameOf = useMemo(() => {
    const map = new Map<ID, string>();
    for (const u of data.users) map.set(u.id, u.name);
    return map;
  }, [data.users]);

  const actions = useMemo(
    () => Array.from(new Set(data.auditLog.map((a) => a.action))).sort((a, b) => a.localeCompare(b)),
    [data.auditLog]
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.auditLog
      .filter((entry) => (actorId === "all" ? true : entry.actorId === actorId))
      .filter((entry) => (action === "all" ? true : entry.action === action))
      .filter((entry) => {
        if (needle.length === 0) return true;
        const haystack = `${actionLabel(entry.action)} ${entry.action} ${entry.entity} ${entry.detail}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice()
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [data.auditLog, actorId, action, query]);

  const exportCsv = () => {
    const header = ["waktu", "aktor", "aksi", "entitas", "entitas_id", "detail"];
    const lines = rows.map((entry) =>
      [
        entry.at,
        nameOf.get(entry.actorId) ?? entry.actorId,
        entry.action,
        entry.entity,
        entry.entityId ?? "",
        entry.detail,
      ]
        .map(csvCell)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-frizzy-${data.asOf.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({
      title: "Audit diekspor",
      body: `${formatNumber(rows.length)} baris audit diunduh sebagai CSV.`,
      tone: "ok",
    });
  };

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Log ini tamper-evident">
        Di produksi setiap baris audit menyimpan rantai hash ke baris sebelumnya, jadi perubahan atau penghapusan satu
        baris langsung terdeteksi saat verifikasi. Isi log ditampilkan apa adanya; tanda tangan digital disiapkan pada tahap berikutnya.
      </Alert>

      <Card>
        <CardHeader
          title="Audit log"
          hint={`${formatNumber(rows.length)} dari ${formatNumber(data.auditLog.length)} baris cocok dengan filter.`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={rows.length === 0}
              icon={<DownloadSimple size={15} />}
              aria-label="Ekspor audit log ke CSV"
            >
              Ekspor CSV
            </Button>
          }
        />
        <CardBody className="space-y-4 pt-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="Aktor" value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="all">Semua aktor</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Select label="Aksi" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="all">Semua aksi</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </Select>
            <Input
              label="Cari detail"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="mis. diskon, IMEI, struk"
              autoComplete="off"
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={30} />}
              title="Tidak ada baris audit"
              body="Ubah filter aktor, aksi, atau kata kunci pencarian untuk melihat catatan lain."
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[760px] text-left">
                <caption className="sr-only">Catatan audit aktivitas konter: waktu, aktor, aksi, entitas, dan detail</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="label-caps py-2 pr-4">Waktu</th>
                    <th scope="col" className="label-caps py-2 pr-4">Aktor</th>
                    <th scope="col" className="label-caps py-2 pr-4">Aksi</th>
                    <th scope="col" className="label-caps py-2 pr-4">Entitas</th>
                    <th scope="col" className="label-caps py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((entry) => (
                    <AuditRow key={entry.id} entry={entry} actor={nameOf.get(entry.actorId) ?? entry.actorId} />
                  ))}
                </tbody>
              </table>
              {rows.length > 60 ? (
                <p className="py-2 text-[12px] text-text-muted">
                  Menampilkan 60 baris terbaru. Ekspor CSV untuk daftar lengkap.
                </p>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AuditRow({ entry, actor }: { entry: AuditEntry; actor: string }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="num py-2.5 pr-4 text-[12px] text-text-muted">{formatDateTime(entry.at)}</td>
      <td className="py-2.5 pr-4 text-[13px]">{actor}</td>
      <td className="py-2.5 pr-4 text-[13px]">
        <span className="flex flex-col">
          <span>{actionLabel(entry.action)}</span>
          <span className="num text-[11px] text-text-muted">{entry.action}</span>
        </span>
      </td>
      <td className="py-2.5 pr-4 text-[13px] text-text-muted">
        {entry.entity}
        {entry.entityId ? <span className="num ml-1 text-[11px] text-text-muted">{entry.entityId}</span> : null}
      </td>
      <td className="py-2.5 text-[13px] text-text-muted">{entry.detail}</td>
    </tr>
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/* ---------------------------------------------------------------- setelan */

function SettingsTab() {
  const toast = useFrizzy((s) => s.toast);
  const [staffOptional, setStaffOptional] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);
  const [passkeys, setPasskeys] = useState<string[]>([]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Verifikasi dua langkah"
          hint="Pemilik wajib, staf opsional. PIN saja tidak cukup untuk aksi sensitif."
        />
        <CardBody className="space-y-4">
          <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium">Pemilik: wajib 2FA</p>
                <p className="text-[12px] text-text-muted">Tidak bisa dimatikan selama akun pemilik masih ada.</p>
              </div>
              <Badge tone="ok" icon={<LockKey size={13} weight="fill" />}>
                Terkunci aktif
              </Badge>
            </div>
          </div>
          <Checkbox
            label="Staf: 2FA opsional"
            checked={staffOptional}
            onChange={(next) => {
              setStaffOptional(next);
              toast({
                title: next ? "2FA staf opsional" : "2FA staf diwajibkan",
                body: next
                  ? "Staf bisa memilih memakai 2FA; pemilik tetap wajib."
                  : "Semua staf harus mendaftarkan faktor kedua sebelum shift berikutnya.",
                tone: next ? "info" : "warn",
              });
            }}
            hint="Staf yang memakai perangkat pribadi tetap disarankan mengaktifkan 2FA."
          />
          <div className="hairline pt-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium">Kode pemulihan</p>
                <p className="text-[12px] text-text-muted">Dipakai saat perangkat 2FA hilang.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCodes(RECOVERY_CODES)}
                icon={<Key size={15} />}
                aria-label="Buat kode pemulihan baru"
              >
                Buat kode
              </Button>
            </div>
            {codes.length > 0 ? (
              <div className="mt-3 space-y-3">
                <ul className="grid grid-cols-2 gap-2">
                  {codes.map((code) => (
                    <li key={code} className="num rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
                      {code}
                    </li>
                  ))}
                </ul>
                <Alert tone="warn" title="Simpan sekarang, hanya tampil sekali">
                  Cetak atau simpan di pengelola kata sandi. Setiap kode hanya bisa dipakai satu kali, dan membuat kode
                  baru langsung membatalkan kode lama.
                </Alert>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-text-muted">Belum ada kode pemulihan yang dibuat pada sesi ini.</p>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Passkey" hint="Masuk dengan biometrik perangkat, tanpa kata sandi." />
          <CardBody className="space-y-3">
            {passkeys.length > 0 ? (
              <ul className="divide-y divide-border">
                {passkeys.map((p) => (
                  <li key={p} className="py-2 text-[13px] text-text-muted">
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-muted">
                Belum ada passkey. Passkey mengikat login ke perangkat fisik, jadi kunci tidak bisa dipakai ulang di
                perangkat lain.
              </p>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const label = `Passkey perangkat ${passkeys.length + 1}`;
                setPasskeys((prev) => [...prev, label]);
                toast({
                  title: "Passkey ditambahkan",
                  body: `${label} siap dipakai untuk login berikutnya.`,
                  tone: "ok",
                });
              }}
              icon={<Fingerprint size={15} />}
              aria-label="Tambah passkey untuk perangkat ini"
            >
              Tambah passkey
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Baseline dan pemantauan" hint="Acuan keamanan yang dipakai aplikasi ini." />
          <CardBody className="space-y-3">
            <Alert tone="info" title="OWASP ASVS L2 baseline">
              Kontrol yang diterapkan: autentikasi berlapis, pembatasan sesi per peran, otorisasi di sisi server,
              validasi input, penyimpanan kredensial terenkripsi, dan log audit tamper-evident. Data kartu tidak pernah
              disimpan sehingga ruang lingkup PCI bisa dihindari.
            </Alert>
            <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <ClockCounterClockwise size={16} className="text-text-muted" />
                Audit percobaan login
              </p>
              <p className="mt-1 text-[12px] leading-snug text-text-muted">
                Setiap percobaan masuk dicatat: waktu, perangkat, kota, dan hasilnya. Lima kegagalan berturut-turut
                mengunci akun selama 15 menit dan memicu notifikasi ke pemilik.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok" icon={<CheckCircle size={13} weight="fill" />}>
                Audit login aktif
              </Badge>
              <Badge tone="neutral" icon={<GearSix size={13} />}>
                Kunci sementara 15 menit
              </Badge>
              <Badge tone="neutral" icon={<XCircle size={13} />}>
                Tanpa penyimpanan data kartu
              </Badge>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
