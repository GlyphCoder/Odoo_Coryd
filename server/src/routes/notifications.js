import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireEmployee);

/** GET /api/notifications */
router.get('/', asyncHandler(async (req, res) => {
  const rows = (await query(
    `SELECT * FROM notifications WHERE organization_id=$1 AND employee_id=$2 ORDER BY created_at DESC LIMIT 50`,
    [req.auth.orgId, req.auth.employeeId])).rows;
  const unread = rows.filter((r) => !r.is_read).length;
  res.json({ notifications: rows, unread });
}));

/** PATCH /api/notifications/read — mark all read (or ?id= for one). */
router.patch('/read', asyncHandler(async (req, res) => {
  if (req.query.id) {
    await query(`UPDATE notifications SET is_read=TRUE WHERE notification_id=$1 AND organization_id=$2 AND employee_id=$3`,
      [req.query.id, req.auth.orgId, req.auth.employeeId]);
  } else {
    await query(`UPDATE notifications SET is_read=TRUE WHERE organization_id=$1 AND employee_id=$2 AND is_read=FALSE`,
      [req.auth.orgId, req.auth.employeeId]);
  }
  res.json({ ok: true });
}));

export default router;
