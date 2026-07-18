import { Router } from 'express';
import { geocode, reverseGeocode, getRoute, haversineKm } from '../utils/geo.js';
import { asyncHandler, badRequest } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/** GET /api/geo/search?q=... — address autocomplete (Nominatim). */
router.get('/search', asyncHandler(async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ results: [] });
  res.json({ results: await geocode(String(q)) });
}));

/** GET /api/geo/reverse?lat=&lng= */
router.get('/reverse', asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (lat == null || lng == null) throw badRequest('lat and lng required');
  res.json({ address: await reverseGeocode(lat, lng) });
}));

/** POST /api/geo/route — { pickup:{lat,lng}, destination:{lat,lng} } (OSRM). */
router.post('/route', asyncHandler(async (req, res) => {
  const { pickup, destination } = req.body || {};
  if (!pickup?.lat || !destination?.lat) throw badRequest('pickup and destination coords required');
  try {
    const route = await getRoute(pickup, destination);
    res.json(route);
  } catch {
    // fallback to straight-line estimate if OSRM demo server is down
    const distanceKm = haversineKm(pickup, destination);
    res.json({ distanceKm, durationMinutes: Math.round((distanceKm / 30) * 60), geometry: null, fallback: true });
  }
}));

export default router;
