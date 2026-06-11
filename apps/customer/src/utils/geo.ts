import { GOOGLE_MAPS_API_KEY } from "../config";

/** Great-circle distance in meters (WGS84 approximate). Used for sorting & geofence. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ─── Google Maps Distance Matrix API ────────────────────────────────────────

export type MapsDistanceResult = {
  /** Driving distance text, e.g. "3.8 km" */
  distanceText: string;
  /** Driving distance in meters */
  distanceMeters: number;
  /** Driving duration text, e.g. "8 mins" */
  durationText: string;
  /** Driving duration in seconds */
  durationSeconds: number;
};

/** Prefer Google driving distance (meters) for sorting; fall back to Haversine straight-line. */
export function effectiveDistanceSortMeters(
  maps: MapsDistanceResult | undefined | null,
  haversineMeters: number | null,
): number | null {
  if (maps != null && typeof maps.distanceMeters === "number") return maps.distanceMeters;
  return haversineMeters;
}

/**
 * List-card label: driving distance + duration when Maps returned a row;
 * otherwise straight-line Haversine (same as before Maps loads or without API key).
 */
export function formatBranchTravelLabel(
  maps: MapsDistanceResult | undefined | null,
  haversineMeters: number | null,
  opts?: { noCoordsLabel?: string },
): string {
  const noCoords = opts?.noCoordsLabel ?? "—";
  if (maps != null && maps.distanceText?.length) {
    return maps.durationText?.length ? `${maps.distanceText} · ${maps.durationText}` : maps.distanceText;
  }
  if (haversineMeters != null) return formatDistance(haversineMeters);
  return noCoords;
}

/** In-memory cache to avoid repeated API calls for the same origin→destination. */
const distanceCache = new Map<string, MapsDistanceResult>();

function cacheKey(oLat: number, oLng: number, dLat: number, dLng: number): string {
  // Round to ~100m precision for cache hits when user position jitters slightly
  const r = (n: number) => n.toFixed(3);
  return `${r(oLat)},${r(oLng)}→${r(dLat)},${r(dLng)}`;
}

/**
 * Fetch driving distance & duration from Google Maps Distance Matrix API.
 * Returns null if API key is missing or the request fails.
 */
export async function fetchMapsDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<MapsDistanceResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const key = cacheKey(originLat, originLng, destLat, destLng);
  const cached = distanceCache.get(key);
  if (cached) return cached;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${originLat},${originLng}` +
      `&destinations=${destLat},${destLng}` +
      `&mode=driving` +
      `&key=${GOOGLE_MAPS_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    const element = data?.rows?.[0]?.elements?.[0];
    if (element?.status !== "OK") return null;

    const result: MapsDistanceResult = {
      distanceText: element.distance.text,
      distanceMeters: element.distance.value,
      durationText: element.duration.text,
      durationSeconds: element.duration.value,
    };

    distanceCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch driving distances for multiple destinations from one origin.
 * Google allows up to 25 destinations per request.
 * Returns a Map keyed by `${destLat},${destLng}` (rounded to 3 decimals).
 */
export async function fetchMapsDistanceBatch(
  originLat: number,
  originLng: number,
  destinations: { lat: number; lng: number; id: string }[],
): Promise<Map<string, MapsDistanceResult>> {
  const results = new Map<string, MapsDistanceResult>();
  if (!GOOGLE_MAPS_API_KEY || destinations.length === 0) return results;

  // Separate cached vs uncached
  const uncached: typeof destinations = [];
  for (const dest of destinations) {
    const key = cacheKey(originLat, originLng, dest.lat, dest.lng);
    const cached = distanceCache.get(key);
    if (cached) {
      results.set(dest.id, cached);
    } else {
      uncached.push(dest);
    }
  }

  if (uncached.length === 0) return results;

  // Batch in chunks of 25 (API limit)
  const CHUNK_SIZE = 25;
  for (let i = 0; i < uncached.length; i += CHUNK_SIZE) {
    const chunk = uncached.slice(i, i + CHUNK_SIZE);
    const destsParam = chunk.map((d) => `${d.lat},${d.lng}`).join("|");

    try {
      const url =
        `https://maps.googleapis.com/maps/api/distancematrix/json` +
        `?origins=${originLat},${originLng}` +
        `&destinations=${destsParam}` +
        `&mode=driving` +
        `&key=${GOOGLE_MAPS_API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();

      const elements = data?.rows?.[0]?.elements;
      if (!Array.isArray(elements)) continue;

      for (let j = 0; j < chunk.length; j++) {
        const el = elements[j];
        if (el?.status !== "OK") continue;

        const result: MapsDistanceResult = {
          distanceText: el.distance.text,
          distanceMeters: el.distance.value,
          durationText: el.duration.text,
          durationSeconds: el.duration.value,
        };

        const dest = chunk[j];
        const key = cacheKey(originLat, originLng, dest.lat, dest.lng);
        distanceCache.set(key, result);
        results.set(dest.id, result);
      }
    } catch {
      // Silently fail — fallback to Haversine display
    }
  }

  return results;
}
