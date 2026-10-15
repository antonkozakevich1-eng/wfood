"""
Генерация иконок PWA для WFOOD.

Иконки рисуются программно: бренд-палитра (апельсин + крем), крупный символ
прибора. Это самодостаточно — в репозитории не нужно хранить бинарники,
которые никто не сможет отредактировать.

Запуск:
    python scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PRIMARY = (255, 107, 53)
PRIMARY_DARK = (237, 78, 20)
CREAM = (255, 248, 240)
ACCENT = (46, 196, 182)

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"


def find_font(size: int, cyrillic: bool = False) -> ImageFont.FreeTypeFont:
    """
    Ищет системный шрифт.

    Для русских подписей нужен шрифт с кириллицей: Arial и Segoe UI её имеют,
    а вот декоративные/emoji-шрифты — нет, и текст превратится в «квадратики».
    """
    if cyrillic:
        candidates = [
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/tahoma.ttf",
            "C:/Windows/Fonts/verdana.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
    else:
        candidates = [
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]

    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def font_supports_cyrillic(font: ImageFont.FreeTypeFont) -> bool:
    """Проверяет, есть ли в шрифте кириллические глифы."""
    try:
        # Кириллическая «А» — если шрифт её не знает, вернётся .notdef.
        mask = font.getmask("А")
        return mask.getbbox() is not None
    except Exception:
        return False


def draw_utensils(draw: ImageDraw.ImageDraw, size: int, safe_ratio: float = 1.0) -> None:
    """
    Рисует вилку и ложку векторно.

    Векторный рисунок, а не эмодзи: эмодзи рендерится по-разному на каждой
    системе, а иконка бренда должна выглядеть одинаково везде.
    """
    center = size / 2
    # safe_ratio < 1 нужен для maskable-иконок: система обрезает края,
    # и содержимое должно помещаться в «безопасную зону» ~80%.
    scale = (size / 512) * safe_ratio
    stroke = max(2, int(26 * scale))

    top = center - 120 * scale
    bottom = center + 130 * scale
    spread = 62 * scale

    # --- Вилка (слева) ---
    fork_x = center - spread
    draw.line(
        [(fork_x, top + 40 * scale), (fork_x, bottom)],
        fill=CREAM,
        width=stroke,
    )
    # Зубцы
    for offset in (-22, 0, 22):
        draw.line(
            [
                (fork_x + offset * scale, top),
                (fork_x + offset * scale, top + 62 * scale),
            ],
            fill=CREAM,
            width=max(2, int(stroke * 0.62)),
        )
    # Соединение зубцов с ручкой
    draw.line(
        [(fork_x - 22 * scale, top + 62 * scale), (fork_x + 22 * scale, top + 62 * scale)],
        fill=CREAM,
        width=max(2, int(stroke * 0.62)),
    )

    # --- Ложка (справа) ---
    spoon_x = center + spread
    draw.line(
        [(spoon_x, top + 92 * scale), (spoon_x, bottom)],
        fill=CREAM,
        width=stroke,
    )
    # Овальная чаша ложки
    bowl_w = 42 * scale
    bowl_h = 56 * scale
    draw.ellipse(
        [
            spoon_x - bowl_w,
            top - bowl_h * 0.15,
            spoon_x + bowl_w,
            top + bowl_h * 1.6,
        ],
        fill=CREAM,
    )


def make_icon(size: int, maskable: bool = False) -> Image.Image:
    """Создаёт иконку заданного размера."""
    # Рисуем в 4x и уменьшаем — так края получаются гладкими без сглаживания вручную.
    supersample = 4
    s = size * supersample

    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # Maskable: фон заливает весь квадрат (система сама обрежет форму).
        draw.rectangle([0, 0, s, s], fill=PRIMARY)
        # Небольшой градиентный акцент в углу.
        draw.ellipse([s * 0.55, -s * 0.25, s * 1.3, s * 0.5], fill=PRIMARY_DARK)
        draw_utensils(draw, s, safe_ratio=0.62)
    else:
        # Обычная иконка: скруглённый квадрат с градиентом.
        radius = int(s * 0.22)
        draw.rounded_rectangle([0, 0, s, s], radius=radius, fill=PRIMARY)

        # Мягкий блик в правом верхнем углу.
        draw.ellipse(
            [s * 0.5, -s * 0.28, s * 1.25, s * 0.52],
            fill=PRIMARY_DARK,
        )
        # Маска, чтобы блик не выходил за скругление.
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s, s], radius=radius, fill=255)
        img.putalpha(mask)

        draw_utensils(draw, s, safe_ratio=0.86)

    return img.resize((size, size), Image.LANCZOS)


def make_og_image() -> Image.Image:
    """OG-картинка 1200x630 для превью ссылки в соцсетях."""
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), CREAM)
    draw = ImageDraw.Draw(img)

    # Декор уводим в правый край и вниз — под текстом он не должен быть.
    draw.ellipse([w * 0.70, -h * 0.40, w * 1.30, h * 0.55], fill=(247, 197, 159))
    # Тонкая полоса снизу вместо большого треугольника:
    # треугольник перекрывал подписи.
    draw.polygon([(0, h), (w * 0.42, h), (0, h * 0.72)], fill=PRIMARY)

    logo = make_icon(150)
    img.paste(logo, (80, 70), logo)

    title_font = find_font(96, cyrillic=True)
    subtitle_font = find_font(34, cyrillic=True)
    tagline_font = find_font(30, cyrillic=True)

    draw.text((80, 250), "WFOOD", font=title_font, fill=(26, 22, 20))
    draw.text(
        (80, 372),
        "Где поесть? Ответ за 10 секунд.",
        font=subtitle_font,
        fill=(90, 80, 74),
    )
    draw.text(
        (80, 428),
        "Рулетка · Карта · ИИ-помощник",
        font=tagline_font,
        fill=PRIMARY,
    )

    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    root = OUT_DIR.parent

    targets = [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (180, "apple-touch-icon.png", False),
        (512, "icon-maskable-512.png", True),
        (32, "favicon-32.png", False),
    ]

    for size, name, maskable in targets:
        icon = make_icon(size, maskable=maskable)
        icon.save(OUT_DIR / name, "PNG", optimize=True)
        print(f"  {name}: {size}x{size}" + (" (maskable)" if maskable else ""))

    og = make_og_image()
    og.save(root / "og-default.png", "PNG", optimize=True)
    print("  og-default.png: 1200x630")

    # SVG-фавикон: весит копейки и масштабируется без потерь.
    favicon_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#FF6B35"/>
  <ellipse cx="400" cy="60" rx="180" ry="140" fill="#ED4E14"/>
  <g stroke="#FFF8F0" stroke-linecap="round" fill="none">
    <path d="M194 162v100" stroke-width="26"/>
    <path d="M172 122v62" stroke-width="16"/>
    <path d="M194 122v62" stroke-width="16"/>
    <path d="M216 122v62" stroke-width="16"/>
    <path d="M172 184h44" stroke-width="16"/>
    <path d="M194 262v160" stroke-width="26"/>
    <path d="M318 214v208" stroke-width="26"/>
    <ellipse cx="318" cy="150" rx="42" ry="56" fill="#FFF8F0" stroke="none"/>
  </g>
</svg>
"""
    (root / "favicon.svg").write_text(favicon_svg, encoding="utf-8")
    print("  favicon.svg: векторный")

    print(f"\nГотово. Файлы в {OUT_DIR}")


if __name__ == "__main__":
    main()
