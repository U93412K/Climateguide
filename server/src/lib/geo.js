const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Road distance is longer than the straight line; this is a standard circuity factor. */
export const ROAD_CIRCUITY = 1.3;
export const FERRY_CIRCUITY = 1.15;

export const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));

export const round = (x, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export const isFiniteNumber = (x) => typeof x === 'number' && Number.isFinite(x);

export const isValidPoint = (p) =>
  !!p && isFiniteNumber(p.lat) && isFiniteNumber(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
