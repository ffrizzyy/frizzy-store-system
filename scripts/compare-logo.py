"""Membuat gambar perbandingan: referensi, model, dan peta selisih bertumpuk.

    python scripts/compare-logo.py <berkas-gambar>
"""

import sys
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else "logo.jpg"
ref = Image.open(path).convert("RGB")
model = Image.open("scripts/.logo-model.png").convert("RGB")
W, H = ref.size

X0, Y0, X1, Y1 = 240, 470, 860, 790
crop = (X0, Y0, X1, Y1)
ref_c = ref.crop(crop)
mod_c = model.crop(crop)

# peta selisih: putih = cocok terang, merah = hanya referensi, hijau = hanya model
diff = Image.new("RGB", ref_c.size, (0, 0, 0))
rp, mp, dp = ref_c.load(), mod_c.load(), diff.load()
for y in range(ref_c.size[1]):
    for x in range(ref_c.size[0]):
        a = rp[x, y]
        b = mp[x, y]
        a_on = max(a) > 90
        b_on = max(b) > 90
        if a_on and b_on:
            dp[x, y] = (90, 90, 90)
        elif a_on:
            dp[x, y] = (255, 60, 60)
        elif b_on:
            dp[x, y] = (60, 255, 60)

gap = 16
out = Image.new("RGB", (ref_c.size[0], ref_c.size[1] * 3 + gap * 2), (20, 20, 20))
out.paste(ref_c, (0, 0))
out.paste(mod_c, (0, ref_c.size[1] + gap))
out.paste(diff, (0, ref_c.size[1] * 2 + gap * 2))
out.save("scripts/.logo-compare.png")
print("disimpan: scripts/.logo-compare.png (atas referensi, tengah model, bawah selisih)")
