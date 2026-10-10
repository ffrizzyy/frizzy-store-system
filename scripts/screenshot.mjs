/* Tangkapan layar untuk pemeriksaan visual. */
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const PORT = process.argv[3] ?? "9222";
const shots = (process.argv[4] ?? "/,/app").split(",");
const outDir = process.argv[5] ?? "..";

let ws, id = 0;
const pending = new Map();
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page") ?? list[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  });
}
function send(method, params = {}) {
  const i = ++id;
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => pending.has(i) && (pending.delete(i), reject(new Error(method + " timeout"))), 60_000);
  });
}

await connect();
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 2,
  mobile: false,
});

for (const path of shots) {
  await send("Page.navigate", { url: BASE + path });
  await sleep(4200);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const name = `${outDir}/shot-${path.replace(/[^a-z0-9]+/gi, "_") || "root"}.png`;
  await writeFile(name, Buffer.from(data, "base64"));
  console.log("disimpan:", name);
}

ws.close();
process.exit(0);
