"""Melacak mark logo sebagai pita (band) berurutan, lalu menyusun path SVG.

Tiap pita adalah rangkaian baris dengan satu rentang horizontal; tepi kiri dan
tepi kanan disederhanakan dengan Douglas-Peucker. Cara ini mengikuti bentuk asli
persis, termasuk lipatan 45 derajat.

    python scripts/trace-logo.py <berkas-gambar>
"""

import sys
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else "logo.jpg"
img = Image.open(path).convert("RGB")
W, H = img.size
px = img.load()

X0, Y0, X1, Y1 = 264, 495, 835, 767
BW, BH = X1 - X0 + 1, Y1 - Y0 + 1


def kind(x: int, y: int) -> str:
    r, g, b = px[x, y]
    if r > 200 and g > 200 and b > 200:
        return "W"
    if r > 150 and g < 140 and b < 110:
        return "O"
    return "."


def runs_of_row(y: int, target: str) -> list[tuple[int, int]]:
    out = []
    cur = None
    start = 0
    for x in range(BW):
        hit = kind(X0 + x, Y0 + y) == target
        if hit and cur is None:
            cur = x
        elif not hit and cur is not None:
            out.append((cur, x - 1))
            cur = None
    if cur is not None:
        out.append((cur, BW - 1))
    return [r for r in out if r[1] - r[0] >= 2]


def simplify_1d(points: list[tuple[int, int]], eps: float) -> list[tuple[int, int]]:
    if len(points) < 3:
        return points

    def rec(seq: list[tuple[int, int]]) -> list[tuple[int, int]]:
        (ay, ax), (by, bx) = seq[0], seq[-1]
        dy, dx = by - ay, bx - ax
        norm = (dx * dx + dy * dy) ** 0.5 or 1
        worst, idx = 0.0, 0
        for i in range(1, len(seq) - 1):
            y, x = seq[i]
            dist = abs(dx * (y - ay) - dy * (x - ax)) / norm
            if dist > worst:
                worst, idx = dist, i
        if worst <= eps:
            return [seq[0], seq[-1]]
        return rec(seq[: idx + 1])[:-1] + rec(seq[idx:])

    return rec(points)


def bands(target: str) -> list[list[tuple[int, int, int]]]:
    """Kelompokkan baris menjadi pita: (y, kiri, kanan) yang bersambung."""
    out: list[list[tuple[int, int, int]]] = []
    open_bands: list[list[tuple[int, int, int]]] = []
    for y in range(BH):
        rs = runs_of_row(y, target)
        used = [False] * len(rs)
        still_open = []
        for band in open_bands:
            py, pk, pn = band[-1]
            if y - py > 2:
                out.append(band)
                continue
            # cari rentang yang tumpang tindih cukup dengan baris sebelumnya
            best = -1
            best_ov = 0
            for i, (a, b) in enumerate(rs):
                if used[i]:
                    continue
                ov = min(pn, b) - max(pk, a)
                if ov > best_ov:
                    best_ov, best = ov, i
            if best >= 0 and best_ov > 6:
                a, b = rs[best]
                used[best] = True
                band.append((y, a, b))
                still_open.append(band)
            else:
                out.append(band)
        for i, (a, b) in enumerate(rs):
            if not used[i]:
                still_open.append([(y, a, b)])
        open_bands = still_open
    out.extend(open_bands)
    return [b for b in out if len(b) >= 6]


def path_of(band: list[tuple[int, int, int]], eps: float) -> str:
    left = simplify_1d([(y, a) for y, a, _ in band], eps)
    right = simplify_1d([(y, b) for y, _, b in band], eps)
    pts = [(x, y) for y, x in left] + [(x, y) for y, x in reversed(right)]
    return "M" + " L".join(f"{round(x / BW * 100, 2)} {round(y / BH * 100, 2)}" for x, y in pts) + " Z"


for target, label, eps in (("W", "putih", 1.5), ("O", "oranye", 1.2)):
    bs = sorted(bands(target), key=lambda b: (b[0][0], b[0][1]))
    print(f"\n=== {label}: {len(bs)} pita ===")
    for i, band in enumerate(bs):
        ytop, ybot = band[0][0] + Y0, band[-1][0] + Y0
        print(f"pita {i + 1}: y {ytop}..{ybot}, {len(band)} baris")
        print("  " + path_of(band, eps))
