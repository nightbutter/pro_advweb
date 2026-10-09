// Geographic helpers for radius searches (HW-5 requirement)

/**
 * Haversine distance in meters between two lat/lng points.
 * Unrounded — callers decide display rounding so boundary
 * comparisons (e.g. <= 1000 m) stay exact.
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True when the value is a usable coordinate component (number or numeric string). */
export function isFiniteNumber(v: unknown): v is number | string {
  return v !== null && v !== undefined && Number.isFinite(Number(v));
}

/**
 * Parse and validate `?lat=&lng=` query params.
 * Returns { lat, lng } or null when missing/invalid.
 * lat ∈ [-90, 90], lng ∈ [-180, 180].
 */
export function parseLatLng(
  lat: unknown,
  lng: unknown
): { lat: number; lng: number } | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

/** Whitelisted radius values accepted by /nearby endpoints, in kilometers. */
export const ALLOWED_RADIUS_KM = [0.5, 1, 2, 3, 5, 10];

/**
 * Resolve the search radius in meters from query params.
 * - `radiusKm` (km) takes priority and must be one of ALLOWED_RADIUS_KM -> else 400.
 * - `radius` (meters, any positive number) is kept for backward compatibility.
 * - Neither provided -> `defaultMeters`.
 */
export function resolveRadiusMeters(
  query: { radiusKm?: unknown; radius?: unknown },
  defaultMeters: number
): { radiusMeters: number } | { error: string } {
  if (query.radiusKm !== undefined) {
    const km = Number(query.radiusKm);
    if (!ALLOWED_RADIUS_KM.includes(km)) {
      return { error: `radiusKm must be one of: ${ALLOWED_RADIUS_KM.join(', ')}` };
    }
    return { radiusMeters: km * 1000 };
  }
  if (query.radius !== undefined) {
    const r = Number(query.radius);
    if (!Number.isFinite(r) || r <= 0) {
      return { error: 'radius must be a positive number (meters)' };
    }
    return { radiusMeters: r };
  }
  return { radiusMeters: defaultMeters };
}
