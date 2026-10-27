"""Review of every Ecoclima air-terminal face as terminalFaceDetail() (terminal-detail.ts) builds it.

Input: .cache/tmp/terminals.json, a dump of {code, pattern, w, h, circ, detail} for the 127
families, written by a throw-away vitest that calls terminalFaceDetail on each family's first
variant. Run in the live Blender (MCP): `RUN_RANGE = (start, stop)` picks a slice; renders go to
.cache/tmp/terms/<code>.png and are laid next to the manufacturer photo by the montage step.
Faces lie in the XZ plane (x width, z height), the camera looks along +y.
"""
from pathlib import Path
import json
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / ".cache/tmp/terms"
OUT.mkdir(parents=True, exist_ok=True)
DATA = json.loads((ROOT / ".cache/tmp/terminals.json").read_text(encoding="utf-8"))
START, STOP = globals().get("RUN_RANGE", (0, len(DATA)))


def material(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    return m


WHITE = material("T-bianco", (0.93, 0.93, 0.91))
DARK = material("T-scuro", (0.07, 0.08, 0.09))
ALU = material("T-alluminio", (0.55, 0.57, 0.6))


def box(sc, x, z, sx, sz, m, y, rot=0.0):
    me = bpy.data.meshes.new("b")
    hx, hz = sx / 2, sz / 2
    c, s = math.cos(rot), math.sin(rot)
    pts = [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)]
    me.from_pydata([(x + px * c - pz * s, y, z + px * s + pz * c) for px, pz in pts], [], [(0, 1, 2, 3)])
    me.materials.append(m)
    o = bpy.data.objects.new("b", me)
    sc.collection.objects.link(o)


def disc(sc, x, z, rx, rz, m, y, ring=0.0):
    n = 48
    me = bpy.data.meshes.new("d")
    outer = [(x + math.cos(i * math.tau / n) * rx, y, z + math.sin(i * math.tau / n) * rz) for i in range(n)]
    if ring:
        inner = [(x + math.cos(i * math.tau / n) * (rx - ring), y, z + math.sin(i * math.tau / n) * (rz - ring)) for i in range(n)]
        faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        me.from_pydata(outer + inner, [], faces)
    else:
        me.from_pydata(outer, [], [tuple(range(n))])
    me.materials.append(m)
    o = bpy.data.objects.new("d", me)
    sc.collection.objects.link(o)


def build(item):
    sc = bpy.data.scenes.new("T-" + item["code"])
    w, h, circ, d = item["w"], item["h"], item["circ"], item["detail"]
    layer = 0.0

    def nxt():
        nonlocal layer
        layer -= 0.0005
        return layer

    # same order as DeviceMeshes.tsx: body, plate, dark, holes, rings, discs, white
    if circ:
        disc(sc, 0, 0, w / 2, h / 2, ALU, nxt())
        if d["plate"]:
            disc(sc, 0, 0, w / 2, h / 2, WHITE, nxt())
        else:
            disc(sc, 0, 0, w / 2, h / 2, DARK, nxt())
    else:
        box(sc, 0, 0, w, h, ALU, nxt())
        if d["plate"]:
            box(sc, 0, 0, w, h, WHITE, nxt())
    for p in d["dark"]:
        box(sc, p["position"][0], p["position"][1], p["scale"][0], p["scale"][1], DARK, nxt(),
            (p.get("rotation") or [0, 0, 0])[2])
    for p in d["holes"]:
        disc(sc, p["position"][0], p["position"][1], p["scale"][0], p["scale"][1], DARK, nxt())
    for p in d["rings"]:
        r = p["scale"][0]
        disc(sc, p["position"][0], p["position"][1], r, p["scale"][1], WHITE, nxt(), ring=max(0.0015, r * 0.06))
    for p in d["discs"]:
        disc(sc, p["position"][0], p["position"][1], p["scale"][0], p["scale"][1], WHITE, nxt())
    for p in d["white"]:
        box(sc, p["position"][0], p["position"][1], p["scale"][0], p["scale"][1], WHITE, nxt(),
            (p.get("rotation") or [0, 0, 0])[2])
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", max(w, h) * 1.1
    cam.location = (0, -2, 0)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light, sc.display.shading.color_type = "FLAT", "MATERIAL"
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.25, 0.26, 0.28)
    sc.render.resolution_x = sc.render.resolution_y = 300
    sc.render.filepath = str(OUT / (item["code"].replace(" ", "_") + ".png"))
    bpy.context.window.scene = sc
    bpy.ops.render.render(write_still=True)
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)


keep = bpy.context.window.scene
for item in DATA[START:STOP]:
    build(item)
for sc in [s for s in bpy.data.scenes if s.name.startswith("T-")]:
    bpy.data.scenes.remove(sc)
bpy.context.window.scene = keep
