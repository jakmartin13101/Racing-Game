// palikai: track set pieces (scenery built once per load) and race events (hazards). Filled in by the track work.
export async function buildScenery(ctx) {
  return {};
}

export class TrackEvents {
  constructor(hz) { this.hz = hz; }
  pre(dt, race) {}
  post(dt, race) {}
  dispose() {}
}
