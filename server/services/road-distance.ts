import { calculateDistanceKm } from './route-optimizer';

export interface LatLng {
  lat: number;
  lng: number;
}

export type DistanceSource = 'road' | 'straight';

export interface DistanceMatrixResult {
  matrix: number[][];
  source: DistanceSource;
}

const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';
const TIMEOUT_MS = 8000;
const MAX_POINTS = 100;
const MAX_CACHE = 50;

const cache = new Map<string, number[][]>();

export function straightLineMatrix(points: LatLng[]): number[][] {
  return points.map((a) => points.map((b) => calculateDistanceKm(a.lat, a.lng, b.lat, b.lng)));
}

export async function getRoadDistanceMatrix(points: LatLng[]): Promise<DistanceMatrixResult> {
  const fallback = (): DistanceMatrixResult => ({ matrix: straightLineMatrix(points), source: 'straight' });

  if (process.env.ROAD_DISTANCE === 'off') return fallback();
  if (points.length < 2 || points.length > MAX_POINTS) return fallback();

  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const cached = cache.get(coords);
  if (cached) return { matrix: cached, source: 'road' };

  const baseUrl = (process.env.OSRM_URL || DEFAULT_OSRM_URL).replace(/\/+$/, '');
  const url = `${baseUrl}/table/v1/driving/${coords}?annotations=distance`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = (await res.json()) as { code?: string; distances?: (number | null)[][] };
    if (data.code !== 'Ok' || !Array.isArray(data.distances) || data.distances.length !== points.length) {
      throw new Error(`OSRM response code ${data.code}`);
    }

    let complete = true;
    const matrix = points.map((_, i) =>
      points.map((_, j) => {
        if (i === j) return 0;
        const meters = data.distances![i]?.[j];
        if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
          complete = false;
          return 0;
        }
        return Number((meters / 1000).toFixed(2));
      })
    );

    if (!complete) return fallback();
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(coords, matrix);
    return { matrix, source: 'road' };
  } catch (err) {
    console.warn('[road-distance] ใช้ระยะเส้นตรงแทน:', (err as Error).message);
    return fallback();
  }
}
