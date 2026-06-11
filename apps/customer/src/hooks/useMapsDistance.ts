import { useEffect, useState } from "react";
import type { BranchDto } from "../api";
import { fetchMapsDistanceBatch, type MapsDistanceResult } from "../utils/geo";

/**
 * Hook that fetches Google Maps driving distance for a list of branches.
 * Falls back gracefully — if API key is missing or request fails, returns empty map.
 */
export function useMapsDistance(
  userCoords: { latitude: number; longitude: number } | null,
  branches: BranchDto[],
) {
  const [distances, setDistances] = useState<Map<string, MapsDistanceResult>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userCoords || branches.length === 0) {
      setDistances(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);

    const destinations = branches.map((b) => ({
      lat: b.latitude,
      lng: b.longitude,
      id: b.id,
    }));

    fetchMapsDistanceBatch(userCoords.latitude, userCoords.longitude, destinations)
      .then((result) => {
        if (!cancelled) setDistances(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userCoords?.latitude, userCoords?.longitude, branches]);

  return { distances, loading };
}
