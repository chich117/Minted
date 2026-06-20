#!/usr/bin/env python3
"""Generate PWA PNG icons without external image libraries.

Renders a simple Wingy Hills icon (sky, a setting sun, rolling hills, and a
bird) into RGBA pixel buffers and encodes them as PNG using only the standard
library. Run from the repo root:

    python3 tools/gen_icons.py
"""
import struct
import zlib
import math
import os

OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded(x, y, w, h, r, px, py):
    """True if (px, py) is inside a rounded rectangle."""
    if px < x or py < y or px >= x + w or py >= y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def blend(dst, src, a):
    return tuple(round(dst[i] * (1 - a) + src[i] * a) for i in range(3))


def render(size):
    buf = bytearray(size * size * 4)  # RGBA, transparent by default

    cx = size / 2
    radius = size * 112 / 512  # corner radius matches the SVG

    # Colors
    sky_top = (78, 192, 202)
    sky_bot = (155, 231, 236)
    hill = (86, 168, 60)
    grass = (120, 205, 87)
    sun = (255, 242, 176)

    grass_h = size * 18 / 512

    bx, by = size * 0.42, size * 250 / 512
    bird_r = size * 110 / 512

    # Rolling-hill surface: a gentle cosine bump across the icon.
    def hill_y(x):
        t = x / size
        return size * (0.70 - 0.12 * math.cos(t * math.tau))

    sun_cx, sun_cy, sun_r = size * 0.74, size * 0.29, size * 0.115

    def put(x, y, color, a=1.0):
        i = (y * size + x) * 4
        if buf[i + 3] == 0:
            base = color
        else:
            base = blend((buf[i], buf[i + 1], buf[i + 2]), color, a)
            a = 1.0
        buf[i] = base[0]
        buf[i + 1] = base[1]
        buf[i + 2] = base[2]
        buf[i + 3] = 255

    for y in range(size):
        for x in range(size):
            if not rounded(0, 0, size, size, radius, x, y):
                continue
            hy = hill_y(x)
            if y >= hy:
                color = grass if y < hy + grass_h else hill
            else:
                color = lerp(sky_top, sky_bot, y / (size * 0.84))
                # Setting sun glow.
                if math.hypot(x - sun_cx, y - sun_cy) <= sun_r:
                    color = sun
            put(x, y, color)

    # Bird body (anti-aliased edge).
    def circle(ccx, ccy, cr, color, edge=None):
        x0, x1 = int(ccx - cr - 2), int(ccx + cr + 2)
        y0, y1 = int(ccy - cr - 2), int(ccy + cr + 2)
        for y in range(max(0, y0), min(size, y1)):
            for x in range(max(0, x0), min(size, x1)):
                if buf[(y * size + x) * 4 + 3] == 0:
                    continue
                d = math.hypot(x - ccx, y - ccy)
                if d <= cr - 1:
                    put(x, y, color)
                elif d < cr:
                    put(x, y, color, cr - d)
                elif edge and d < cr + edge:
                    put(x, y, (199, 154, 0), min(1.0, cr + edge - d))

    circle(bx, by, bird_r, (245, 208, 0), edge=size * 10 / 512)
    circle(bx - bird_r * 0.13, by + bird_r * 0.28, bird_r * 0.62, (255, 240, 160))
    circle(bx + bird_r * 0.47, by - bird_r * 0.33, bird_r * 0.33, (255, 255, 255))
    circle(bx + bird_r * 0.55, by - bird_r * 0.33, bird_r * 0.16, (0, 0, 0))

    # Beak (triangle).
    p0 = (bx + bird_r * 0.80, by - bird_r * 0.07)
    p1 = (bx + bird_r * 1.47, by + bird_r * 0.13)
    p2 = (bx + bird_r * 0.80, by + bird_r * 0.40)

    # Point-in-triangle test via edge signs.
    def edge_sign(ax, ay, bx_, by_, px, py):
        return (bx_ - ax) * (py - ay) - (by_ - ay) * (px - ax)

    minx = int(min(p0[0], p1[0], p2[0]))
    maxx = int(max(p0[0], p1[0], p2[0]))
    miny = int(min(p0[1], p1[1], p2[1]))
    maxy = int(max(p0[1], p1[1], p2[1]))
    for y in range(max(0, miny), min(size, maxy + 1)):
        for x in range(max(0, minx), min(size, maxx + 1)):
            if buf[(y * size + x) * 4 + 3] == 0:
                continue
            s1 = edge_sign(p0[0], p0[1], p1[0], p1[1], x, y)
            s2 = edge_sign(p1[0], p1[1], p2[0], p2[1], x, y)
            s3 = edge_sign(p2[0], p2[1], p0[0], p0[1], x, y)
            if (s1 <= 0 and s2 <= 0 and s3 <= 0) or (s1 >= 0 and s2 >= 0 and s3 >= 0):
                put(x, y, (255, 140, 26))

    return bytes(buf)


def write_png(path, size, pixels):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        raw.extend(pixels[y * size * 4:(y + 1) * size * 4])

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, f"({size}x{size})")


for sz, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "icon-180.png")]:
    write_png(os.path.join(OUT_DIR, name), sz, render(sz))
