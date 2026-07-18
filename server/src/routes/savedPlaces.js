import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireEmployee);

router.get('/', asyncHandler(async (req, res) => {
  const rows = (await query(
    `SELECT * FROM saved_places WHERE organization_id = $1 AND employee_id = $2 ORDER BY created_at DESC`,
    [req.auth.orgId, req.auth.employeeId]
  )).rows;
  res.json({ places: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { label, addressText, latitude, longitude } = req.body || {};
  if (!label || !addressText || latitude == null || longitude == null) {
    throw badRequest('label, addressText, latitude and longitude are required');
  }
  const row = (await query(
    `INSERT INTO saved_places (organization_id, employee_id, label, address_text, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.auth.orgId, req.auth.employeeId, label, addressText, latitude, longitude]
  )).rows[0];
  res.status(201).json({ place: row });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const row = (await query(
    `DELETE FROM saved_places WHERE place_id = $1 AND organization_id = $2 AND employee_id = $3 RETURNING place_id`,
    [req.params.id, req.auth.orgId, req.auth.employeeId]
  )).rows[0];
  if (!row) throw notFound('Place not found');
  res.json({ ok: true });
}));

export default router;
