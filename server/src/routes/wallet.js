import { Router } from 'express';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireEmployee);

/** GET /api/wallet — my balance + recent transactions. */
router.get('/', asyncHandler(async (req, res) => {
  let wallet = (await query(
    `SELECT * FROM wallets WHERE organization_id=$1 AND employee_id=$2`,
    [req.auth.orgId, req.auth.employeeId])).rows[0];
  if (!wallet) {
    wallet = (await query(
      `INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1,$2,0) RETURNING *`,
      [req.auth.orgId, req.auth.employeeId])).rows[0];
  }
  const txns = (await query(
    `SELECT * FROM wallet_transactions WHERE organization_id=$1 AND wallet_id=$2 ORDER BY created_at DESC LIMIT 50`,
    [req.auth.orgId, wallet.wallet_id])).rows;
  res.json({ balance: wallet.balance, wallet, transactions: txns });
}));

/** POST /api/wallet/recharge — { amount } (test mode; no real gateway). */
router.post('/recharge', asyncHandler(async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!amount || amount <= 0) throw badRequest('amount must be positive');
  const orgId = req.auth.orgId;

  const out = await withTenant(orgId, async (client) => {
    let wallet = (await client.query(
      `SELECT * FROM wallets WHERE organization_id=$1 AND employee_id=$2 FOR UPDATE`,
      [orgId, req.auth.employeeId])).rows[0];
    if (!wallet) {
      wallet = (await client.query(
        `INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1,$2,0) RETURNING *`,
        [orgId, req.auth.employeeId])).rows[0];
    }
    const after = (Number(wallet.balance) + amount).toFixed(2);
    await client.query(`UPDATE wallets SET balance=$1, updated_at=now() WHERE wallet_id=$2 AND organization_id=$3`,
      [after, wallet.wallet_id, orgId]);
    await client.query(
      `INSERT INTO wallet_transactions (organization_id, wallet_id, transaction_type, amount, balance_after)
       VALUES ($1,$2,'RECHARGE',$3,$4)`,
      [orgId, wallet.wallet_id, amount, after]);
    return after;
  });

  res.json({ balance: out });
}));

export default router;
