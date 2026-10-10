// Audit statis: pastikan setiap tautan internal menuju route yang benar-benar ada.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = "src";
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(p);
  }
})(root);

const hrefs = new Set();
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/href=["'`]([^"'`]+)["'`]/g)) hrefs.add(m[1]);
  for (const m of s.matchAll(/href:\s*"([^"]+)"/g)) hrefs.add(m[1]);
}

const routes = new Set();
for (const f of files) {
  const m = f.match(/src[\\/]app[\\/](.*)page\.tsx$/);
  if (!m) continue;
  const rel = m[1].replace(/\\/g, "/").replace(/page\.tsx$/, "").replace(/\/$/, "");
  routes.add("/" + rel);
}
if (routes.has("/")) routes.add("/");

const internal = [...hrefs].filter((h) => h.startsWith("/") && !h.startsWith("//"));
const norm = (h) => (h.split("?")[0] || "/").replace(/\/$/, "") || "/";

console.log("ROUTES (" + routes.size + "):");
console.log([...routes].sort().join("\n"));

console.log("\nTAUTAN INTERNAL YANG TIDAK COCOK:");
let bad = 0;
for (const h of internal.sort()) {
  const n = norm(h);
  const ok = [...routes].some((r) => r === n || (r !== "/" && n.startsWith(r + "/")) || n === "/");
  if (!ok) {
    console.log("  " + h);
    bad += 1;
  }
}
console.log(bad === 0 ? "  (tidak ada)" : `  ${bad} tautan perlu diperiksa`);

const queryTabs = new Set();
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\?tab=([a-z0-9-]+)/g)) queryTabs.add(m[1]);
  for (const m of s.matchAll(/setTab\(["']([a-z0-9-]+)["']\)/g)) queryTabs.add(m[1]);
}
console.log("\nNILAI tab YANG DIPAKAI DI TAUTAN/STATE:");
console.log([...queryTabs].sort().join(", "));
