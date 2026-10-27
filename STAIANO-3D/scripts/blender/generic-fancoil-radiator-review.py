"""Review scenes (2): Innova SL/SLS, Olimpia Bi2 Air, Lazzarini Empoli, Zehnder Nova as the app draws them.

Run inside the live Blender (MCP) after generic-families-review.py helpers are available: this file
re-declares the few it needs. Mirrors FanCoilMeshes.tsx (generic FanCoilBody, wall unit) and
device-detail.ts (Nova, Empoli). Axes: x width, y depth (front at -y), z height.
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
src = (ROOT / "scripts/blender/generic-families-review.py").read_text(encoding="utf-8")
# reuse helpers only (everything before the first family function)
exec(compile(src[: src.index("def fcz_cabinet")], "helpers", "exec"), globals())
mirror_m = mat("Specchio", (0.55, 0.62, 0.62), 0.05, 0.8)
panel_m = mat("Pannello antracite", (0.2, 0.22, 0.23), 0.4, 0.2)


def wall_fancoil(name, w, h, d, radius):
    sc = new_scene(name)
    box((0, 0, h / 2), (w, d, h), white, radius)
    face = -d / 2 - 0.0003
    rh = h * 0.19
    ry = h / 2 - h * 0.31
    box((0, face, ry), (w * 0.86, 0.001, rh), dark)
    n = min(12, max(4, round(rh / 0.017)))
    for i in range(n):
        z = ry - rh / 2 + rh * (i + 0.5) / n + 0.0
        box((0, face - 0.001, z), (w * 0.86, 0.002, min(0.004, rh / n * 0.3)), white)
    top = h + 0.0003
    box((0, 0, top), (w * 0.86, d * 0.63, 0.001), dark)
    for i in range(18):
        box((w * (-0.41 + 0.82 * i / 17), 0, top + 0.001), (0.004, d * 0.63, 0.002), white)
    render(sc, name, (0, 0, h / 2), max(w, h) * 1.25, cam_off=(0.6, -2.5, 0.45))


def nova(name, w, h, d, profiles, double):
    sc = new_scene(name)
    pw = min(0.07, (w - 0.004) / profiles)
    pd = min(0.008, d / 4)
    rows = [d / 2 - pd / 2, -d / 2 + pd / 2] if double else [d / 2 - pd / 2]
    for y in rows:
        for i in range(profiles):
            x = (i / (profiles - 1) - 0.5) * (w - pw - 0.004)
            box((x, y, h / 2), (pw, pd, h - 0.004), white, 0.002)
    for z in (0.019, h - 0.019):
        cyl((0, 0, z), min(0.019, d / 2), w, "X", white)
    render(sc, name, (0, 0, h / 2), h * 1.1, cam_off=(1.2, -3, 0.4))


def empoli(name, w, h, d, profiles):
    sc = new_scene(name)
    pw, pd, gap = 0.07, 0.011, 0.005
    for side in (-1, 1):
        for i in range(profiles // 2):
            x = side * (w / 2 - pw / 2 - i * (pw + gap))
            box((x, d / 2 - pd / 2, h / 2), (pw, pd, h), panel_m, 0.002)
    r = 0.0175
    for z in (r, h - r):
        cyl((0, d / 2 - pd - r, z), r, w - pw, "X", alu)
    box((0, d / 2 - 0.001, h / 2), (w - profiles * (pw + gap), 0.002, h - gap * 2), mirror_m)
    render(sc, name, (0, 0, h / 2), h * 1.1, cam_off=(1.2, -3, 0.4))


wall_fancoil("innova-sl", 0.735, 0.579, 0.129, 0.006)
wall_fancoil("innova-sls", 0.735, 0.379, 0.129, 0.006)
wall_fancoil("olimpia-bi2-air", 0.695, 0.599, 0.150, 0.018)
nova("zehnder-nova", 0.80, 1.8, 0.047, 11, False)
empoli("lazzarini-empoli", 0.60, 1.8, 0.0475, 4)
