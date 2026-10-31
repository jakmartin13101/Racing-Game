// Each region is its own baked world (heightmap, masks and tracks). Only one is loaded at a time: picking a track
// in another region reloads the page into that region, carrying the race setup across in sessionStorage.
const BASE = import.meta.env.BASE_URL;

export const REGIONS = [
  { id: 'volcano', name: 'Volcano', dir: 'world', loading: 'LOADING VOLCANIC REGION…' },
  { id: 'kaiele', name: "Kai'ele", dir: 'world/kaiele', loading: "LOADING KAI'ELE…" },
];
export const regionById = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0];

const PENDING = 'gravel-riot-pending-race';
const LAST = 'gravel-riot-region';
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();

// every region's track list, for the menus (the track files are small; heightmaps load only for the active region)
export async function loadTrackIndex() {
  const lists = await Promise.all(REGIONS.map(async (r) => {
    try {
      const d = await fetch(`${BASE}${r.dir}/track.json`).then((x) => x.json());
      return d.tracks.map((t) => ({ id: t.id, name: t.name, closed: t.closed, laps: t.laps, region: r.id, c: t.centre, n: t.centre.length }));
    } catch { return []; }
  }));
  return lists.flat();
}

// which region to boot: ?region=, the region of ?race=, a race carried across a reload, or the last one used
export function pickRegion(params, index) {
  let pending = null;
  try { pending = JSON.parse(store?.getItem(PENDING) || 'null'); store?.removeItem(PENDING); } catch { pending = null; }
  const ofTrack = (id) => index.find((t) => t.id === id)?.region;
  const id = params.get('region') || (params.has('race') && ofTrack(params.get('race'))) || (pending && ofTrack(pending.track))
    || store?.getItem(LAST) || 'volcano';
  const region = regionById(id);
  try { store?.setItem(LAST, region.id); } catch { /* private mode */ }
  return { region, pending: pending && ofTrack(pending.track) === region.id ? pending : null };
}

// start a race in another region: remember the setup and reload into it
export function switchRegion(cfg, regionId) {
  try { store?.setItem(PENDING, JSON.stringify(cfg)); store?.setItem(LAST, regionId); } catch { /* private mode */ }
  const p = new URLSearchParams(location.search);
  p.delete('race'); p.set('region', regionId);
  location.search = p.toString();
}
