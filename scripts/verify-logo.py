"""Memverifikasi path hasil pelacakan terhadap gambar referensi (IoU)."""

import sys
from PIL import Image, ImageDraw

path = sys.argv[1] if len(sys.argv) > 1 else "logo.jpg"
ref = Image.open(path).convert("RGB")
W, H = ref.size

X0, Y0, X1, Y1 = 264, 495, 835, 767
BW, BH = X1 - X0 + 1, Y1 - Y0 + 1

WHITE_PATHS = [
    "M19.23 0 L38.11 39.56 L47.38 39.56 L51.75 30.4 L42.48 30.04 L28.15 0 Z",
    "M57.34 0 L43.01 30.04 L51.92 30.04 L66.26 0 Z",
    "M71.5 0 L67.13 9.16 L76.22 9.52 L90.56 39.56 L99.65 39.56 L80.59 0 Z",
    "M0 2.93 L0 19.05 L14.51 49.45 L0 80.59 L0 96.7 L1.22 96.7 L18.71 60.07 L18.88 39.93 L1.22 2.93 Z",
    "M66.96 9.52 L52.62 39.56 L61.54 39.56 L75.87 9.52 Z",
]
ORANGE_PATHS = ["M5.07 0 L23.95 39.56 L32.87 39.56 L13.99 0 Z"]


def parse(d: str) -> list[tuple[float, float]]:
    nums = d.replace("M", " ").replace("L", " ").replace("Z", " ").split()
    pts = [(float(nums[i]), float(nums[i + 1])) for i in range(0, len(nums), 2)]
    return [(X0 + x / 100 * (BW - 1), Y0 + y / 100 * (BH - 1)) for x, y in pts]


model = Image.new("RGB", (W, H), (0, 0, 0))
dr = ImageDraw.Draw(model)
for d in WHITE_PATHS:
    dr.polygon(parse(d), fill=(255, 255, 255))
for d in ORANGE_PATHS:
    dr.polygon(parse(d), fill=(226, 104, 58))


def cls(p):
    r, g, b = p
    if r > 200 and g > 200 and b > 200:
        return "W"
    if r > 150 and g < 140 and b < 110:
        return "O"
    if r < 70 and g < 70 and b < 70:
        return "."
    return "?"


rp, mp = ref.load(), model.load()
stats = {"W": [0, 0, 0], "O": [0, 0, 0]}
for y in range(Y0, Y1 + 1):
    for x in range(X0, X1 + 1):
        a, b = cls(rp[x, y]), cls(mp[x, y])
        for k in ("W", "O"):
            if a == k and b == k:
                stats[k][0] += 1
            elif a == k:
                stats[k][1] += 1
            elif b == k:
                stats[k][2] += 1

print("IoU model vs referensi:")
for k, (both, only_ref, only_mod) in stats.items():
    union = both + only_ref + only_mod
    print(f"  {k}: cocok {both}, kurang {only_ref}, lebih {only_mod}, IoU {both / union:.4f}")

model.crop((X0 - 20, Y0 - 20, X1 + 20, Y1 + 20)).save("scripts/.logo-model.png")
print("model: scripts/.logo-model.png")
