/**
 * Membuat ikon aplikasi Frizzy dari mark Diva Cell.
 *
 *   node scripts/make-icon.mjs
 *
 * Menghasilkan:
 *   src/app/icon.png        - 512x512, latar transparan, mark gelap di tengah
 *   src/app/apple-icon.png  - 512x512, latar terang (#FAFAFA), mark gelap di tengah
 *
 * Murni Node.js: tidak butuh Python/PIL. Rasterisasi polygon (scanline,
 * even-odd) di-supersample 4x lalu di-downsample agar tepinya halus, dan PNG
 * dirakit manual (IHDR/IDAT/IEND + CRC32) memakai zlib bawaan Node.
 *
 * Path diambil LANGSUNG dari src/components/brand/Logo.tsx supaya ikon dan
 * mark di UI tidak pernah menyimpang.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const LOGO_TSX = fileURLToPath(new URL("../src/components/brand/Logo.tsx", import.meta.url));

const SIZE = 512;
const SCALE = 4; // supersample 4x lalu downsample -> antialias
const MARK_RATIO = 572 / 273; // rasio asli mark (lebar : tinggi)
const MARK_BOX = 0.72; // mark mengisi 72% lebar kanvas (margin aman 14% tiap sisi)

const INK = [0x11, 0x12, 0x14]; // #111214 - dipakai untuk WHITE_PATHS
const ACCENT = [0xe2, 0x68, 0x3a]; // #E2683A - dipakai untuk ORANGE_PATHS
const PAPER = [0xfa, 0xfa, 0xfa]; // #FAFAFA - latar apple-icon

/** Ambil array path dari Logo.tsx supaya sumbernya tunggal. */
function extractPaths(source, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const block = source.match(re);
  if (!block) throw new Error(`Tidak menemukan ${name} di ${LOGO_TSX}`);
  const paths = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`${name} kosong di ${LOGO_TSX}`);
  return paths;
}

/** Ubah path "M/L/Z" menjadi daftar polygon (array titik [x, y]). */
function polygonsFromPath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const polys = [];
  let cmd = null;
  let cur = null;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t.toUpperCase();
      i += 1;
      if (cmd === "Z") continue;
    }
    if (cmd === "M" || cmd === "L") {
      const x = Number.parseFloat(tokens[i++]);
      const y = Number.parseFloat(tokens[i++]);
      if (cmd === "M") {
        cur = [];
        polys.push(cur);
        cmd = "L"; // pasangan berikutnya adalah lineto
      }
      cur.push([x, y]);
    } else {
      i += 1; // perintah tak dikenal, lewati
    }
  }
  return polys.filter((p) => p.length >= 3);
}

/** Isi satu polygon ke buffer premultiplied RGBA memakai aturan even-odd. */
function fillPolygon(buf, W, H, pts, color) {
  const n = pts.length;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rowStart = Math.max(0, Math.floor(minY));
  const rowEnd = Math.min(H - 1, Math.ceil(maxY));

  for (let py = rowStart; py <= rowEnd; py += 1) {
    const sy = py + 0.5; // sampel di tengah baris
    const xs = [];
    for (let i = 0; i < n; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % n];
      if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) {
        xs.push(x1 + ((sy - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = xs[k];
      const xb = xs[k + 1];
      // piksel px terisi bila pusatnya (px + 0.5) berada di [xa, xb)
      const c0 = Math.max(0, Math.ceil(xa - 0.5));
      const c1 = Math.min(W - 1, Math.ceil(xb - 0.5) - 1);
      for (let px = c0; px <= c1; px += 1) {
        const o = (py * W + px) * 4;
        buf[o] = color[0];
        buf[o + 1] = color[1];
        buf[o + 2] = color[2];
        buf[o + 3] = 255;
      }
    }
  }
}

/** Rasterisasi mark ke kanvas persegi; kembalikan Buffer RGBA (straight alpha). */
function renderMark(whitePaths, orangePaths, { background }) {
  const D = SIZE * SCALE;
  const buf = new Uint8Array(D * D * 4); // premultiplied RGBA

  if (background) {
    for (let i = 0; i < D * D; i += 1) {
      const o = i * 4;
      buf[o] = background[0];
      buf[o + 1] = background[1];
      buf[o + 2] = background[2];
      buf[o + 3] = 255;
    }
  }

  // Kotak mark: lebar 72% kanvas, tinggi mengikuti rasio asli 2.095:1,
  // lalu diletakkan di tengah secara vertikal (dan horizontal).
  const boxW = SIZE * MARK_BOX * SCALE;
  const boxH = boxW / MARK_RATIO;
  const offX = (D - boxW) / 2;
  const offY = (D - boxH) / 2;
  const toDevice = ([vx, vy]) => [offX + (vx / 100) * boxW, offY + (vy / 100) * boxH];

  // Urutan gambar sama seperti di Logo.tsx: putih dulu, pita oranye di atasnya.
  const layers = [
    ...whitePaths.map((d) => ({ d, color: INK })),
    ...orangePaths.map((d) => ({ d, color: ACCENT })),
  ];
  for (const { d, color } of layers) {
    for (const poly of polygonsFromPath(d)) {
      fillPolygon(buf, D, D, poly.map(toDevice), color);
    }
  }

  // Downsample SCALE x SCALE -> antialias; buffer premultiplied lalu di-unpremultiply.
  const out = Buffer.alloc(SIZE * SIZE * 4);
  const area = SCALE * SCALE;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          const o = ((y * SCALE + dy) * D + (x * SCALE + dx)) * 4;
          r += buf[o];
          g += buf[o + 1];
          b += buf[o + 2];
          a += buf[o + 3];
        }
      }
      r /= area;
      g /= area;
      b /= area;
      a /= area;
      const o = (y * SIZE + x) * 4;
      if (a > 0) {
        const k = 255 / a;
        out[o] = Math.min(255, Math.round(r * k));
        out[o + 1] = Math.min(255, Math.round(g * k));
        out[o + 2] = Math.min(255, Math.round(b * k));
      }
      out[o + 3] = Math.round(a);
    }
  }
  return out;
}

/* --- PNG encoder --- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --- main --- */

const source = await readFile(LOGO_TSX, "utf8");
const whitePaths = extractPaths(source, "WHITE_PATHS");
const orangePaths = extractPaths(source, "ORANGE_PATHS");

const icon = renderMark(whitePaths, orangePaths, { background: null });
const appleIcon = renderMark(whitePaths, orangePaths, { background: PAPER });

await writeFile(fileURLToPath(new URL("../src/app/icon.png", import.meta.url)), encodePng(icon, SIZE, SIZE));
await writeFile(fileURLToPath(new URL("../src/app/apple-icon.png", import.meta.url)), encodePng(appleIcon, SIZE, SIZE));

console.log(`ditulis: src/app/icon.png dan src/app/apple-icon.png (${SIZE}x${SIZE})`);
