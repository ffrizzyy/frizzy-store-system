"""Membuat ikon aplikasi Frizzy dari mark Diva Cell (chevron + bilah + aksen).

Jalankan sekali saja:
    python scripts/make-icon.py
Menghasilkan src/app/icon.png dan src/app/apple-icon.png.
"""

from PIL import Image, ImageDraw

SIZE = 512
INK = (17, 18, 20, 255)
ACCENT = (226, 104, 58, 255)
PAPER = (250, 250, 250, 255)


def draw_mark(size: int, background: tuple[int, int, int, int] | None) -> Image.Image:
    scale = 4
    img = Image.new("RGBA", (size * scale, size * scale), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def p(x: float, y: float) -> tuple[float, float]:
        return (x / 100 * size * scale, y / 100 * size * scale)

    # bentuk mark dipetakan dari viewBox 0..100
    d.polygon([p(20, 14), p(52, 14), p(20, 50)], fill=INK)
    d.polygon([p(20, 50), p(52, 14), p(98, 14), p(66, 50)], fill=ACCENT)
    d.polygon([p(36, 50), p(68, 14), p(98, 14), p(66, 50)], fill=INK)
    d.polygon([p(20, 50), p(98, 50), p(98, 65), p(20, 65)], fill=INK)
    d.polygon([p(20, 65), p(49, 95), p(20, 95)], fill=INK)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    # Ikon aplikasi: mark di tengah dengan margin aman 14%.
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    inner = int(SIZE * 0.72)
    icon.alpha_composite(draw_mark(inner, None), ((SIZE - inner) // 2, (SIZE - inner) // 2))
    icon.save("src/app/icon.png")

    # Ikon Apple: latar penuh supaya tidak transparan di iOS.
    apple = Image.new("RGBA", (SIZE, SIZE), PAPER)
    apple.alpha_composite(draw_mark(inner, None), ((SIZE - inner) // 2, (SIZE - inner) // 2))
    apple.save("src/app/apple-icon.png")

    print("ditulis: src/app/icon.png dan src/app/apple-icon.png")


if __name__ == "__main__":
    main()
