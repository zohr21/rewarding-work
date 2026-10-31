"""
Sprig in 3D, built by script so every stage can be rebuilt (Blender 4.2+ / 5.x).

Each focus tier is a real tree, from the most common to one of the rarest, stylised and
recognisable by outline and leaf; the tier's colour comes from the tree itself:
  0 Seed      an acorn peeking out of the soil, with a tiny sprout
  1 Seedling  an oak seedling: round Sprig with lobed oak leaves and little root feet
  2 Sprout    a field maple sprout: its bronze autumn leaves
  3 Sapling   a silver birch: white dashed bark (silver), drooping leaves
  4 Tree      a ginkgo, the "living fossil": fan-shaped leaves turned gold
  5 Grove     a Persian ironwood (Hyrcanian forests, Azerbaijan): red-to-gold autumn crown,
              a soft frosty sparkle and a crystal leaf (diamond), and two sleepy oak friends

Same face everywhere (big eyes with two shines, small smile, cheeks), soft matte colours;
it gets a little smaller and calmer as the tree grows up.
Metres, ground at z = 0, the face looks along -Y. Run headless:

  blender --background --factory-startup --python art/sprig/sprig3d.py -- --stage 1 --out <dir> [--preview]

Writes <dir>/sprig-<stage>.glb and, with --preview, <dir>/sprig-<stage>.png.
"""

import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector

FACE = "#1b2b22"
BLUSH = "#ff9a8f"
SOIL = "#5a4330"
GREEN = "#8fe0ae"
GREEN_DARK = "#5fbf8a"
BARK = "#7a5a40"


def lin(hex_colour):
    h = hex_colour.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)


_materials = {}


def material(hex_colour, rough=0.62, metal=0.0, coat=0.08, glass=0.0):
    key = (hex_colour, rough, metal, coat, glass)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(f"{hex_colour} r{rough} m{metal}")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = lin(hex_colour)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if "Coat Weight" in p.inputs:
        p.inputs["Coat Weight"].default_value = coat
    if glass and "Transmission Weight" in p.inputs:
        p.inputs["Transmission Weight"].default_value = glass
    _materials[key] = m
    return m


def smooth(obj, mat, subsurf=0):
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if subsurf:
        mod = obj.modifiers.new("Subsurf", "SUBSURF")
        mod.levels = mod.render_levels = subsurf
    return obj


def ball(loc, radii, mat, segments=40, name="Ball"):
    """An ellipsoid; radii is a number or (x, y, z)."""
    r = radii if isinstance(radii, (tuple, list)) else (radii,) * 3
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = r
    return smooth(obj, mat)


def gem(loc, size, mat, name="Gem"):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=0, radius=size, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (0.7, 0.7, 1.25)
    obj.data.materials.append(mat)
    return obj


def cylinder(loc, radius, depth, mat, top_scale=1.0, name="Cylinder"):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=radius, radius2=radius * top_scale, depth=depth, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    return smooth(obj, mat)


def curve_tube(points, width, mat, name="Tube"):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = width
    data.bevel_resolution = 4
    data.use_fill_caps = True
    sp = data.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for pt, co in zip(sp.points, points):
        pt.co = (*co, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def face_to(obj, normal):
    obj.rotation_euler = Vector((0, -1, 0)).rotation_difference(normal.normalized()).to_euler()


class Surface:
    """The front of an ellipsoid, addressed by (x, z) on the unit circle: x right, z up."""

    def __init__(self, centre, radii):
        self.c = Vector(centre)
        self.r = Vector(radii if isinstance(radii, (tuple, list)) else (radii,) * 3)

    def point(self, x, z, lift=0.0):
        y = -math.sqrt(max(0.0, 1 - x * x - z * z))
        n = Vector((x / self.r.x, y / self.r.y, z / self.r.z)).normalized()
        return self.c + Vector((x * self.r.x, y * self.r.y, z * self.r.z)) + n * lift, n


def face(s: Surface, sleepy=False, size=1.0):
    """Big eyes with two shines, rosy cheeks and a small smile."""
    k = min(s.r.x, s.r.z) * size
    dark, white, cheek = material(FACE, rough=0.25), material("#ffffff", rough=0.2), material(BLUSH, rough=0.85)
    for side in (-1, 1):
        x, z = 0.36 * side * size, -0.02
        if sleepy:
            pts = [s.point(x + 0.13 * size * t, z - 0.05 * size * math.sin(math.pi * (t + 1) / 2), 0.01)[0] for t in (-1, -0.5, 0, 0.5, 1)]
            curve_tube(pts, 0.022 * k, dark, "Eye closed")
        else:
            p, n = s.point(x, z)
            face_to(ball(p, (0.15 * k, 0.07 * k, 0.19 * k), dark, 24, "Eye"), n)
            p, n = s.point(x + 0.06 * size, z + 0.07 * size, 0.06 * k)
            face_to(ball(p, (0.055 * k, 0.02 * k, 0.055 * k), white, 16, "Shine"), n)
            p, n = s.point(x - 0.05 * size, z - 0.08 * size, 0.06 * k)
            face_to(ball(p, (0.028 * k, 0.012 * k, 0.028 * k), white, 12, "Shine small"), n)
        p, n = s.point(0.6 * side * size, -0.24 * size)
        face_to(ball(p, (0.15 * k, 0.03 * k, 0.09 * k), cheek, 20, "Cheek"), n)
    mouth = [s.point(-0.12 * size + 0.24 * size * i / 8, -0.24 * size - 0.09 * size * math.sin(math.pi * i / 8), 0.015)[0] for i in range(9)]
    curve_tube(mouth, 0.03 * k, dark, "Mouth")


def flat_shape(outline, thickness, mat, name):
    """A flat shape from an (x, z) outline, standing up and facing -Y, given some thickness."""
    verts = [(x, 0.0, z) for x, z in outline] + [(0.0, 0.0, sum(z for _, z in outline) / len(outline))]
    centre = len(verts) - 1
    faces = [(i, (i + 1) % len(outline), centre) for i in range(len(outline))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    smooth(obj, mat)
    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness, sol.offset = thickness, 0
    return obj


def leaf(base, tilt_deg, length, colour, metal=0.0, glass=0.0, name="Leaf"):
    """A plump teardrop leaf standing on `base`, leaning `tilt_deg` to the right, with a midrib."""
    outline = []
    for i in range(48):
        t = i / 48 * 2 * math.pi
        z = (1 - math.cos(t)) / 2  # 0 at the base, 1 at the tip
        w = math.sin(math.pi * z) ** 0.8 * (1 - 0.25 * z) * 0.36
        outline.append((w * length * (1 if t < math.pi else -1), z * length))
    obj = flat_shape(outline, 0.05 * length, material(colour, rough=0.4 if metal else 0.55, metal=metal, coat=0.3, glass=glass), name)
    obj.location = base
    obj.rotation_euler = (0, math.radians(tilt_deg), 0)
    rib = curve_tube([(0, -0.03 * length, 0.06 * length), (0, -0.03 * length, 0.7 * length)], 0.018 * length, material(colour, rough=0.8, metal=metal * 0.5), "Rib")
    rib.parent = obj
    return obj


def maple(base, tilt_deg, size, colour, name="Maple"):
    """A five-pointed maple leaf."""
    outline = []
    for i in range(80):
        t = i / 80 * 2 * math.pi
        r = 0.62 + 0.38 * abs(math.cos(2.5 * (t - math.pi / 2))) ** 1.4
        if math.sin(t) < -0.85:
            r *= 0.75  # a soft notch where the stalk joins
        outline.append((math.cos(t) * r * size * 0.5, (math.sin(t) * r + 1) * size * 0.5))
    obj = flat_shape(outline, 0.05 * size, material(colour, rough=0.4, metal=0.45, coat=0.3), name)
    obj.location = base
    obj.rotation_euler = (0, math.radians(tilt_deg), 0)
    return obj


def oak_leaf(base, tilt_deg, length, colour, name="Oak leaf"):
    """An oak leaf: a long blade with rounded lobes down both sides."""
    outline = []
    n = 96
    for i in range(n):
        t = i / n * 2 * math.pi
        z = (1 - math.cos(t)) / 2
        w = math.sin(math.pi * z) ** 0.7 * 0.3 * (0.62 + 0.38 * abs(math.sin(4.5 * math.pi * z)))
        outline.append((w * length * (1 if t < math.pi else -1), z * length))
    obj = flat_shape(outline, 0.05 * length, material(colour, rough=0.55, coat=0.2), name)
    obj.location = base
    obj.rotation_euler = (0, math.radians(tilt_deg), 0)
    curve_tube([(0, -0.03 * length, 0.04 * length), (0, -0.03 * length, 0.75 * length)], 0.016 * length, material(colour, rough=0.8), "Rib").parent = obj
    return obj


def ginkgo_leaf(base, direction, size, colour, metal=0.0, name="Ginkgo leaf"):
    """A ginkgo fan: narrow at the stalk, slightly curved sides, a wide wavy edge split in the
    middle, and fine veins fanning out. Points along `direction`, facing the camera."""
    outline = []
    for i in range(13):  # left side, from the stalk out to the edge, curving in a little
        t = i / 12
        outline.append((-math.sin(math.radians(62)) * size * t ** 1.25, math.cos(math.radians(62)) * size * t + 0.06 * size * t))
    for i in range(1, 60):  # the edge, from left to right
        a = math.radians(-62 + 124 * i / 60)
        r = size * (1 - 0.16 * math.exp(-((a / 0.08) ** 2))) * (1 + 0.025 * math.sin(14 * a))
        outline.insert(len(outline), (math.sin(a) * r, math.cos(a) * r + 0.06 * size))
    for i in range(12, -1, -1):  # right side back to the stalk
        t = i / 12
        outline.append((math.sin(math.radians(62)) * size * t ** 1.25, math.cos(math.radians(62)) * size * t + 0.06 * size * t))
    obj = flat_shape(outline, 0.035 * size, material(colour, rough=0.45 if metal else 0.6, metal=metal, coat=0.25), name)
    vein = material("#d9a93a", rough=0.8, metal=metal * 0.5)
    for k in range(-3, 4):
        a = math.radians(k * 15)
        curve_tube([(0, -0.025 * size, 0.08 * size), (math.sin(a) * 0.82 * size, -0.025 * size, math.cos(a) * 0.82 * size)], 0.008 * size, vein, "Vein").parent = obj
    curve_tube([(0, 0, -0.32 * size), (0, 0, 0.05 * size)], 0.025 * size, material("#a07a2a", rough=0.8), "Stalk").parent = obj
    obj.location = base
    d = Vector(direction).normalized()
    obj.rotation_euler = (0, math.atan2(d.x, d.z), 0)
    return obj


def soil(radius=0.95):
    ball((0, 0, 0.04), (radius, radius * 0.75, 0.16), material(SOIL, rough=0.95), name="Soil")
    for x, y in [(-0.7, -0.2), (0.75, -0.1), (-0.5, 0.45)]:
        for k in range(3):
            leaf((x + k * 0.05 - 0.05, y, 0.1), -25 + k * 25, 0.18, GREEN_DARK, name="Grass")


def feet(centre_x, z, spread, size, colour=GREEN_DARK):
    for side in (-1, 1):
        ball((centre_x + side * spread, -0.25 * size, z), (0.17 * size, 0.2 * size, 0.1 * size), material(colour), name="Foot")


def puff_canopy(centre, main_r, puffs, colour):
    mat = material(colour, rough=0.65)
    body = ball(centre, (main_r, main_r * 0.95, main_r * 0.92), mat, name="Canopy")
    for dx, dy, dz, r in puffs:
        ball((centre[0] + dx, centre[1] + dy, centre[2] + dz), r, mat, name="Puff")
    return body


def on_puff(centre, r, direction):
    d = Vector(direction).normalized()
    return Vector(centre) + d * r * 0.97, d


# ---------- the six stages ----------


def stage0():
    soil()
    body = Surface((0, 0, 0.55), (0.48, 0.46, 0.62))
    ball(body.c, tuple(body.r), material("#f0d39c", rough=0.6), name="Acorn")
    ball((0, 0.03, 1.02), (0.52, 0.5, 0.24), material("#8a5a36", rough=0.85), name="Cap")
    for i in range(14):  # the cap's little scales
        a = i / 14 * 2 * math.pi
        ball((math.cos(a) * 0.45, math.sin(a) * 0.43 + 0.03, 0.98), 0.065, material("#7a4c2c", rough=0.9), 12, "Scale")
    cylinder((0, 0.03, 1.29), 0.05, 0.16, material("#6b4428", rough=0.8), 0.8, "Stem")
    leaf((0.02, 0.03, 1.34), 35, 0.36, GREEN, name="Sprout leaf")
    face(Surface(body.c + Vector((0, 0, -0.12)), tuple(body.r)), size=0.92)


def stage1():
    soil()
    body = Surface((0, 0, 0.66), (0.66, 0.62, 0.62))
    ball(body.c, tuple(body.r), material(GREEN), name="Body")
    feet(0, 0.1, 0.28, 1.0)
    cylinder((0, 0.04, 1.3), 0.035, 0.1, material("#6b8f4a"), 0.8, "Stem")
    oak_leaf((0.01, 0.04, 1.3), 16, 0.7, GREEN, "Oak leaf")
    oak_leaf((-0.01, 0.06, 1.3), -46, 0.42, GREEN_DARK, "Oak leaf small")
    face(body)


def stage2():
    soil()
    body = Surface((0, 0, 0.68), (0.68, 0.64, 0.64))
    ball(body.c, tuple(body.r), material(GREEN), name="Body")
    feet(0, 0.1, 0.3, 1.0)
    cylinder((0, 0.04, 1.36), 0.04, 0.12, material("#6b8f4a"), 0.8, "Stem")
    maple((0.02, 0.04, 1.36), 32, 0.62, "#d68f55", "Maple big")
    maple((-0.02, 0.06, 1.36), -38, 0.46, "#c47a3e", "Maple small")
    face(body)


def stage3():
    bark = material("#f2f0ea", rough=0.7)
    cylinder((0, 0, 0.55), 0.17, 1.1, bark, 0.8, "Birch trunk")
    for i in range(9):  # birch's dark dashes
        a = random.uniform(-1.2, 1.2)
        z = 0.12 + i * 0.11
        p = Vector((math.sin(a) * 0.165 * (1 - z * 0.15), -math.cos(a) * 0.165 * (1 - z * 0.15), z))
        dash = ball(p, (random.uniform(0.04, 0.08), 0.015, 0.014), material("#2e2b28", rough=0.9), 12, "Dash")
        face_to(dash, Vector((p.x, p.y, 0)))
    feet(0, 0.06, 0.15, 0.75, "#cfc8ba")
    canopy = Surface((0, 0, 1.62), (0.66, 0.62, 0.74))
    ball(canopy.c, tuple(canopy.r), material("#b8e3c6", rough=0.6), name="Canopy")
    for x, z, t in [(-0.52, 1.92, -55), (0.5, 1.96, 55), (-0.32, 2.18, -28), (0.34, 2.2, 30)]:
        leaf((x, 0.15, z), t, 0.3, "#93cfa8", name="Birch leaf")
    leaf((0, 0.05, 2.3), 15, 0.5, "#dfe5ea", metal=0.85, name="Silver leaf")
    face(canopy, size=0.85)


def stage4():
    cylinder((0, 0, 0.5), 0.18, 1.0, material("#8a6a50", rough=0.85), 0.7, "Trunk")
    feet(0, 0.06, 0.19, 0.95, "#6b4a32")
    # Ginkgo grows upright and a little conical: a tall soft crown, gold all over in autumn.
    c = Vector((0, 0, 1.75))
    crown = Surface(c, (0.74, 0.7, 0.82))
    ball(c, tuple(crown.r), material("#f5cf5a", rough=0.62), name="Crown")
    # Tiers that narrow upwards, like a young ginkgo's outline.
    for dx, dz, r, col in [(-0.62, -0.3, 0.4, "#e9c94e"), (0.64, -0.26, 0.42, "#f2d25e"), (-0.36, 0.5, 0.38, "#f7da6a"),
                           (0.38, 0.52, 0.38, "#e9c94e"), (0, 0.86, 0.32, "#f7da6a")]:
        ball((dx, 0.15, c.z + dz), (r, r, r * 0.85), material(col, rough=0.62), name="Crown tier")
    # A few big fan leaves on the crown, clear of the face, so the ginkgo reads by its leaf.
    for x, z, ang, size, col in [(-0.62, 0.15, -55, 0.36, "#f9dd70"), (0.66, 0.2, 50, 0.38, "#eec245"), (-0.42, 0.7, -25, 0.32, "#eec245"),
                                 (0.44, 0.72, 28, 0.34, "#f9dd70"), (-0.86, -0.32, -95, 0.3, "#eec245"), (0.9, -0.28, 95, 0.3, "#f9dd70")]:
        d = Vector((math.sin(math.radians(ang)), 0, math.cos(math.radians(ang))))
        ginkgo_leaf(c + Vector((x * 0.95, -0.5, z * 0.95)), d, size, col)
    ginkgo_leaf(c + Vector((0, 0.1, 1.15)), (0.15, 0, 1), 0.34, "#f2c14e", metal=0.85, name="Gold leaf")
    face(crown, size=0.78)


def stage5():
    bark = material("#8c7a6a", rough=0.8)  # ironwood's smooth grey-brown bark, flaking in paler patches
    patch = material("#b9a58e", rough=0.85)
    # Low and spreading: a short trunk splitting into three limbs.
    cylinder((0, 0, 0.32), 0.24, 0.64, bark, 0.85, "Trunk")
    for x, tilt in [(-0.38, 34), (0.4, -34), (0.02, 0)]:
        limb = cylinder((x * 0.55, 0.05, 0.86), 0.11, 0.62, bark, 0.7, "Limb")
        limb.rotation_euler = (0, math.radians(-tilt), 0)
    for z, a in [(0.18, 0.4), (0.42, -0.5), (0.3, 1.1)]:
        p = Vector((math.sin(a) * 0.23, -math.cos(a) * 0.23, z))
        face_to(ball(p, (0.07, 0.012, 0.05), patch, 12, "Bark patch"), Vector((p.x, p.y, 0)))
    feet(0, 0.06, 0.22, 1.0, "#6b5a4a")

    # A wide, flat-topped crown in autumn colours: red at the edges, orange and gold towards the middle.
    c = Vector((0, 0, 1.55))
    crown = Surface(c, (0.82, 0.76, 0.66))
    ball(c, tuple(crown.r), material("#e08a45", rough=0.75), name="Crown")
    puffs = [(-0.92, 0.1, -0.05, 0.5, "#c9573b"), (0.94, 0.1, -0.02, 0.5, "#b8493f"), (-0.5, 0.2, 0.36, 0.52, "#e9b04e"),
             (0.52, 0.2, 0.38, 0.52, "#d97a3a"), (0, 0.25, 0.5, 0.5, "#efc15a"), (-1.3, 0.28, 0.12, 0.38, "#9c4250"), (1.32, 0.28, 0.15, 0.38, "#c9573b")]
    for dx, dy, dz, r, col in puffs:
        ball((dx, dy, c.z + dz), (r * 1.15, r, r * 0.72), material(col, rough=0.75), name="Crown puff")
    # Leaves all over the outline so it reads as foliage, not balloons.
    rng = random.Random(5)
    for dx, dy, dz, r, col in puffs:
        for _ in range(7):
            d = Vector((rng.uniform(-1, 1), rng.uniform(-1, -0.3), rng.uniform(-0.1, 1)))
            p, n = on_puff((dx, dy, c.z + dz), r * 0.95, d)
            if abs(p.x) < 0.5 and p.z < c.z + 0.2 and p.y < 0:
                continue  # keep the face clear
            face_to(leaf(p, rng.uniform(-70, 70), 0.3, col, name="Ironwood leaf"), n)

    # Diamond: a soft frosty sparkle around the crown and a crystal leaf on top.
    frost = material("#e6f7ff", rough=0.05, metal=0.1, coat=1.0, glass=0.6)
    for x, z, size in [(-1.2, 2.45, 0.11), (1.25, 2.3, 0.09), (0.75, 2.6, 0.08), (-0.6, 2.75, 0.07)]:
        gem((x, -0.25, z), size, frost, "Frost")
    leaf((0, 0.3, 2.35), 15, 0.48, "#bfeaff", metal=0.2, glass=0.5, name="Crystal leaf")
    face(crown, size=0.72)

    # Two little oak seedlings, asleep.
    for x in (-1.75, 1.75):
        ball((x, 0.35, 0.03), (0.5, 0.38, 0.1), material(SOIL, rough=0.95), name="Friend soil")
        f = Surface((x, 0.35, 0.4), (0.38, 0.36, 0.36))
        ball(f.c, tuple(f.r), material(GREEN_DARK), name="Friend")
        oak_leaf((x, 0.38, 0.74), -12 if x < 0 else 12, 0.36, GREEN_DARK, "Friend leaf")
        face(f, sleepy=True, size=0.95)


STAGES = [stage0, stage1, stage2, stage3, stage4, stage5]


def render_preview(path):
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = lin("#1c2b23")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.2

    def light(name, loc, energy, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.size = energy, size
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        obj.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(obj)

    light("Key", (-3, -4, 6), 650, 5)
    light("Fill", (4, -3, 2), 180, 4)
    light("Rim", (3.5, 3, 4), 420, 3)

    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 85
    bpy.context.view_layer.update()
    corners = [o.matrix_world @ Vector(c) for o in scene.objects if o.type in {"MESH", "CURVE"} for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    target = (lo + hi) / 2
    distance = max(hi.x - lo.x, hi.z - lo.z) / 2 / math.tan(cam.data.angle / 2) * 1.3
    cam.location = target + Vector((0.24, -1, 0.3)).normalized() * distance
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, default=1)
    ap.add_argument("--out", default=".")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(a.stage)
    STAGES[a.stage]()
    glb = os.path.join(a.out, f"sprig-{a.stage}.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True)
    print(f"[sprig] wrote {glb}")
    if a.preview:
        png = os.path.join(a.out, f"sprig-{a.stage}.png")
        render_preview(png)
        print(f"[sprig] wrote {png}")


main()
