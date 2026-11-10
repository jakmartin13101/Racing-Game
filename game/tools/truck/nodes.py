"""Tiny DSL for building Cycles shader graphs from Python."""
import bpy


class NB:
    def __init__(self, mat):
        mat.use_nodes = True
        self.mat = mat
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.output = self.new('ShaderNodeOutputMaterial')
        self.tc = self.new('ShaderNodeTexCoord')
        self.geom = self.new('ShaderNodeNewGeometry')
        self._sep = None

    def new(self, t, **props):
        n = self.nt.nodes.new(t)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        elif v is not None:
            sock.default_value = v

    # -------------------------------------------------- coordinates
    @property
    def obj(self):
        return self.tc.outputs['Object']

    @property
    def onormal(self):
        return self.tc.outputs['Normal']

    def xyz(self, vec=None):
        n = self.new('ShaderNodeSeparateXYZ')
        self.set(n.inputs[0], vec if vec is not None else self.obj)
        return n.outputs['X'], n.outputs['Y'], n.outputs['Z']

    def vec(self, x, y, z):
        n = self.new('ShaderNodeCombineXYZ')
        self.set(n.inputs[0], x); self.set(n.inputs[1], y); self.set(n.inputs[2], z)
        return n.outputs[0]

    def vscale(self, v, s):
        n = self.new('ShaderNodeVectorMath', operation='SCALE')
        self.set(n.inputs[0], v)
        self.set(n.inputs['Scale'], s)
        return n.outputs[0]

    def vmul(self, v, s3):
        n = self.new('ShaderNodeVectorMath', operation='MULTIPLY')
        self.set(n.inputs[0], v)
        self.set(n.inputs[1], s3)
        return n.outputs[0]

    def vadd(self, v, o):
        n = self.new('ShaderNodeVectorMath', operation='ADD')
        self.set(n.inputs[0], v)
        self.set(n.inputs[1], o)
        return n.outputs[0]

    # -------------------------------------------------- math
    def math(self, op, a, b=0.0, clamp=False):
        n = self.new('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs[0]

    def mul(self, a, b, clamp=False): return self.math('MULTIPLY', a, b, clamp)
    def add(self, a, b, clamp=False): return self.math('ADD', a, b, clamp)
    def sub(self, a, b, clamp=False): return self.math('SUBTRACT', a, b, clamp)
    def inv(self, a): return self.math('SUBTRACT', 1.0, a, True)
    def absf(self, a): return self.math('ABSOLUTE', a)
    def maxf(self, a, b): return self.math('MAXIMUM', a, b)
    def minf(self, a, b): return self.math('MINIMUM', a, b)
    def gt(self, a, b): return self.math('GREATER_THAN', a, b)
    def lt(self, a, b): return self.math('LESS_THAN', a, b)
    def powf(self, a, b): return self.math('POWER', a, b)
    def clamp01(self, a): return self.math('ADD', a, 0.0, True)

    def ss(self, a, b, x):
        n = self.new('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        self.set(n.inputs['Value'], x)
        self.set(n.inputs['From Min'], a)
        self.set(n.inputs['From Max'], b)
        return n.outputs[0]

    def remap(self, x, a, b, c=0.0, d=1.0, clamp=True):
        n = self.new('ShaderNodeMapRange', clamp=clamp)
        self.set(n.inputs['Value'], x)
        self.set(n.inputs['From Min'], a); self.set(n.inputs['From Max'], b)
        self.set(n.inputs['To Min'], c); self.set(n.inputs['To Max'], d)
        return n.outputs[0]

    def mixf(self, f, a, b):
        n = self.new('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self.set(n.inputs['Factor'], f)
        self.set(n.inputs[2], a)
        self.set(n.inputs[3], b)
        return n.outputs[0]

    def mixc(self, f, a, b, blend='MIX'):
        n = self.new('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True)
        self.set(n.inputs['Factor'], f)
        self.set(n.inputs[6], a if isinstance(a, bpy.types.NodeSocket) else (*a, 1.0) if len(a) == 3 else a)
        self.set(n.inputs[7], b if isinstance(b, bpy.types.NodeSocket) else (*b, 1.0) if len(b) == 3 else b)
        return n.outputs[2]

    def rgb(self, c):
        n = self.new('ShaderNodeRGB')
        n.outputs[0].default_value = (*c, 1.0)
        return n.outputs[0]

    def bw(self, c):
        n = self.new('ShaderNodeRGBToBW')
        self.set(n.inputs[0], c)
        return n.outputs[0]

    def hsv(self, c, h=0.5, s=1.0, v=1.0):
        n = self.new('ShaderNodeHueSaturation')
        self.set(n.inputs['Color'], c)
        self.set(n.inputs['Hue'], h); self.set(n.inputs['Saturation'], s); self.set(n.inputs['Value'], v)
        return n.outputs[0]

    # -------------------------------------------------- textures
    def noise(self, scale, detail=6.0, rough=0.55, distortion=0.0, vec=None, dims='3D', color=False):
        n = self.new('ShaderNodeTexNoise', noise_dimensions=dims)
        self.set(n.inputs['Vector'], vec if vec is not None else self.obj)
        self.set(n.inputs['Scale'], scale)
        self.set(n.inputs['Detail'], detail)
        self.set(n.inputs['Roughness'], rough)
        self.set(n.inputs['Distortion'], distortion)
        return n.outputs[1] if color else n.outputs[0]

    def voronoi(self, scale, vec=None, feature='F1', rnd=1.0):
        n = self.new('ShaderNodeTexVoronoi', feature=feature)
        self.set(n.inputs['Vector'], vec if vec is not None else self.obj)
        self.set(n.inputs['Scale'], scale)
        self.set(n.inputs['Randomness'], rnd)
        return n.outputs['Distance']

    def wave(self, scale, distortion=4.0, vec=None, bands='BANDS', direction='X'):
        n = self.new('ShaderNodeTexWave', wave_type=bands, bands_direction=direction)
        self.set(n.inputs['Vector'], vec if vec is not None else self.obj)
        self.set(n.inputs['Scale'], scale)
        self.set(n.inputs['Distortion'], distortion)
        self.set(n.inputs['Detail'], 4.0)
        return n.outputs['Factor']

    def image(self, path, vec=None, box=True, scale=1.0, clip=False, noncolor=False, blend=0.25):
        img = bpy.data.images.load(path, check_existing=True)
        if noncolor:
            img.colorspace_settings.name = 'Non-Color'
        n = self.new('ShaderNodeTexImage', image=img)
        if box:
            n.projection = 'BOX'
            n.projection_blend = blend
        if clip:
            n.extension = 'CLIP'
        v = vec if vec is not None else self.vscale(self.obj, scale)
        self.set(n.inputs['Vector'], v)
        return n.outputs['Color'], n.outputs['Alpha']

    # -------------------------------------------------- masks
    def edge(self, radius=0.012, lo=0.004, hi=0.05):
        b = self.new('ShaderNodeBevel', samples=8)
        self.set(b.inputs['Radius'], radius)
        d = self.new('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        self.set(d.inputs[0], b.outputs['Normal'])
        self.set(d.inputs[1], self.geom.outputs['Normal'])
        e = self.inv(d.outputs['Value'])
        return self.ss(lo, hi, e), b.outputs['Normal']

    def ao(self, dist=0.25, only_local=True):
        n = self.new('ShaderNodeAmbientOcclusion', samples=12, only_local=only_local)
        self.set(n.inputs['Distance'], dist)
        return n.outputs['AO']

    def bump(self, height, strength=0.4, distance=0.003, normal=None):
        n = self.new('ShaderNodeBump')
        self.set(n.inputs['Height'], height)
        self.set(n.inputs['Strength'], strength)
        self.set(n.inputs['Distance'], distance)
        if normal is not None:
            self.set(n.inputs['Normal'], normal)
        return n.outputs['Normal']

    def principled(self, color, rough, metal=0.0, normal=None):
        p = self.new('ShaderNodeBsdfPrincipled')
        self.set(p.inputs['Base Color'], color)
        self.set(p.inputs['Roughness'], rough)
        self.set(p.inputs['Metallic'], metal)
        if normal is not None:
            self.set(p.inputs['Normal'], normal)
        self.nt.links.new(p.outputs[0], self.output.inputs['Surface'])
        self.bsdf = p
        return p
