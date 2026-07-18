import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTenant } from '../db.js';
import { signToken } from '../utils/jwt.js';
import { asyncHandler, badRequest } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/signup
 * body: { orgCode, email, password, fullName, phoneNumber?, employeeCode?, department?, designation? }
 * Creates (or reuses) the global user, binds them as an employee of the org,
 * provisions a wallet, and returns a JWT with org context.
 */
router.post('/signup', asyncHandler(async (req, res) => {
  const { orgCode, email, password, fullName, phoneNumber, employeeCode, department, designation } = req.body || {};
  if (!orgCode || !email || !password || !fullName) {
    throw badRequest('orgCode, email, password and fullName are required');
  }

  const orgRes = await query(
    'SELECT organization_id, org_name FROM organizations WHERE org_code = $1 AND is_active = TRUE',
    [orgCode.trim().toUpperCase()]
  );
  if (!orgRes.rows.length) throw badRequest('Invalid organization code');
  const org = orgRes.rows[0];

  const result = await withTenant(org.organization_id, async (client) => {
    // Reuse an existing global user by email, else create one.
    let userRow = (await client.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])).rows[0];
    if (userRow) {
      // Prevent a user already registered in another org from re-registering (single-org model).
      const existingEmp = (await client.query('SELECT 1 FROM employees WHERE user_id = $1', [userRow.user_id])).rows[0];
      if (existingEmp) throw badRequest('An account with this email already exists. Please log in.');
    } else {
      const hash = await bcrypt.hash(password, 10);
      userRow = (await client.query(
        `INSERT INTO users (email, phone_number, password_hash, full_name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [email.toLowerCase(), phoneNumber || null, hash, fullName]
      )).rows[0];
    }

    const emp = (await client.query(
      `INSERT INTO employees (organization_id, user_id, employee_code, department, designation)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [org.organization_id, userRow.user_id, employeeCode || null, department || null, designation || null]
    )).rows[0];

    await client.query(
      'INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING',
      [org.organization_id, emp.employee_id]
    );

    return { userRow, emp };
  });

  const token = signToken({
    userId: result.userRow.user_id,
    orgId: org.organization_id,
    employeeId: result.emp.employee_id,
    isAdmin: false,
    fullName: result.userRow.full_name,
  });

  res.status(201).json({
    token,
    user: shapeUser(result.userRow, org, result.emp, false),
  });
}));

/**
 * POST /api/auth/login
 * body: { email, password }
 * Resolves the user's employee (or admin) org context and returns a JWT.
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw badRequest('email and password are required');

  const userRow = (await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])).rows[0];
  if (!userRow || !userRow.is_active) throw badRequest('Invalid credentials');

  const ok = await bcrypt.compare(password, userRow.password_hash);
  if (!ok) throw badRequest('Invalid credentials');

  // Find the employee context (single-org model) and any admin role.
  const emp = (await query(
    `SELECT e.*, o.org_name FROM employees e
     JOIN organizations o ON o.organization_id = e.organization_id
     WHERE e.user_id = $1 AND e.status = 'ACTIVE' LIMIT 1`,
    [userRow.user_id]
  )).rows[0];

  const admin = (await query(
    'SELECT * FROM organization_admins WHERE user_id = $1 LIMIT 1',
    [userRow.user_id]
  )).rows[0];

  const orgId = emp?.organization_id || admin?.organization_id;
  if (!orgId) throw badRequest('This account is not linked to any organization');

  await query('UPDATE users SET last_login_at = now() WHERE user_id = $1', [userRow.user_id]);

  const org = (await query('SELECT organization_id, org_name FROM organizations WHERE organization_id = $1', [orgId])).rows[0];

  const token = signToken({
    userId: userRow.user_id,
    orgId,
    employeeId: emp?.employee_id || null,
    isAdmin: !!admin,
    fullName: userRow.full_name,
  });

  res.json({ token, user: shapeUser(userRow, org, emp, !!admin) });
}));

/** GET /api/auth/me — current identity + org context. */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const userRow = (await query('SELECT * FROM users WHERE user_id = $1', [req.auth.userId])).rows[0];
  const org = (await query('SELECT organization_id, org_name FROM organizations WHERE organization_id = $1', [req.auth.orgId])).rows[0];
  const emp = req.auth.employeeId
    ? (await query('SELECT * FROM employees WHERE employee_id = $1', [req.auth.employeeId])).rows[0]
    : null;
  res.json({ user: shapeUser(userRow, org, emp, req.auth.isAdmin) });
}));

/** PATCH /api/auth/profile — update the user's own profile. */
router.patch('/profile', requireAuth, asyncHandler(async (req, res) => {
  const { fullName, phoneNumber, profilePhotoUrl } = req.body || {};
  const userRow = (await query(
    `UPDATE users SET
       full_name = COALESCE($2, full_name),
       phone_number = COALESCE($3, phone_number),
       profile_photo_url = COALESCE($4, profile_photo_url),
       updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [req.auth.userId, fullName || null, phoneNumber || null, profilePhotoUrl || null]
  )).rows[0];
  const org = (await query('SELECT organization_id, org_name FROM organizations WHERE organization_id = $1', [req.auth.orgId])).rows[0];
  const emp = req.auth.employeeId
    ? (await query('SELECT * FROM employees WHERE employee_id = $1', [req.auth.employeeId])).rows[0]
    : null;
  res.json({ user: shapeUser(userRow, org, emp, req.auth.isAdmin) });
}));

function shapeUser(u, org, emp, isAdmin) {
  return {
    userId: u.user_id,
    email: u.email,
    fullName: u.full_name,
    phoneNumber: u.phone_number,
    profilePhotoUrl: u.profile_photo_url,
    organizationId: org?.organization_id,
    orgName: org?.org_name,
    employeeId: emp?.employee_id || null,
    department: emp?.department || null,
    designation: emp?.designation || null,
    isAdmin,
  };
}

export default router;
