import config from '../config.js';

// All free, no API key:
//  - Nominatim (OpenStreetMap) for geocoding / autocomplete
//  - OSRM public demo server for driving routes + distance/duration
// Node 18+ provides global fetch.

const headers = { 'User-Agent': config.geo.userAgent, 'Accept': 'application/json' };

/**
 * Forward geocode a free-text address -> list of {label, lat, lng}.
 */
export async function geocode(q, limit = 5) {
  if (!q || q.trim().length < 2) return [];
  const url = `${config.geo.nominatimUrl}/search?format=json&limit=${limit}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const data = await res.json();
  return data.map((d) => ({
    label: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    type: d.type,
  }));
}

/**
 * Reverse geocode coords -> address string.
 */
export async function reverseGeocode(lat, lng) {
  const url = `${config.geo.nominatimUrl}/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`reverse geocode failed: ${res.status}`);
  const data = await res.json();
  return data.display_name || null;
}

/**
 * Get a driving route between two points.
 * Returns { distanceKm, durationMinutes, geometry (GeoJSON coords), polyline }.
 */
export async function getRoute(pickup, destination) {
  const coords = `${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}`;
  const url = `${config.geo.osrmUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`route failed: ${res.status}`);
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('no route found');
  const route = data.routes[0];
  return {
    distanceKm: +(route.distance / 1000).toFixed(2),
    durationMinutes: Math.round(route.duration / 60),
    geometry: route.geometry, // GeoJSON LineString {type, coordinates:[[lng,lat],...]}
  };
}

/**
 * Haversine distance in km (fallback when OSRM unavailable).
 */
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return +(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))).toFixed(2);
}
