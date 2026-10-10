"""Mengukur poligon logo secara presisi: tepi atas/bawah tiap elemen.

Untuk setiap kolom terpilih, cetak transisi warna; untuk poligon berarah
45 derajat, cetak juga garis tepi (leading edge) tiap bentuk.

    python scripts/measure-logo.py <berkas-gambar>
"""

import sys
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else "logo.jpg"
img = Image.open(path).convert("RGB")
w, h = img.size
px = img.load()


def cls(x: int, y: int) -> str:
    r, g, b = px[x, y]
    if r < 60 and g < 60 and b < 60:
        return "."
    if r > 200 and g > 200 and b > 200:
        return "W"
    if r > 150 and g < 140 and b < 110:
        return "O"
    return "?"


# 1. profil kolom: dari atas ke bawah, di kolom terpilih
print("profil kolom (x : transisi dari atas ke bawah):")
for x in range(264, 841, 24):
    runs = []
    cur = None
    start = 0
    for y in range(460, 800):
        c = cls(x, y)
        if c != cur:
            if cur is not None and cur in "WO":
                runs.append(f"{cur}{start}-{y-1}")
            cur = c
            start = y
    if cur in "WO":
        runs.append(f"{cur}{start}-{799}")
    print(f"  x={x:4d}: {' '.join(runs) if runs else '-'}")

# 2. garis tepi tiap bentuk: untuk tiap baris, ambil awal tiap run
print("\ngaris tepi (leading edge) per bentuk:")
for y in range(496, 768, 8):
    runs = []
    cur = None
    start = 0
    for x in range(240, 860):
        c = cls(x, y)
        keep = c if c in "WO" else None
        if keep != cur:
            if cur is not None:
                runs.append((cur, start, x - 1))
            cur = keep
            start = x
    if cur is not None:
        runs.append((cur, start, 859))
    desc = " ".join(f"{c}:{a}-{b}" for c, a, b in runs)
    print(f"  y={y:4d}: {desc}")
