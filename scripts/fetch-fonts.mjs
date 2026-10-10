// One-off helper: fetch Geist + Geist Mono variable fonts (latin subset) from
// Google Fonts and write them into public/fonts so the app self-hosts them.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const outDir = path.join(process.cwd(), "public", "fonts");
await mkdir(outDir, { recursive: true });

/** Parse @font-face blocks; return { subset -> url } using the /* subset *\/ comment. */
function parseBlocks(css) {
  const out = new Map();
  const parts = css.split("@font-face");
  for (const part of parts.slice(1)) {
    const comment = part.match(/\/\*\s*([a-z0-9-\[\]]+)\s*\*\//i);
    const url = part.match(/url\((https:\/\/[^)]+)\)/);
    if (url && comment) out.set(comment[1], url[1]);
  }
  return out;
}

async function grab(label, cssUrl, outName) {
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": UA } })).text();
  const blocks = parseBlocks(css);
  console.log(label, "subsets:", [...blocks.keys()].join(", "));
  const target = blocks.get("latin") ?? blocks.get("latin-ext");
  if (!target) {
    console.log("  no latin subset found\n", css.slice(0, 600));
    return;
  }
  const bin = Buffer.from(await (await fetch(target, { headers: { "User-Agent": UA } })).arrayBuffer());
  await writeFile(path.join(outDir, outName), bin);
  console.log("  wrote", outName, bin.length, "bytes");
}

await grab("Geist", "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap", "Geist.woff2");
await grab(
  "Geist Mono",
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap",
  "GeistMono.woff2"
);
