// Surfaces on Kai'ele, by the per-row ids the island bake writes (track.surf; ids in world.data.surfaces).
// grip scales the tyres' friction, drag (N per m/s) slows the wheels like soft ground, dust is the colour kicked up.
export const SURFACES = {
  0: { name: 'coral gravel', grip: 0.96, drag: 0, dust: [0.78, 0.74, 0.66] },
  1: { name: 'dry sand', grip: 0.82, drag: 900, dust: [0.2, 0.19, 0.18] },
  2: { name: 'wet sand', grip: 0.88, drag: 500, dust: [0.12, 0.11, 0.1] },
  3: { name: 'lava rock', grip: 1.0, drag: 0, dust: [0.25, 0.24, 0.23] },
  4: { name: 'red dirt', grip: 0.9, drag: 150, dust: [0.55, 0.27, 0.16] },
  5: { name: 'mud', grip: 0.72, drag: 1400, dust: [0.3, 0.18, 0.12] },
  6: { name: 'wet rock', grip: 0.78, drag: 0, dust: [0.3, 0.3, 0.3] },
  7: { name: 'timber', grip: 0.92, drag: 0, dust: [0.4, 0.32, 0.22] },
  8: { name: 'grass', grip: 0.86, drag: 250, dust: [0.36, 0.42, 0.22] },
  9: { name: 'wet reef', grip: 0.74, drag: 200, dust: [0.6, 0.62, 0.6] },
  10: { name: 'white sand', grip: 0.82, drag: 900, dust: [0.86, 0.82, 0.72] },
  11: { name: 'asphalt', grip: 1.05, drag: 0, dust: [0.3, 0.3, 0.3] },
};
export const surfaceAt = (track, i) => SURFACES[track.surf?.[track.wrap(i)] ?? 0] || SURFACES[0];
