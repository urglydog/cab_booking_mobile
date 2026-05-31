/**
 * mapService.ts — Mapbox Directions and Route Utilities
 */

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_API_KEY || '';

/**
 * Generates an S-curve route between start and end using Perpendicular Vector & Sine wave.
 * This is used as a fallback if Mapbox Directions API is unavailable.
 */
export const generateRouteCoords = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
): Array<{ latitude: number; longitude: number }> => {
  const coords = [start];
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;

  // Perpendicular normal vector of the segment
  const perpLat = -dLng;
  const perpLng = dLat;

  const numSteps = 8;
  for (let i = 1; i < numSteps; i++) {
    const ratio = i / numSteps;
    const lat = start.latitude + dLat * ratio;
    const lng = start.longitude + dLng * ratio;

    // Multi-frequency wave using sine to create an elegant curved S-route
    const wave = Math.sin(ratio * Math.PI * 2);

    // Perpendicular offset scaled to 24% of distance for natural curve
    const offsetScale = 0.24;
    const latOffset = perpLat * wave * offsetScale;
    const lngOffset = perpLng * wave * offsetScale;

    coords.push({
      latitude: lat + latOffset,
      longitude: lng + lngOffset,
    });
  }
  coords.push(end);
  return coords;
};

/**
 * Fetches real driving route coordinates from Mapbox Directions API.
 * Falls back to generateRouteCoords if there is no token, API fails, or returns no routes.
 */
export async function fetchRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<Array<{ latitude: number; longitude: number }>> {
  if (!MAPBOX_TOKEN) {
    console.warn('[Route] No EXPO_PUBLIC_MAPBOX_API_KEY — falling back to generated route');
    return generateRouteCoords(from, to);
  }

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.routes && json.routes.length > 0) {
      const coords = json.routes[0].geometry.coordinates.map((c: number[]) => ({
        latitude: c[1],
        longitude: c[0],
      }));
      console.log('[Route] fetched', coords.length, 'points from Mapbox Directions');
      return coords;
    }
    console.warn('[Route] No routes found in Mapbox response — falling back to generated route');
    return generateRouteCoords(from, to);
  } catch (err) {
    console.warn('[Route] Mapbox Directions fetch failed — falling back to generated route:', err);
    return generateRouteCoords(from, to);
  }
}
