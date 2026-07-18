import { verifyToken } from '../utils/jwt.js';

/**
 * Requires a valid Bearer token. Attaches req.auth =
 *   { userId, orgId, employeeId, isAdmin, fullName }
 * The org context is baked into the token at login, so every downstream query
 * can be scoped with req.auth.orgId (tenant isolation, query layer).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing authentication token' });
  try {
    const payload = verifyToken(token);
    req.auth = {
      userId: payload.userId,
      orgId: payload.orgId,
      employeeId: payload.employeeId || null,
      isAdmin: !!payload.isAdmin,
      fullName: payload.fullName,
    };
    if (!req.auth.orgId) return res.status(401).json({ error: 'Token missing organization context' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Requires the caller to be an organization admin. */
export function requireAdmin(req, res, next) {
  if (!req.auth?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  return next();
}

/** Requires the caller to have an employee profile (i.e. can do ride ops). */
export function requireEmployee(req, res, next) {
  if (!req.auth?.employeeId) return res.status(403).json({ error: 'Employee profile required' });
  return next();
}
