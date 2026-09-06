"""Рисует знак RayLauncher и все производные файлы: .ico, .png и картинки инсталлятора."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'buildAssets'
SS = 8

TOP = (247, 200, 107)
RIGHT = (224, 149, 42)
LEFT = (162, 94, 16)
SHAFT = (255, 226, 168)
SPARK_TOP = (255, 232, 190)
SPARK_RIGHT = (245, 190, 110)
SPARK_LEFT = (206, 138, 44)

FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def cube_faces(cx: float, cy: float, half_w: float, half_h: float, depth: float):
    top = (cx, cy - half_h)
    right_up = (cx + half_w, cy - half_h + depth)
    right_down = (cx + half_w, cy + depth)
    bottom = (cx, cy + half_h)
    left_down = (cx - half_w, cy + depth)
    left_up = (cx - half_w, cy - half_h + depth)
    centre = (cx, cy - half_h + 2 * depth)
    return (
        [top, right_up, centre, left_up],
        [right_up, right_down, bottom, centre],
        [left_up, centre, bottom, left_down]
    )


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def render_mark(canvas: int, detail: bool) -> Image.Image:
    image = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    box = canvas

    half_w = box * 0.32
    depth = box * 0.17
    half_h = box * 0.4
    cx = box * 0.42
    cy = box * 0.58

    top, right, left = cube_faces(cx, cy, half_w, half_h, depth)
    draw.polygon(left, fill=LEFT)
    draw.polygon(right, fill=RIGHT)
    draw.polygon(top, fill=TOP)

    if detail:
        apex, right_up, centre, left_up = top
        shaft = [
            lerp(left_up, apex, 0.18),
            lerp(left_up, apex, 0.46),
            lerp(centre, right_up, 0.46),
            lerp(centre, right_up, 0.18)
        ]
        draw.polygon(shaft, fill=SHAFT)

    spark_w = box * 0.14
    spark_depth = box * 0.075
    spark_h = box * 0.17
    sx = box * 0.8
    sy = box * 0.2
    s_top, s_right, s_left = cube_faces(sx, sy, spark_w, spark_h, spark_depth)
    draw.polygon(s_left, fill=SPARK_LEFT)
    draw.polygon(s_right, fill=SPARK_RIGHT)
    draw.polygon(s_top, fill=SPARK_TOP)

    return image


def draw_mark(size: int, padding_ratio: float = 0.06) -> Image.Image:
    canvas = size * SS
    drawn = render_mark(canvas, detail=size >= 40)
    cropped = drawn.crop(drawn.getbbox())

    box = round(canvas * (1 - 2 * padding_ratio))
    scale = min(box / cropped.width, box / cropped.height)
    fitted = cropped.resize((max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))), Image.LANCZOS)

    sheet = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    sheet.paste(fitted, ((canvas - fitted.width) // 2, (canvas - fitted.height) // 2), fitted)
    return sheet.resize((size, size), Image.LANCZOS)


def write_icons() -> None:
    ASSETS.mkdir(exist_ok=True)
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [draw_mark(size, 0.1 if size <= 24 else 0.06) for size in sizes]
    frames[-1].save(ASSETS / 'icon.ico', format='ICO', sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    draw_mark(512).save(ASSETS / 'icon.png')


def tile(width: int, height: int) -> Image.Image:
    image = Image.new('RGB', (width, height), (22, 19, 15))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        shade = int(10 * (1 - y / height))
        draw.line([(0, y), (width, y)], fill=(22 + shade, 19 + shade, 15 + shade))
    return image


def write_installer_art() -> None:
    sidebar = tile(164, 314)
    mark = draw_mark(96)
    sidebar.paste(mark, (34, 74), mark)

    draw = ImageDraw.Draw(sidebar)
    draw.text((34, 186), 'Ray', font=ImageFont.truetype(FONT_BOLD, 26), fill=(247, 242, 233))
    draw.text((34, 214), 'Launcher', font=ImageFont.truetype(FONT_REGULAR, 20), fill=(240, 166, 58))
    draw.text((34, 248), 'Minecraft\nJava Edition', font=ImageFont.truetype(FONT_REGULAR, 11), fill=(150, 142, 130))
    sidebar.save(ASSETS / 'installerSidebar.bmp')

    header = tile(150, 57)
    small = draw_mark(40)
    header.paste(small, (10, 8), small)
    ImageDraw.Draw(header).text(
        (58, 20), 'RayLauncher', font=ImageFont.truetype(FONT_BOLD, 13), fill=(247, 242, 233)
    )
    header.save(ASSETS / 'installerHeader.bmp')


if __name__ == '__main__':
    write_icons()
    write_installer_art()
    print('готово:', ', '.join(sorted(p.name for p in ASSETS.iterdir())))
