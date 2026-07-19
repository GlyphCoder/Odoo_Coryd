import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import { createSignedUploadUrl, getPublicUrl } from '../utils/supabaseStorage.js';

const router = Router();
router.use(requireAuth, requireEmployee);

// ── Document field names expected in both upload-urls and POST ──────────────
const DOC_FIELDS = [
  'driving_license',
  'vehicle_rc',
  'proof_of_insurance',
  'vehicle_photo',
  'driver_selfie',
];

/**
 * POST /api/vehicles/upload-urls
 * Body: { fileExts: { driving_license: 'jpg', vehicle_rc: 'pdf', ... } }
 *
 * Returns signed upload URLs (valid 5 min) for each document.
 * The browser then PUTs each file directly to Supabase Storage.
 * After all uploads succeed, the client POSTs /api/vehicles with the public URLs.
 */
router.post('/upload-urls', asyncHandler(async (req, res) => {
  const { fileExts = {} } = req.body || {};
  const orgId      = req.auth.orgId;
  const employeeId = req.auth.employeeId;

  const urls = {};
  const paths = {};

  for (const field of DOC_FIELDS) {
    const ext  = (fileExts[field] || 'jpg').replace(/^\./, '').toLowerCase();
    const path = `${orgId}/${employeeId}/${field}_${randomUUID()}.${ext}`;

    const { signedUrl } = await createSignedUploadUrl(path);
    const publicUrl     = getPublicUrl(path);

    urls[field]  = { signedUrl, publicUrl };
    paths[field] = path;
  }

  res.json({ urls }); // e.g. urls.driving_license.{ signedUrl, publicUrl }
}));

/** GET /api/vehicles — my vehicles. */
router.get('/', asyncHandler(async (req, res) => {
  const rows = (await query(
    `SELECT * FROM vehicles
     WHERE organization_id = $1 AND employee_id = $2 AND is_active = TRUE
     ORDER BY created_at DESC`,
    [req.auth.orgId, req.auth.employeeId]
  )).rows;
  res.json({ vehicles: rows });
}));

/** POST /api/vehicles — register vehicle with optional document URLs. */
router.post('/', asyncHandler(async (req, res) => {
  const {
    vehicleModel, registrationNumber, seatingCapacity, fuelType,
    drivingLicenseUrl, vehicleRcUrl, proofOfInsuranceUrl,
    vehiclePhotoUrl, driverSelfieUrl,
  } = req.body || {};

  if (!vehicleModel || !registrationNumber || !seatingCapacity) {
    throw badRequest('vehicleModel, registrationNumber and seatingCapacity are required');
  }

  const row = (await query(
    `INSERT INTO vehicles (
       organization_id, employee_id,
       vehicle_model, registration_number, seating_capacity, fuel_type,
       driving_license_url, vehicle_rc_url, proof_of_insurance_url,
       vehicle_photo_url, driver_selfie_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.auth.orgId, req.auth.employeeId,
      vehicleModel, registrationNumber.toUpperCase(), seatingCapacity, fuelType || null,
      drivingLicenseUrl || null, vehicleRcUrl || null, proofOfInsuranceUrl || null,
      vehiclePhotoUrl || null, driverSelfieUrl || null,
    ]
  )).rows[0];

  res.status(201).json({ vehicle: row });
}));

/** PATCH /api/vehicles/:id */
router.patch('/:id', asyncHandler(async (req, res) => {
  const { vehicleModel, registrationNumber, seatingCapacity, fuelType, isActive } = req.body || {};
  const row = (await query(
    `UPDATE vehicles SET
       vehicle_model       = COALESCE($3, vehicle_model),
       registration_number = COALESCE($4, registration_number),
       seating_capacity    = COALESCE($5, seating_capacity),
       fuel_type           = COALESCE($6, fuel_type),
       is_active           = COALESCE($7, is_active),
       updated_at          = now()
     WHERE vehicle_id = $1 AND organization_id = $2 AND employee_id = $8
     RETURNING *`,
    [
      req.params.id, req.auth.orgId,
      vehicleModel || null,
      registrationNumber ? registrationNumber.toUpperCase() : null,
      seatingCapacity || null, fuelType || null,
      typeof isActive === 'boolean' ? isActive : null,
      req.auth.employeeId,
    ]
  )).rows[0];
  if (!row) throw notFound('Vehicle not found');
  res.json({ vehicle: row });
}));

/** DELETE /api/vehicles/:id (soft) */
router.delete('/:id', asyncHandler(async (req, res) => {
  const row = (await query(
    `UPDATE vehicles SET is_active = FALSE, updated_at = now()
     WHERE vehicle_id = $1 AND organization_id = $2 AND employee_id = $3 RETURNING vehicle_id`,
    [req.params.id, req.auth.orgId, req.auth.employeeId]
  )).rows[0];
  if (!row) throw notFound('Vehicle not found');
  res.json({ ok: true });
}));

export default router;
