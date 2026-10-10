/* Pemeriksa data: jalankan generator + mesin metrik tanpa build.
   Node bisa menjalankan TypeScript dengan strip types, tetapi butuh ekstensi
   eksplisit pada import relatif. Skrip ini menyalin src/lib ke .check/,
   menambahkan ekstensi .ts, lalu menjalankan pemeriksaannya. */

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src", "lib");
const outDir = path.join(root, ".check");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const COPIES = ["types.ts", "money.ts", "constants.ts", "generator.ts", "metrics.ts"];
for (const f of COPIES) {
  let code = await readFile(path.join(srcDir, f), "utf8");
  code = code.replace(/from "\.\/([A-Za-z0-9_-]+)"/g, 'from "./$1.ts"');
  await writeFile(path.join(outDir, f), code);
}

const checkSrc = await readFile(path.join(root, "scripts", "check-data.mts"), "utf8");
await writeFile(path.join(outDir, "check-data.mts"), checkSrc);

const res = spawnSync(process.execPath, ["--experimental-strip-types", path.join(outDir, "check-data.mts")], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
