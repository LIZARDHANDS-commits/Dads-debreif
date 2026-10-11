# Builds the showpiece buildings in Blender and exports them as one .glb (TR-142; Patrick, 10 Oct: "Showpiece buildings rebuilt in
# Blender: the hangars, Glass Palace, tower, Snowbirds hangar and Mess, with real roofs, recessed windows").
#
# Each building stands on its traced footprint (tools/blender/export-showpieces.mjs writes them from the 3D view's own data). Walls
# are built as panels round their openings, so every window sits back in the wall with a sill under it and its glass set in; the
# hangar doors are ribbed leaves set back under a header; flat roofs sit inside a parapet with a coping; the Snowbirds and Hangar 5
# keep their low hip roofs over a fascia. Sizes not in the data (window sizes and spacing, parapets, doors, skylights, the tower's
# cab) are ESTIMATES from the street views and common building practice.
#
# Each face carries its colour as a vertex colour, and only four materials are left, so a building is about four draw calls:
# "plain" (walls, trim, doors, units), "glass", "roof-metal" and "roof-membrane"; the 3D view gives each its own look
# (showpieces3d.js), the roofs their textures.
#
# Usage: blender -b -P tools/blender/build-showpieces.py -- showpieces.json out.glb
import bpy, json, sys, math

argv = sys.argv[sys.argv.index('--') + 1:]
spec = json.load(open(argv[0]))
out = argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

WALL = '#eceeef'
TRIM = '#f1f1ee'
GLASS = '#3b5368'
BASE = '#6b7075'
DOOR = '#5b6470'


class Building:
    """One building's mesh in world feet, built in its own turned frame (x along its width, y along its depth)."""

    def __init__(self, name, cx, cy, rot):
        self.name, self.cx, self.cy = name, cx, cy
        self.c, self.s = math.cos(rot), math.sin(rot)
        self.verts, self.local, self.faces, self.mats = [], [], [], []

    def world(self, p):
        x, y, z = p
        return (self.cx + x * self.c - y * self.s, self.cy + x * self.s + y * self.c, z)

    def mat(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def poly(self, pts, m):
        base = len(self.verts)
        self.verts += [self.world(p) for p in pts]
        self.local += [tuple(p) for p in pts]
        self.faces.append((tuple(range(base, base + len(pts))), self.mat(m)))

    def box(self, o, ex, ey, ez, m):
        """A box from corner o along edges ex, ey, ez (local 3-vectors), faces outward."""
        def c(i, j, k):
            return tuple(o[n] + i * ex[n] + j * ey[n] + k * ez[n] for n in range(3))
        det = (ex[0] * (ey[1] * ez[2] - ey[2] * ez[1]) - ex[1] * (ey[0] * ez[2] - ey[2] * ez[0]) + ex[2] * (ey[0] * ez[1] - ey[1] * ez[0]))
        quads = [(c(0, 0, 0), c(0, 0, 1), c(0, 1, 1), c(0, 1, 0)), (c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)),
                 (c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)), (c(0, 1, 0), c(0, 1, 1), c(1, 1, 1), c(1, 1, 0)),
                 (c(0, 0, 0), c(0, 1, 0), c(1, 1, 0), c(1, 0, 0)), (c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1))]
        for q in quads:
            self.poly(q if det > 0 else q[::-1], m)

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], [f for f, _ in self.faces])
        groups = ['plain', 'glass', 'roof-metal', 'roof-membrane']
        for g in groups:
            mat = bpy.data.materials.get(g) or bpy.data.materials.new(g)
            mesh.materials.append(mat)
        col = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
        for poly, (_, mi) in zip(mesh.polygons, self.faces):
            kind, colour = self.mats[mi].split('|')
            poly.material_index = groups.index(kind) if kind in groups else 0
            h = colour.lstrip('#')
            rgb = [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
            for li in poly.loop_indices:
                col.data[li].color = (*rgb, 1)
        mesh.color_attributes.active_color = col
        # Roof faces get UVs in feet over the texture's tile, in the building's own frame, so the ribs and sheets run square to
        # its walls; on a slope u runs along the level edge and v up the fall line (roof-textures3d.js ROOF_TILE_FT, roofUv).
        uv = mesh.uv_layers.new(name='UV')
        for poly, (f, mi) in zip(mesh.polygons, self.faces):
            kind = self.mats[mi].split('|')[0]
            if not kind.startswith('roof-'):
                continue
            tile = ROOF_TILE_FT[kind]
            a, b, c = (self.local[f[0]], self.local[f[1]], self.local[f[2]])
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - b[0], c[1] - b[1], c[2] - b[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            nx, ny, nz = nx / ln, ny / ln, nz / ln
            hh = math.hypot(nx, ny)
            for li, vi in zip(poly.loop_indices, f):
                x, y, z = self.local[vi]
                if hh < 0.05:
                    uv.data[li].uv = (x / tile, y / tile)
                else:
                    uv.data[li].uv = ((x * -ny / hh + y * nx / hh) / tile, (z * hh - (x * nx / hh + y * ny / hh) * nz) / tile)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


ROOF_TILE_FT = {'roof-metal': 40, 'roof-membrane': 60}  # feet a texture tile covers (roof-textures3d.js)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def m(kind, colour):
    return f'{kind}|{colour}'


def ccw(pts):
    a = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return pts if a > 0 else pts[::-1]


def wall(B, p0, p1, z0, z1, openings, mat_at, t=1.0, reveal=0.7, framed=False):
    """A wall on the footprint edge p0 -> p1 (interior on its left), from z0 to z1, built as solid panels round `openings`:
    (u0, u1, zb, zt, kind) with kind 'win', 'ribbon' (mullions every 5 ft), 'door' or 'hangar'. mat_at(z) gives the panel's
    material by height."""
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    if L < 0.5:
        return
    e = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L)
    n = (-e[1], e[0])  # inward
    us = sorted({0.0, L, *[o[0] for o in openings], *[o[1] for o in openings]})
    zs = sorted({z0, z1, *[o[2] for o in openings if z0 < o[2] < z1], *[o[3] for o in openings if z0 < o[3] < z1]})
    zs = sorted({z for z in zs if z0 <= z <= z1} | set(mat_breaks(mat_at, z0, z1)))

    def at(u, d, z):
        return (p0[0] + e[0] * u + n[0] * d, p0[1] + e[1] * u + n[1] * d, z)

    def panel(u0, u1, za, zb, d0, d1, mm):
        B.box(at(u0, d0, za), (e[0] * (u1 - u0), e[1] * (u1 - u0), 0), (n[0] * (d1 - d0), n[1] * (d1 - d0), 0), (0, 0, zb - za), mm)

    for zi in range(len(zs) - 1):
        za, zb = zs[zi], zs[zi + 1]
        zm = (za + zb) / 2
        run = None
        for ui in range(len(us) - 1):
            ua, ub = us[ui], us[ui + 1]
            um = (ua + ub) / 2
            hole = any(o[0] <= um <= o[1] and o[2] <= zm <= o[3] for o in openings)
            if not hole:
                run = (run[0], ub) if run else (ua, ub)
            if (hole or ui == len(us) - 2) and run:
                panel(run[0], run[1], za, zb, 0, t, mat_at(zm))
                run = None
    for (u0, u1, zb, zt, kind) in openings:
        w = u1 - u0
        if kind in ('win', 'ribbon'):
            panel(u0, u1, zb, zt, reveal, reveal + 0.15, m('glass', GLASS))
            panel(u0 - 0.25, u1 + 0.25, zb - 0.3, zb, -0.35, reveal, m('trim', TRIM))  # the sill
            if framed:  # a white frame round it, standing proud of the wall
                panel(u0 - 0.4, u1 + 0.4, zt, zt + 0.4, -0.2, 0.2, m('trim', TRIM))
                panel(u0 - 0.4, u0, zb, zt, -0.2, 0.2, m('trim', TRIM))
                panel(u1, u1 + 0.4, zb, zt, -0.2, 0.2, m('trim', TRIM))
            step = 5.0 if kind == 'ribbon' else 6.0
            k = max(1, round(w / step))
            for i in range(1, k):
                u = u0 + w * i / k
                panel(u - 0.15, u + 0.15, zb, zt, reveal - 0.2, reveal, m('trim', TRIM))  # mullions
        elif kind == 'door':
            panel(u0, u1, zb, zt, 0.5, 0.65, m('door', DOOR))
            panel(u0 - 1.5, u1 + 1.5, zt + 0.6, zt + 1.0, -3.5, 0, m('trim', TRIM))  # a small canopy over it
        elif kind == 'hangar':
            leaves = max(4, round(w / 32))
            lw = w / leaves
            for i in range(leaves):
                a, b = u0 + i * lw + 0.12, u0 + (i + 1) * lw - 0.12
                panel(a, b, zb, zt, 1.5, 2.2, m('door', DOOR))
                r = a + 2
                while r < b - 1:
                    panel(r - 0.2, r + 0.2, zb, zt, 1.25, 1.5, m('rib', '#4a525d'))  # the leaves' ribs
                    r += 4
                panel(a, b, zb + (zt - zb) * 0.48, zb + (zt - zb) * 0.52, 1.2, 1.5, m('rib', '#4a525d'))  # a mid rail
            panel(u0 - 2, u1 + 2, zt, zt + 2.5, -1.2, 0.8, m('trim', '#3f454c'))  # the door header and its track


def mat_breaks(mat_at, z0, z1):
    out, prev = [], mat_at(z0 + 0.01)
    z = z0
    while z < z1:
        z += 0.5
        cur = mat_at(min(z, z1) - 0.01)
        if cur != prev:
            out.append(z - 0.5)
            prev = cur
    return out


def windows(L, zb, zt, w=4.0, every=12.0, margin=8.0, skip=()):
    """Evenly spaced windows along a wall of length L, clear of `skip` (u0, u1) spans."""
    out = []
    n = int((L - 2 * margin + every - w) // every)
    if n < 1:
        return out
    start = (L - (n - 1) * every - w) / 2
    for i in range(n):
        u0 = start + i * every
        if any(u0 < b + 1 and u0 + w > a - 1 for a, b in skip):
            continue
        out.append((u0, u0 + w, zb, zt, 'win'))
    return out


def rect(w, d):
    return [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]


def flat_roof(B, pts, h, roof_kind, roof_colour, parapet=3.0, coping='#c9c6bd', wall_colour=WALL):
    """The roof inside a parapet `parapet` ft high with a coping along its top."""
    B.poly([(x, y, h) for x, y in pts], m(roof_kind, roof_colour))
    for i in range(len(pts)):
        p0, p1 = pts[i], pts[(i + 1) % len(pts)]
        wall(B, p0, p1, h, h + parapet, [], lambda z: m('wall', wall_colour), t=0.8)
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        e = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L)
        n = (-e[1], e[0])
        o = (p0[0] - n[0] * 0.25 - e[0] * 0.25, p0[1] - n[1] * 0.25 - e[1] * 0.25, h + parapet)
        B.box(o, (e[0] * (L + 0.5), e[1] * (L + 0.5), 0), (n[0] * 1.3, n[1] * 1.3, 0), (0, 0, 0.35), m('trim', coping))


def roof_unit(B, x, y, z, w=8, d=6, h=4.5):
    B.box((x - w / 2, y - d / 2, z), (w, 0, 0), (0, d, 0), (0, 0, h), m('unit', '#b9bcbe'))
    B.box((x - w / 2 + 1, y - d / 2 + 1, z + h), (w - 2, 0, 0), (0, d - 2, 0), (0, 0, 0.6), m('dark', '#6b6f73'))


def local_face_mid(b, i):
    x, y = [(0, -b['d'] / 2), (b['w'] / 2, 0), (0, b['d'] / 2), (-b['w'] / 2, 0)][i]
    c, s = math.cos(b['rot']), math.sin(b['rot'])
    return b['cx'] + x * c - y * s, b['cy'] + x * s + y * c


def dist_to_block(x, y, b):
    c, s = math.cos(-b['rot']), math.sin(-b['rot'])
    lx = (x - b['cx']) * c - (y - b['cy']) * s
    ly = (x - b['cx']) * s + (y - b['cy']) * c
    return math.hypot(max(0, abs(lx) - b['w'] / 2), max(0, abs(ly) - b['d'] / 2))


def face_toward(b, dx, dy):
    """The rect edge (0 -y, 1 +x, 2 +y, 3 -x) whose outward normal points most along (dx, dy) in world."""
    c, s = math.cos(b['rot']), math.sin(b['rot'])
    normals = [(0, -1), (1, 0), (0, 1), (-1, 0)]
    best = max(range(4), key=lambda i: (normals[i][0] * c - normals[i][1] * s) * dx + (normals[i][0] * s + normals[i][1] * c) * dy)
    return best


def office_block(name, b, ramp=None, abut=None, roof_kind='roof-membrane', roof_colour=None, wall_colour=WALL, bands=None,
                 coping='#c9c6bd', frame=TRIM, B=None):
    """A flat-roofed block: base band, walls with windows (a ribbon and two doors on its ramp face), parapet, membrane roof."""
    own = B is None
    B = B or Building(name, b['cx'], b['cy'], b['rot'])
    pts = rect(b['w'], b['d'])
    h = b['h']
    skip = set()
    if abut:
        skip = {i for i in range(4) if dist_to_block(*local_face_mid(b, i), abut) < 4}
    ramp_face = face_toward(b, *ramp) if ramp else -1
    bands = bands or ([(4, 8.5), (16, 20.5)] if h >= 26 else [(4, 8.5)])
    for i in range(4):
        p0, p1 = pts[i], pts[(i + 1) % 4]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ops = []
        if i not in skip:
            if i == ramp_face and L > 30:
                doors = [(L / 3 - 1.75, L / 3 + 1.75), (2 * L / 3 - 1.75, 2 * L / 3 + 1.75)]
                ops += [(a, bb, 0, 7.5, 'door') for a, bb in doors]
                edges = [6, doors[0][0] - 3, doors[0][1] + 3, doors[1][0] - 3, doors[1][1] + 3, L - 6]
                for k in range(0, 6, 2):
                    if edges[k + 1] - edges[k] > 4:
                        ops.append((edges[k], edges[k + 1], bands[0][0] + 0.5, bands[0][1], 'ribbon'))
                for zb, zt in bands[1:]:
                    ops.append((6, L - 6, zb, zt, 'ribbon'))
            else:
                for zb, zt in bands:
                    ops += windows(L, zb, zt)
        wall(B, p0, p1, 0, h, ops, lambda z: m('base', BASE) if z < 2.5 else m('wall', wall_colour))
    flat_roof(B, pts, h, roof_kind, roof_colour or b['roof'], coping=coping, wall_colour=wall_colour)
    if b['w'] * b['d'] > 2500:
        roof_unit(B, -b['w'] * 0.2, 0, h)
    return B.finish() if own else B


def flat_hangar(H):
    mb = H['main']
    B = Building(H['id'], mb['cx'], mb['cy'], mb['rot'])
    pts = rect(mb['w'], mb['d'])
    h = mb['h']
    for i in range(4):
        p0, p1 = pts[i], pts[(i + 1) % 4]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if i == 1:  # the big doors, east
            door_w = mb['d'] * 0.85
            ops = [((L - door_w) / 2, (L + door_w) / 2, 0, 28, 'hangar')]
            ops += windows(L, 32, 36.5, w=8, every=14, margin=6, skip=[((L - door_w) / 2 - 4, (L + door_w) / 2 + 4)])
        else:
            ops = windows(L, 30, 35, w=8, every=14, margin=10)
            if i == 0:
                ops.append((L * 0.25 - 1.75, L * 0.25 + 1.75, 0, 7.5, 'door'))
        wall(B, p0, p1, 0, h, ops, lambda z: m('base', BASE) if z < 3 else m('wall', WALL))
    # The accent band over the doors (each hangar's colour).
    door_w = mb['d'] * 0.85
    B.box((mb['w'] / 2 - 0.4, -door_w / 2 - 5, 30.5), (1.0, 0, 0), (0, door_w + 10, 0), (0, 0, 4.5), m('trim', H['accent']))
    flat_roof(B, pts, h, 'roof-metal', mb['roof'], parapet=2.5)
    # Skylight strips across the roof, every 30 ft (estimate).
    k = int(mb['w'] // 30)
    for i in range(1, k):
        x = -mb['w'] / 2 + i * mb['w'] / k
        B.box((x - 2, -mb['d'] / 2 + 12, h), (4, 0, 0), (0, mb['d'] - 24, 0), (0, 0, 0.5), m('skylight', '#dfe8ee'))
    return B


def flat_hangar_full(H):
    """The hangar and its annexes as one object (one node in the .glb, named by the hangar's id)."""
    B = flat_hangar(H)
    for a in H['annexes']:
        sub = Building(B.name, a['cx'], a['cy'], a['rot'])
        office_block(B.name, a, ramp=(0, -1), abut=H['main'], B=sub)
        merge(B, sub)
    return B.finish()


def merge(into, other):
    base = len(into.verts)
    into.verts += other.verts
    into.local += other.local  # each part's UVs stay in its own frame
    for f, mi in other.faces:
        into.faces.append((tuple(v + base for v in f), into.mat(other.mats[mi])))


def hip_roof(B, w, d, h, rise, colour, overhang=2.0):
    W, D = w + 2 * overhang, d + 2 * overhang
    long_x = W >= D
    r = abs(W - D) / 2
    a, b = (-r, 0, h + rise), (r, 0, h + rise)
    if not long_x:
        a, b = (0, -r, h + rise), (0, r, h + rise)
    c0, c1, c2, c3 = (-W / 2, -D / 2, h), (W / 2, -D / 2, h), (W / 2, D / 2, h), (-W / 2, D / 2, h)
    rm = m('roof-metal', colour)
    if long_x:
        B.poly([c0, c1, b, a], rm); B.poly([c2, c3, a, b], rm); B.poly([c1, c2, b], rm); B.poly([c3, c0, a], rm)
    else:
        B.poly([c1, c2, b, a], rm); B.poly([c3, c0, a, b], rm); B.poly([c0, c1, a], rm); B.poly([c2, c3, b], rm)
    B.poly([c0, c3, c2, c1], m('dark', '#3a3f45'))  # the soffit
    for p0, p1 in ((c0, c1), (c1, c2), (c2, c3), (c3, c0)):
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        e = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L)
        n = (-e[1], e[0])
        B.box((p0[0], p0[1], h - 1.2), (e[0] * L, e[1] * L, 0), (n[0] * 0.5, n[1] * 0.5, 0), (0, 0, 1.4), m('trim', '#2f3439'))  # fascia


def east_hangar(H, A, upper_from):
    mb = H['main']
    B = Building(H['id'], mb['cx'], mb['cy'], mb['rot'])
    pts = rect(mb['w'], mb['d'])
    h = mb['h']
    for i in range(4):
        p0, p1 = pts[i], pts[(i + 1) % 4]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ops = []
        if i == 0:  # the big doors, south-west
            door_w = mb['w'] * 0.85
            ops = [((L - door_w) / 2, (L + door_w) / 2, 0, 32, 'hangar')]
        elif i == 3:
            ops = windows(L, 34, 39, w=8, every=14, margin=10)
        wall(B, p0, p1, 0, h, ops, lambda z: m('base', BASE) if z < 2.5 else (m('wall', WALL) if z < upper_from else m('wall', H['upper'])))
    door_w = mb['w'] * 0.85
    B.box((-door_w / 2 - 5, -mb['d'] / 2 - 0.4, 34.5), (door_w + 10, 0, 0), (0, 1.0, 0), (0, 0, 4), m('trim', '#f1f1ee'))
    hip_roof(B, mb['w'], mb['d'], h, 6, mb['roof'])
    # The annexes, north-east (+y) and south-east (+x).
    c, s = math.cos(mb['rot']), math.sin(mb['rot'])
    def at(lx, ly, w, d, roof):
        return {'cx': mb['cx'] + lx * c - ly * s, 'cy': mb['cy'] + lx * s + ly * c, 'w': w, 'd': d, 'rot': mb['rot'], 'h': A['height'], 'roof': roof}
    ne = at(0, mb['d'] / 2 + A['depth'] / 2 + 0.5, mb['w'], A['depth'], '#d9d7d0')
    se = at(mb['w'] / 2 + A['depth'] / 2 + 0.5, 0, A['depth'], mb['d'], H['upper'])
    for a, ramp in ((ne, None), (se, (0.6, -0.8))):
        sub = Building(B.name, a['cx'], a['cy'], a['rot'])
        office_block(B.name, a, ramp=ramp, abut=mb, B=sub)
        merge(B, sub)
    return B.finish()


def mess(M):
    B = None
    blocks = M['blocks'] + [M['plantRoom']]
    for k, b in enumerate(blocks):
        sub = Building(M['id'], b['cx'], b['cy'], b['rot'])
        pts = rect(b['w'], b['d'])
        h = b['h']
        plant = k == len(blocks) - 1  # the plant room rises out of the middle block
        for i in range(4):
            p0, p1 = pts[i], pts[(i + 1) % 4]
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            ops = []
            if not plant and i in (0, 2):  # white-framed windows, two rows on each long side, every 16 ft (as the code model)
                ops = [(u - 2.5, u + 2.5, zb, zb + 5, 'win') for u in range(10, int(L) - 7, 16) for zb in (5, 16)]
            wall(sub, p0, p1, 0, h, ops, lambda z: m('wall', M['wall']), framed=True)
        flat_roof(sub, pts, h, 'roof-membrane', b['roof'], parapet=1.5, coping=b.get('cap', '#c9c6bd'), wall_colour=M['wall'])
        if B is None:
            B = sub
        else:
            merge(B, sub)
    ch = M['chimney']
    sub = Building(M['id'], ch['x'], ch['y'], blocks[0]['rot'])
    sub.box((-ch['size'] / 2, -ch['size'] / 2, 0), (ch['size'], 0, 0), (0, ch['size'], 0), (0, 0, ch['height']), m('brick', '#8a4a32'))
    merge(B, sub)
    return B.finish()


def glass_palace(G):
    B = Building(G['id'], G['x'], G['y'], G.get('rotation', 0))
    # The curved front's inner edge, as the 3D view draws it (scenery3d.js createGlassPalace): Catmull-Rom through glassCurve.
    cp = G['glassCurve']
    def catmull(t):
        n = len(cp) - 1
        f = t * n
        i = min(int(f), n - 1)
        u = f - i
        p0, p1, p2, p3 = cp[max(0, i - 1)], cp[i], cp[i + 1], cp[min(n, i + 2)]
        return tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u ** 3) for k in (0, 1))
    outer = [catmull(i / 24) for i in range(25)]
    band = G['glassBand']['widthFt']
    inner = []
    for i, p in enumerate(outer):
        a, b = outer[max(0, i - 1)], outer[min(len(outer) - 1, i + 1)]
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        inner.append((p[0] + (b[1] - a[1]) / L * band, p[1] - (b[0] - a[0]) / L * band))
    main = [tuple(p) for p in G['footprint']] + inner
    h = G['height']
    nfp = len(G['footprint'])
    pts = ccw(main)
    flipped = pts is not main
    for i in range(len(pts)):
        p0, p1 = pts[i], pts[(i + 1) % len(pts)]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        # Edges along the glass (between inner points) stay plain; the rest get two storeys of windows.
        k = (len(pts) - 2 - i) % len(pts) if flipped else i  # the edge's number in the traced outline
        on_glass = k >= nfp - 1
        ops = [] if on_glass or L < 14 else windows(L, 5, 10, w=5, every=9, margin=5) + windows(L, 18, 23, w=5, every=9, margin=5)
        wall(B, p0, p1, 0, h, ops, lambda z: m('base', BASE) if z < 3 else m('wall', G['wall']))
    flat_roof(B, pts, h, 'roof-membrane', G['roof'], parapet=2.0, wall_colour=G['wall'])
    for wg in G['wings']:
        wp = ccw([tuple(p) for p in wg['footprint']])
        for i in range(len(wp)):
            p0, p1 = wp[i], wp[(i + 1) % len(wp)]
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            wall(B, p0, p1, 0, wg['height'], windows(L, 5, 10, w=5, every=9, margin=5) if L > 20 else [],
                 lambda z: m('base', BASE) if z < 3 else m('wall', G['wall']))
        flat_roof(B, wp, wg['height'], 'roof-membrane', G['roof'], parapet=2.0, wall_colour=G['wall'])
    return B.finish()


def tower(T):
    B = Building(T['id'], T['x'], T['y'], 0)
    SH, CAB = 140, 22
    def ring(r, z, k=8, off=math.pi / 8):
        return [(r * math.cos(off + 2 * math.pi * i / k), r * math.sin(off + 2 * math.pi * i / k), z) for i in range(k)]
    def band(r0, z0, r1, z1, mm, k=8):
        a, b = ring(r0, z0, k), ring(r1, z1, k)
        for i in range(k):
            j = (i + 1) % k
            B.poly([a[i], a[j], b[j], b[i]], mm)
    white = m('wall', '#f1f3f5')
    band(22, 0, 19, SH, white)
    # A slit of stair windows up the south face, recessed a little (glass set 0.4 ft in).
    for z in range(12, SH - 10, 12):
        B.box((-1.6, -19.9, z), (3.2, 0, 0), (0, 0.6, 0), (0, 0, 6), m('glass', GLASS))
    band(19, SH, 21, SH + 3, white)  # the cab's base ring
    band(21, SH + 3, 27, SH + 3 + 15, m('glass', '#4f86a8'))  # the cab glass, leaning out
    for p0, p1 in zip(ring(21.2, SH + 3), ring(27.2, SH + 18)):
        B.box((p0[0] - 0.4, p0[1] - 0.4, p0[2]), (p1[0] - p0[0], p1[1] - p0[1], 0), (0.8, 0, 0), (0, 0.8, 15), m('trim', '#d5d9dd'))  # mullions
    band(27, SH + 18, 29, SH + 18, white)
    band(29, SH + 18, 29, SH + 20.5, white)
    B.poly(ring(29, SH + 20.5)[::-1][::-1], white)
    # A catwalk round the cab foot with a rail, and the roof's rail.
    band(25, SH + 3, 21, SH + 3, m('dark', '#6b6f73'))  # the catwalk floor, facing up
    for r, z in ((25, SH + 3), (28.6, SH + 20.5)):
        for p in ring(r, z, 24, 0):
            B.box((p[0] - 0.15, p[1] - 0.15, z), (0.3, 0, 0), (0, 0.3, 0), (0, 0, 3.5), m('trim', '#d5d9dd'))
        band(r, z + 3.3, r, z + 3.6, m('trim', '#d5d9dd'), 24)
    # The mast with its red light, and two whips.
    B.box((-0.7, -0.7, SH + 20.5), (1.4, 0, 0), (0, 1.4, 0), (0, 0, 26), m('trim', '#e5e7eb'))
    B.box((-1.2, -1.2, SH + 46.5), (2.4, 0, 0), (0, 2.4, 0), (0, 0, 1.6), m('beacon', '#ff2a1a'))
    for x in (-12, 12):
        B.box((x - 0.2, 8 - 0.2, SH + 20.5), (0.4, 0, 0), (0, 0.4, 0), (0, 0, 14), m('dark', '#6b6f73'))
    # The office annex at its foot (white walls, dark blue roof).
    an = {'cx': 0, 'cy': 0, 'w': 68, 'd': 48, 'rot': 0, 'h': 22, 'roof': '#1e3a8a'}
    sub = Building(B.name, T['x'] + 38, T['y'] - 12, 0)
    office_block(B.name, an, ramp=(0, -1), B=sub)
    merge(B, sub)
    return B.finish()


objs = []
for H in spec['flatHangars']:
    objs.append(flat_hangar_full(H))
for H in spec['eastHangars']:
    objs.append(east_hangar(H, spec['eastAnnex'], spec['eastUpperFrom']))
objs.append(mess(spec['mess']))
objs.append(glass_palace(spec['glassPalace']))
objs.append(tower(spec['tower']))
for o in objs:
    print(o.name, len(o.data.polygons), 'faces', len(o.data.materials), 'materials')

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_materials='EXPORT', export_texcoords=True,
                          export_normals=True, use_selection=False, export_vertex_color='ACTIVE')
print('wrote', out)
