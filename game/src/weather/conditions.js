// Weather and time-of-day presets, the climates that decide which weather a track can have, and the
// random pick used by the World Race and by "Random" in Quick Race.
//
// A track opts into a climate with `climate: 'tropical'` in its data (or a `region` that maps to one, see
// REGION_CLIMATE). Snow and blizzards only ever come up in climates that list them.

// cloud: sky cover 0..1. rain / snow: precipitation 0..1. wet: how soaked the ground is. puddles: standing
// water on flat ground. cover: snow lying on the ground. fog: visibility, as a multiple of the clear-day
// fog density. grip: tyre grip on the track surface, 1 = dry. mud: extra grip lost off the track.
// wind: gust strength 0..1. lightning: strikes per minute.
export const WEATHERS = {
  clear: { label: 'Sunny', cloud: 0.12, rain: 0, snow: 0, wet: 0, puddles: 0, cover: 0, fog: 1, grip: 1, mud: 0, wind: 0.15, lightning: 0 },
  cloudy: { label: 'Overcast', cloud: 0.82, rain: 0, snow: 0, wet: 0.08, puddles: 0, cover: 0, fog: 1.6, grip: 0.99, mud: 0, wind: 0.3, lightning: 0 },
  lightrain: { label: 'Light rain', cloud: 0.78, rain: 0.28, snow: 0, wet: 0.55, puddles: 0.35, cover: 0, fog: 2.2, grip: 0.88, mud: 0.06, wind: 0.3, lightning: 0 },
  rain: { label: 'Rain', cloud: 0.9, rain: 0.6, snow: 0, wet: 0.85, puddles: 0.7, cover: 0, fog: 3.2, grip: 0.8, mud: 0.1, wind: 0.4, lightning: 0 },
  heavyrain: { label: 'Heavy rain', cloud: 0.97, rain: 1, snow: 0, wet: 1, puddles: 1, cover: 0, fog: 5, grip: 0.72, mud: 0.16, wind: 0.55, lightning: 0.6 },
  storm: { label: 'Thunderstorm', cloud: 1, rain: 0.9, snow: 0, wet: 1, puddles: 1, cover: 0, fog: 4.4, grip: 0.7, mud: 0.16, wind: 1, lightning: 7 },
  fog: { label: 'Fog', cloud: 0.7, rain: 0, snow: 0, wet: 0.3, puddles: 0.1, cover: 0, fog: 20, grip: 0.95, mud: 0.02, wind: 0.05, lightning: 0 },
  snow: { label: 'Snow', cloud: 0.88, rain: 0, snow: 0.6, wet: 0.2, puddles: 0, cover: 1, fog: 4, grip: 0.62, mud: 0.12, wind: 0.3, lightning: 0 },
  blizzard: { label: 'Blizzard', cloud: 1, rain: 0, snow: 1, wet: 0.2, puddles: 0, cover: 1, fog: 11, grip: 0.55, mud: 0.15, wind: 1, lightning: 0 },
};

// hour drives the sun; the rest is how each time of day looks
export const TIMES = {
  morning: { label: 'Morning', hour: 7.2 },
  day: { label: 'Midday', hour: 12.5 },
  evening: { label: 'Evening', hour: 18.3 },
  night: { label: 'Night', hour: 23.5 },
};

// weights for the random pick; a weather missing from a climate can never be picked or selected there
export const CLIMATES = {
  // the volcano: dry and ashy most of the time, with heavy tropical downpours; never snow
  volcanic: { weathers: { clear: 4, cloudy: 2, lightrain: 1.5, rain: 1.5, heavyrain: 1, storm: 1.2, fog: 1 }, times: { morning: 1, day: 2, evening: 1.2, night: 1 } },
  // Hawaiian-style islands: warm, showery trade winds, big afternoon storms; never snow
  tropical: { weathers: { clear: 4, cloudy: 1.5, lightrain: 2.5, rain: 1.6, heavyrain: 1, storm: 1.4, fog: 0.5 }, times: { morning: 1, day: 2, evening: 1.3, night: 1 } },
  temperate: { weathers: { clear: 3, cloudy: 2.5, lightrain: 2, rain: 1.5, heavyrain: 0.8, storm: 0.8, fog: 1.2 }, times: { morning: 1, day: 2, evening: 1, night: 1 } },
  desert: { weathers: { clear: 7, cloudy: 1.5, lightrain: 0.4, storm: 0.5, fog: 0.3 }, times: { morning: 1, day: 2, evening: 1.2, night: 1 } },
  // mountains and the far north: the only places it snows
  alpine: { weathers: { clear: 3, cloudy: 2, lightrain: 1, rain: 0.8, fog: 1.2, snow: 2.5, blizzard: 1 }, times: { morning: 1, day: 2, evening: 1, night: 1 } },
  arctic: { weathers: { clear: 2, cloudy: 2, fog: 1.2, snow: 4, blizzard: 2 }, times: { morning: 1, day: 2, evening: 1, night: 1 } },
};

export const REGION_CLIMATE = { volcano: 'volcanic', hawaii: 'tropical', hawaiian: 'tropical', island: 'tropical', desert: 'desert', canyon: 'desert', mesa: 'desert', alpine: 'alpine', mountain: 'alpine', snow: 'arctic', arctic: 'arctic', tundra: 'arctic', forest: 'temperate', bayou: 'temperate', swamp: 'temperate' };

// the climate a track races in; tracks without one are on the volcano map
export function climateOf(track) {
  const id = track?.climate || REGION_CLIMATE[track?.region] || 'volcanic';
  return CLIMATES[id] ? id : 'volcanic';
}

// what can be picked for a track, in display order
export function weathersFor(track) {
  const w = CLIMATES[climateOf(track)].weathers;
  return Object.keys(WEATHERS).filter((k) => w[k] > 0);
}
export function timesFor(track) {
  const t = CLIMATES[climateOf(track)].times;
  return Object.keys(TIMES).filter((k) => t[k] > 0);
}

function weighted(table, rnd) {
  const keys = Object.keys(table).filter((k) => table[k] > 0);
  let total = 0;
  for (const k of keys) total += table[k];
  let r = rnd() * total;
  for (const k of keys) { r -= table[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

// Turn a race's choice ('random' or a key, for each) into concrete conditions for the track. A weather the
// track's climate doesn't allow (snow on the volcano) falls back to a random allowed one.
export function resolveConditions(track, { weather = 'random', time = 'random' } = {}, rnd = Math.random) {
  const c = CLIMATES[climateOf(track)];
  const w = weather !== 'random' && c.weathers[weather] > 0 ? weather : weighted(c.weathers, rnd);
  const t = time !== 'random' && c.times[time] > 0 ? time : weighted(c.times, rnd);
  return { weather: w, time: t };
}

export function describe({ weather, time }) {
  return `${WEATHERS[weather]?.label ?? weather} · ${TIMES[time]?.label ?? time}`;
}
