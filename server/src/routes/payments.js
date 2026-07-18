import { Router } from 'express';
import crypto from 'node:crypto';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest, notFound, forbidden } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import config from '../config.js';

const router = Router();
router.use(requireAuth, requireEmployee);

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

function requireRazorpayConfig() {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    throw badRequest('Razorpay keys are not configured on the server');
  }
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const actual = Buffer.from(signature || '');
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function razorpayAuthHeader() {
  return `Basic ${Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64')}`;
}

async function fetchRazorpayOrder(orderId) {
  const rpRes = await fetch(`${RAZORPAY_ORDERS_URL}/${orderId}`, {
    headers: { Authorization: razorpayAuthHeader() },
  });
  const order = await rpRes.json().catch(() => null);
  if (!rpRes.ok) {
    throw badRequest(order?.error?.description || 'Could not verify Razorpay order');
  }
  return order;
}

async function verifyRazorpayOrderForPayment(payment, orderId, method) {
  const order = await fetchRazorpayOrder(orderId);
  const expectedAmount = Math.round(Number(payment.amount) * 100);
  if (order.receipt !== payment.payment_id || order.amount !== expectedAmount || order.currency !== 'INR') {
    throw badRequest('Razorpay order does not match this payment');
  }
  if (order.notes?.method && order.notes.method !== method) {
    throw badRequest('Razorpay order method does not match this payment');
  }
}

/** GET /api/payments/trip/:tripId — latest payment for a trip. */
router.get('/trip/:tripId', asyncHandler(async (req, res) => {
  const row = (await query(
    `SELECT * FROM payments WHERE organization_id=$1 AND trip_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [req.auth.orgId, req.params.tripId])).rows[0] || null;
  res.json({ payment: row });
}));

/**
 * POST /api/payments/razorpay/order — create a Razorpay Checkout order.
 * body: { tripId, method: 'CARD'|'UPI' }
 */
router.post('/razorpay/order', asyncHandler(async (req, res) => {
  const { tripId, method } = req.body || {};
  if (!tripId || !method) throw badRequest('tripId and method are required');
  if (!['CARD', 'UPI'].includes(method)) throw badRequest('Razorpay is only available for CARD or UPI');
  requireRazorpayConfig();

  const payment = (await query(
    `SELECT * FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING'`,
    [tripId, req.auth.orgId])).rows[0];
  if (!payment) throw notFound('No pending payment for this trip');
  if (payment.payer_employee_id !== req.auth.employeeId) throw forbidden('Only the passenger can pay for this trip');

  const amount = Math.round(Number(payment.amount) * 100);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Invalid payment amount');

  const rpRes = await fetch(RAZORPAY_ORDERS_URL, {
    method: 'POST',
    headers: {
      Authorization: razorpayAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'INR',
      receipt: payment.payment_id,
      notes: {
        tripId,
        paymentId: payment.payment_id,
        organizationId: req.auth.orgId,
        method,
      },
    }),
  });

  const order = await rpRes.json().catch(() => null);
  if (!rpRes.ok) {
    throw badRequest(order?.error?.description || 'Could not create Razorpay order');
  }

  res.json({
    keyId: config.razorpay.keyId,
    order,
    payment: {
      payment_id: payment.payment_id,
      amount: payment.amount,
    },
  });
}));

/**
 * POST /api/payments/pay — settle a trip payment.
 * body: { tripId, method: 'CASH'|'CARD'|'UPI'|'WALLET', gatewayRef? }
 * Only the passenger (payer) may pay. WALLET moves balance passenger -> driver.
 */
router.post('/pay', asyncHandler(async (req, res) => {
  const { tripId, method, gatewayRef, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!tripId || !method) throw badRequest('tripId and method are required');
  if (!['CASH', 'CARD', 'UPI', 'WALLET'].includes(method)) throw badRequest('Invalid payment method');
  if (['CARD', 'UPI'].includes(method)) {
    requireRazorpayConfig();
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw badRequest('Razorpay verification details are required');
    }
    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      throw badRequest('Razorpay payment verification failed');
    }
  }
  const orgId = req.auth.orgId;
  const me = req.auth.employeeId;

  const out = await withTenant(orgId, async (client) => {
    const payment = (await client.query(
      `SELECT * FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING' FOR UPDATE`,
      [tripId, orgId])).rows[0];
    if (!payment) throw notFound('No pending payment for this trip');
    if (payment.payer_employee_id !== me) throw forbidden('Only the passenger can pay for this trip');
    if (['CARD', 'UPI'].includes(method)) {
      await verifyRazorpayOrderForPayment(payment, razorpayOrderId, method);
    }

    if (method === 'WALLET') {
      const payerWallet = (await client.query(
        `SELECT * FROM wallets WHERE organization_id=$1 AND employee_id=$2 FOR UPDATE`,
        [orgId, payment.payer_employee_id])).rows[0];
      if (!payerWallet || Number(payerWallet.balance) < Number(payment.amount)) {
        throw badRequest('Insufficient wallet balance');
      }
      const payerAfter = (Number(payerWallet.balance) - Number(payment.amount)).toFixed(2);
      await client.query(`UPDATE wallets SET balance=$1, updated_at=now() WHERE wallet_id=$2 AND organization_id=$3`,
        [payerAfter, payerWallet.wallet_id, orgId]);
      await client.query(
        `INSERT INTO wallet_transactions (organization_id, wallet_id, transaction_type, amount, balance_after, reference_payment_id)
         VALUES ($1,$2,'RIDE_PAYMENT',$3,$4,$5)`,
        [orgId, payerWallet.wallet_id, payment.amount, payerAfter, payment.payment_id]);

      // Credit driver wallet (create if missing).
      let driverWallet = (await client.query(
        `SELECT * FROM wallets WHERE organization_id=$1 AND employee_id=$2 FOR UPDATE`,
        [orgId, payment.payee_employee_id])).rows[0];
      if (!driverWallet) {
        driverWallet = (await client.query(
          `INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1,$2,0) RETURNING *`,
          [orgId, payment.payee_employee_id])).rows[0];
      }
      const driverAfter = (Number(driverWallet.balance) + Number(payment.amount)).toFixed(2);
      await client.query(`UPDATE wallets SET balance=$1, updated_at=now() WHERE wallet_id=$2 AND organization_id=$3`,
        [driverAfter, driverWallet.wallet_id, orgId]);
      await client.query(
        `INSERT INTO wallet_transactions (organization_id, wallet_id, transaction_type, amount, balance_after, reference_payment_id)
         VALUES ($1,$2,'RECHARGE',$3,$4,$5)`,
        [orgId, driverWallet.wallet_id, payment.amount, driverAfter, payment.payment_id]);
    }

    const updated = (await client.query(
      `UPDATE payments SET status='COMPLETED', payment_method=$3, payment_gateway_ref=$4, paid_at=now()
       WHERE payment_id=$1 AND organization_id=$2 RETURNING *`,
      [payment.payment_id, orgId, method, razorpayPaymentId || gatewayRef || null])).rows[0];

    await client.query(
      `INSERT INTO notifications (organization_id, employee_id, title, body, notif_type)
       VALUES ($1,$2,'Payment received',$3,'PAYMENT_RECEIVED')`,
      [orgId, payment.payee_employee_id, `Payment of ${payment.amount} received via ${method}.`]);

    return updated;
  });

  res.json({ payment: out });
}));

export default router;
