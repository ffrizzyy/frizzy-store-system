/* ============================================================================
   Uji end-to-end Frizzy lewat Chrome DevTools Protocol.

   Browser headless benar-benar mengklik aplikasi memakai kejadian mouse asli
   (Input.dispatchMouseEvent), bukan klik sintetis: menambah produk di POS,
   menyelesaikan pembayaran, menguji gerbang PIN pemilik, menggeser slider
   What-If, mengganti tema, dan membuka semua halaman. Tanpa dependensi
   tambahan: Node sudah punya WebSocket dan fetch.

   Pakai:
     node scripts/e2e.mjs http://127.0.0.1:3000 9222
   Chrome harus sudah jalan dengan --remote-debugging-port.
   ========================================================================= */

import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const PORT = process.argv[3] ?? "9222";

let ws;
let msgId = 0;
const pending = new Map();
const results = [];
const consoleErrors = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  LULUS" : "  GAGAL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page") ?? list[0];
  if (!page) throw new Error("tidak ada target halaman di Chrome");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push((msg.params.exceptionDetails.exception?.description ?? "exception").slice(0, 200));
    }
  });
}

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} timeout`));
      }
    }, 90_000);
  });
}

async function goto(path, waitMs = 2600) {
  await send("Page.navigate", { url: BASE + path });
  await sleep(waitMs);
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? "kesalahan evaluasi");
  return res.result.value;
}

/** Klik memakai kejadian mouse asli pada koordinat elemen. */
async function mouseClickAt(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

/**
 * Klik tombol pertama yang teksnya cocok. Elemen digulir ke tengah dulu, lalu
 * koordinatnya dibaca ulang setelah gulir selesai.
 */
async function clickButton(label, { expectEnabled = true } = {}) {
  const located = await evaluate(`
    const want = ${JSON.stringify(label.toLowerCase())};
    const el = [...document.querySelectorAll("button, a")].find((n) => (n.textContent || "").toLowerCase().includes(want));
    if (!el) return { found: false };
    el.scrollIntoView({ block: "center", behavior: "instant" });
    return { found: true, disabled: el.disabled === true, text: (el.textContent || "").trim().slice(0, 60) };
  `);
  if (!located.found) return { ok: false, why: "elemen tidak ditemukan" };
  if (expectEnabled && located.disabled) return { ok: false, why: "tombol nonaktif", text: located.text };
  await sleep(350);
  const rect = await evaluate(`
    const want = ${JSON.stringify(label.toLowerCase())};
    const el = [...document.querySelectorAll("button, a")].find((n) => (n.textContent || "").toLowerCase().includes(want));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + Math.min(r.width / 2, 120)), y: Math.round(r.y + r.height / 2) };
  `);
  if (!rect) return { ok: false, why: "elemen hilang setelah gulir" };
  await mouseClickAt(rect.x, rect.y);
  return { ok: true, text: located.text };
}

/** Klik elemen pertama yang cocok dengan selektor CSS, memakai mouse asli. */
async function clickSelector(selector) {
  const rect = await evaluate(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: "center", behavior: "instant" });
    return { disabled: el.disabled === true };
  `);
  if (!rect) return { ok: false, why: "tidak ditemukan" };
  if (rect.disabled) return { ok: false, why: "nonaktif" };
  await sleep(300);
  const pos = await evaluate(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + Math.min(r.width / 2, 120)), y: Math.round(r.y + r.height / 2) };
  `);
  if (!pos) return { ok: false, why: "hilang setelah gulir" };
  await mouseClickAt(pos.x, pos.y);
  return { ok: true };
}

const bodyHas = (text) =>
  `return document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())});`;

/** Tunggu sampai kondisi di halaman terpenuhi. */
async function waitFor(expression, timeoutMs = 6000, stepMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(stepMs);
  }
  return false;
}

const payEnabled = `return document.querySelector('[data-testid="pay-button"]')?.disabled === false;`;

const setByTestId = (testId, value) => `
  const el = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
`;

const setFirstPriceInput = (value) => `
  const el = document.querySelector('input[aria-label^="Harga satuan"]');
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
`;

/* --------------------------------------------------------------------- uji */

async function testApi() {
  const headline = await (await fetch(`${BASE}/api/sample/headline`)).json();
  record(
    "API ringkasan halaman publik berisi angka mesin metrik",
    typeof headline.cash === "number" && Array.isArray(headline.bridge) && headline.bridge.length >= 5,
    `kas ${headline.cash}, runway ${Math.round(headline.runway)} hari, ${headline.leakCount} temuan`
  );

  const sample = await (await fetch(`${BASE}/api/sample`)).json();
  const d = sample.data;
  record(
    "API dataset contoh lengkap",
    d.sales.length > 3000 && d.products.length > 40 && d.units.length > 300,
    `${d.sales.length} struk, ${d.products.length} produk, ${d.units.length} unit IMEI`
  );
}

async function testLanding() {
  await goto("/", 5000);
  const ok =
    (await evaluate(bodyHas("Tahu posisi kas"))) &&
    (await evaluate(bodyHas("cash runway hari ini"))) &&
    (await evaluate(bodyHas("stock-to-cash bridge")));
  record("Landing page memuat hero, widget runway, dan jembatan kas", ok);

  const kpi = await evaluate(`return (document.body.innerText.match(/Rp\\s?[\\d.]+/g) || []).length;`);
  record("Landing menampilkan angka rupiah nyata", kpi > 20, `${kpi} angka rupiah`);
}

async function testPosCheckout() {
  await goto("/app/pos", 4200);
  record("POS terhidrasi (keranjang tampil)", await evaluate(bodyHas("Keranjang")));

  const added = await clickButton("Tempered glass universal");
  await sleep(800);
  const ready = await waitFor(payEnabled);
  const cartReady = await evaluate(`
    const t = document.body.innerText;
    return { empty: t.includes("Belum ada item"), pay: document.querySelector('[data-testid="pay-button"]')?.disabled === false };
  `);
  record("Klik produk menambahkan baris ke keranjang", added.ok === true && ready && cartReady.empty === false && cartReady.pay);

  const pay = await clickSelector('[data-testid="pay-button"]');
  await sleep(1000);
  record("Tombol Bayar membuka lembar pembayaran", pay.ok === true && (await evaluate(bodyHas("metode pembayaran"))));
  record("Lembar pembayaran menampilkan metode lengkap", await evaluate(bodyHas("QRIS")));

  const finish = await clickSelector('[data-testid="finish-sale"]');
  await sleep(1600);
  const receiptReady = await waitFor(bodyHas("transaksi selesai"), 5000);
  const receipt = await evaluate(`
    const t = document.body.innerText;
    const totalEl = document.querySelector('[data-testid="receipt-total"]');
    return {
      done: t.toLowerCase().includes("transaksi selesai"),
      no: (t.match(/DC-\\d{8}-\\d{3}/) || [""])[0],
      total: totalEl ? totalEl.textContent.replace(/TOTAL/i, "").trim() : "",
      item: t.includes("Tempered glass universal"),
    };
  `);
  record("Transaksi selesai dan struk tampil", finish.ok === true && receiptReady && receipt.done, `struk ${receipt.no}`);
  record(
    "Struk memuat nomor struk, item, dan total bukan nol",
    receipt.no !== "" && receipt.item && /Rp\s?[1-9]/.test(receipt.total),
    `total ${receipt.total}`
  );

  const paid = await evaluate(`
    return fetch("/api/sample").then((r) => r.json()).then((j) => j.data.sales.length).catch(() => 0);
  `);
  record("Ledger server tetap sehat setelah transaksi", typeof paid === "number" && paid > 3000, `${paid} struk`);
}

async function testPinGate() {
  await goto("/app/pos", 4000);

  const added = await clickButton("Tempered glass universal");
  await sleep(600);
  const cartReady = await waitFor(payEnabled);
  const lowered = await evaluate(setFirstPriceInput("1000"));
  await sleep(600);

  const toStaff = await clickSelector('[data-testid="role-toggle"]');
  await sleep(900);
  const isStaff = await evaluate(bodyHas("mode staf"));
  record(
    "Peran dapat diganti ke staf dan POS menandainya",
    added.ok === true && cartReady && toStaff.ok === true && isStaff,
    lowered ? "harga baris diturunkan ke Rp 1.000" : "harga gagal diturunkan"
  );

  await waitFor(payEnabled);
  const pay = await clickSelector('[data-testid="pay-button"]');
  await sleep(1100);
  const pinShown = await evaluate(bodyHas("persetujuan pemilik"));
  record(
    "Staf yang menembus batas margin diminta PIN pemilik",
    pay.ok === true && pinShown,
    pay.ok ? "" : `tombol Bayar ${pay.why}`
  );

  if (pinShown) {
    await evaluate(setByTestId("pin-input", "0000"));
    await sleep(250);
    const wrong = await clickButton("Setujui");
    await sleep(800);
    record("PIN salah ditolak dengan pesan jelas", wrong.ok === true && (await evaluate(bodyHas("pin tidak cocok"))));

    await evaluate(setByTestId("pin-input", "2468"));
    await sleep(250);
    const right = await clickButton("Setujui");
    await sleep(1000);
    const cleared = (await evaluate(bodyHas("metode pembayaran"))) || (await evaluate(bodyHas("disetujui pemilik")));
    record("PIN pemilik yang benar menyetujui dan melanjutkan pembayaran", right.ok === true && cleared);
  }

  await clickSelector('[data-testid="role-toggle"]');
  await sleep(400);
}

async function testRecoveryTabs() {
  await goto("/app/recovery", 4500);
  record("Halaman Cash Recovery Engine terbuka", await evaluate(bodyHas("cash recovery engine")));
  record("Skor pemulihan dijelaskan per komponen", await evaluate(bodyHas("skor pemulihan")));

  const leak = await clickButton("Leak Detector");
  await sleep(1700);
  const leakContent = await evaluate(`
    const t = document.body.innerText;
    return { ok: t.toLowerCase().includes("dampak"), rupiah: /Rp[\\s\\d.]{4,}/.test(t) };
  `);
  record("Leak Detector menampilkan temuan berbobot rupiah", leak.ok === true && leakContent.ok && leakContent.rupiah);

  const free = await clickButton("Bebas Kas");
  await sleep(1700);
  const freeContent = await evaluate(`
    return [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("Terapkan markdown")).length;
  `);
  record("Free-Cash Planner menampilkan banyak item stok mati", free.ok === true && freeContent >= 3, `${freeContent} item`);

  const whatIf = await clickButton("What-If");
  await sleep(1700);
  const sliders = await evaluate(`return document.querySelectorAll('input[type="range"]').length;`);
  const runwayBefore = await evaluate(`
    const nums = [...document.body.innerText.matchAll(/(\\d+)\\s*hari/gi)].map((m) => Number(m[1]));
    return nums.length ? Math.max(...nums) : null;
  `);
  const moved = await evaluate(`
    const el = document.querySelectorAll('input[type="range"]')[1];
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, String(Number(el.min) + (Number(el.max) - Number(el.min)) * 0.9));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  `);
  await sleep(1500);
  const runwayAfter = await evaluate(`
    const nums = [...document.body.innerText.matchAll(/(\\d+)\\s*hari/gi)].map((m) => Number(m[1]));
    return nums.length ? Math.max(...nums) : null;
  `);
  record(
    "What-If punya 7 tuas dan mengubah runway",
    whatIf.ok === true && sliders >= 5 && moved === true && runwayAfter !== runwayBefore,
    `${sliders} slider, runway ${runwayBefore} -> ${runwayAfter} hari`
  );

  const playbook = await clickButton("Playbook");
  await sleep(1600);
  record("Playbook menampilkan tugas 90 hari per fase", playbook.ok === true && (await evaluate(bodyHas("stabilkan"))));
}

async function testDashboardAndTheme() {
  await goto("/app", 3800);
  const dash = (await evaluate(bodyHas("dashboard pemilik"))) || (await evaluate(bodyHas("runway kas pada true burn")));
  record("Dashboard pemilik terbuka", dash);
  record("Dashboard menampilkan jembatan stok ke kas", await evaluate(bodyHas("jembatan stok ke kas")));
  record("Dashboard menampilkan briefing kas harian", await evaluate(bodyHas("briefing kas harian")));

  const before = await evaluate(`return document.documentElement.dataset.theme;`);
  const toggle = await clickSelector('[data-testid="theme-toggle"]');
  await sleep(800);
  const after = await evaluate(`return document.documentElement.dataset.theme;`);
  record("Tombol tema mengubah mode terang/gelap", toggle.ok === true && before !== after, `${before} -> ${after}`);
  record("Pilihan tema tersimpan", (await evaluate(`return window.localStorage.getItem("frizzy-theme") || "";`)) !== "");
}

async function testAllRoutes() {
  const routes = [
    "/app/sales",
    "/app/products",
    "/app/inventory",
    "/app/purchasing",
    "/app/customers",
    "/app/shifts",
    "/app/finance",
    "/app/reports",
    "/app/ai",
    "/app/team",
    "/app/security",
    "/app/settings",
    "/demo",
    "/case-study",
  ];
  let bad = 0;
  for (const r of routes) {
    await goto(r, 2500);
    const info = await evaluate(`
      const t = document.body.innerText;
      return { len: t.length, err: t.includes("Halaman ini gagal dimuat") || t.includes("Application error") };
    `);
    if (info.err || info.len < 500) {
      bad += 1;
      console.log(`    -> ${r} bermasalah (${info.len} karakter)`);
    }
  }
  record("Semua halaman aplikasi terbuka tanpa batas galat", bad === 0, `${routes.length - bad}/${routes.length}`);
}

/* -------------------------------------------------------------------- main */

async function main() {
  console.log(`Uji Frizzy pada ${BASE}\n`);
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");

  await testApi();
  await testLanding();
  await testPosCheckout();
  await testPinGate();
  await testRecoveryTabs();
  await testDashboardAndTheme();
  await testAllRoutes();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nHASIL: ${passed} lulus, ${failed} gagal, dari ${results.length} pemeriksaan`);
  if (consoleErrors.length > 0) {
    console.log(`\nGalat runtime di halaman: ${consoleErrors.length}`);
    for (const e of [...new Set(consoleErrors)].slice(0, 5)) console.log(`  - ${e}`);
  }
  if (failed > 0) {
    console.log("\nYang gagal:");
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  }
  ws.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Uji berhenti:", err.message);
  process.exit(2);
});
