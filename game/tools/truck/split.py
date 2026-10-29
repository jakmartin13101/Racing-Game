"""Split the truck body into the parts that can break off in crashes.

Runs on public/models/truck.glb and truck_lod.glb after bake.py / lod.py. Loose pieces (bumpers, mirrors,
light bar, spare tyres) are picked by the bounding box of each welded island; the door skins and the bonnet
are cut out of the shell by triangle position and facing. Each part becomes its own node, `part_<name>`,
with compacted vertex data. Nodes that are not body/lights pass through, so the script is idempotent.

    python tools/truck/split.py
"""
import json, os, struct, sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models')


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    return j, b[28 + jl:28 + jl + bl]


def accessor(j, binb, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    arr = np.frombuffer(binb, dt, a['count'] * n, off)
    return arr.reshape(-1, n).copy() if n > 1 else arr.astype(np.uint32)


class Writer:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []

    def add(self, arr, target=None):
        arr = np.ascontiguousarray(arr)
        while len(self.bin) % 4: self.bin.append(0)
        off = len(self.bin); self.bin += arr.tobytes()
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes}
        if target: v['target'] = target
        self.views.append(v)
        if arr.dtype == np.uint32:
            a = {'componentType': 5125, 'type': 'SCALAR', 'count': len(arr)}
        else:
            n = arr.shape[1]
            a = {'componentType': 5126, 'type': {2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[n], 'count': len(arr)}
            if n == 3: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        a['bufferView'] = len(self.views) - 1
        self.acc.append(a)
        return len(self.acc) - 1


def islands(P, I):
    q = np.round(P / 1e-4).astype(np.int64)
    _, weld = np.unique(q, axis=0, return_inverse=True)
    weld = weld.ravel()
    e = weld[np.concatenate([I[:, [0, 1]], I[:, [1, 2]]])]
    n = weld.max() + 1
    k, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)
    return k, lab[weld[I[:, 0]]]


def classify(P, I, mesh_name):
    """Part label per triangle ('' = stays on the body)."""
    tri = P[I]
    cen = tri.mean(1)
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
    lab = np.array([''] * len(I), dtype=object)
    if mesh_name == 'lights':
        lab[cen[:, 1] > 0.95] = 'lightbar'
        return lab
    k, tl = islands(P, I)
    big = np.bincount(tl).argsort()[::-1][:2]  # lower shell and cab
    for c in range(k):
        m = tl == c
        if c in big: continue
        p = tri[m].reshape(-1, 3)
        lo, hi = p.min(0), p.max(0); mid = (lo + hi) / 2
        if mid[2] > 2.3 and mid[1] < 0.2 and abs(mid[0]) < 1.0: lab[m] = 'bumper_f'
        elif mid[2] < -2.45 and mid[1] < 0.1 and hi[0] - lo[0] > 1.0: lab[m] = 'bumper_r'
        elif abs(mid[0]) > 1.0 and 0.35 < mid[1] < 0.65 and 0.7 < mid[2] < 1.0: lab[m] = 'mirror_l' if mid[0] > 0 else 'mirror_r'
        elif mid[1] > 0.95 and -0.1 < mid[2] < 0.6: lab[m] = 'lightbar'
        elif abs(mid[0]) < 0.55 and -2.2 < mid[2] < -1.05 and -0.06 < mid[1] < 0.8 and hi[1] - lo[1] < 0.5:
            lab[m] = 'spare_a' if mid[1] < 0.34 else 'spare_b'
        elif abs(mid[0]) > 0.95 and -0.3 < mid[1] < 0.1 and -0.4 < mid[2] < 1.0: lab[m] = 'door_l' if mid[0] > 0 else 'door_r'  # handles
    shell = np.isin(tl, big)
    # door skins: outward-facing side panels between the wheel arches, below the window line
    door = shell & (np.abs(cen[:, 0]) > 0.8) & (np.abs(nrm[:, 0]) > 0.55) & (np.sign(nrm[:, 0]) == np.sign(cen[:, 0])) \
        & (cen[:, 2] > -0.36) & (cen[:, 2] < 0.92) & (cen[:, 1] > -0.12) & (cen[:, 1] < 0.44)
    lab[door & (cen[:, 0] > 0)] = 'door_l'
    lab[door & (cen[:, 0] < 0)] = 'door_r'
    # bonnet: upward-facing skin ahead of the windscreen
    hood = shell & (cen[:, 2] > 1.02) & (cen[:, 2] < 2.3) & (np.abs(cen[:, 0]) < 0.84) & (nrm[:, 1] > 0.5) & (cen[:, 1] > 0.15)
    lab[hood] = 'hood'
    return lab


def split(path):
    j, binb = read_glb(path)
    W = Writer()
    new_meshes, new_nodes = [], []
    parts = {}  # name -> list of primitives

    def emit(prim, P_attrs, idx):
        used, inv = np.unique(idx, return_inverse=True)
        attrs = {}
        for key, arr in P_attrs.items():
            attrs[key] = W.add(arr[used].astype(np.float32), 34962)
        out = {'attributes': attrs, 'indices': W.add(inv.astype(np.uint32), 34963), 'material': prim['material']}
        return out

    for node in j['nodes']:
        mesh = j['meshes'][node['mesh']]
        prims = []
        for prim in mesh['primitives']:
            A = {k: accessor(j, binb, v) for k, v in prim['attributes'].items()}
            I = accessor(j, binb, prim['indices']).reshape(-1, 3)
            if node['name'] in ('body', 'lights'):
                lab = classify(A['POSITION'], I, node['name'])
                keep = lab == ''
                prims.append(emit(prim, A, I[keep].ravel()))
                for name in sorted(set(lab[~keep])):
                    parts.setdefault(name, []).append(emit(prim, A, I[lab == name].ravel()))
            else:
                prims.append(emit(prim, A, I.ravel()))
        new_meshes.append({'name': mesh['name'], 'primitives': prims})
        nn = {k: v for k, v in node.items() if k != 'mesh'}; nn['mesh'] = len(new_meshes) - 1
        new_nodes.append(nn)
    for name, prims in sorted(parts.items()):
        new_meshes.append({'name': f'part_{name}', 'primitives': prims})
        new_nodes.append({'name': f'part_{name}', 'mesh': len(new_meshes) - 1})
        print(os.path.basename(path), name, sum(W.acc[p['indices']]['count'] for p in prims) // 3, 'tris')
    out = {k: v for k, v in j.items() if k not in ('accessors', 'bufferViews', 'buffers', 'meshes', 'nodes', 'scenes')}
    out.update(accessors=W.acc, bufferViews=W.views, buffers=[{'byteLength': len(W.bin)}], meshes=new_meshes, nodes=new_nodes,
               scenes=[{'name': 'Scene', 'nodes': list(range(len(new_nodes)))}], scene=0)
    js = json.dumps(out, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    while len(W.bin) % 4: W.bin.append(0)
    total = 12 + 8 + len(js) + 8 + len(W.bin)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(W.bin), b'BIN\x00')); f.write(W.bin)


if __name__ == '__main__':
    for f in sys.argv[1:] or ['truck.glb', 'truck_lod.glb']:
        split(os.path.join(ROOT, f))
