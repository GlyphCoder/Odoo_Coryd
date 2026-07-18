import { Router } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest, notFound, forbidden } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import config from '../config.js';

const router = Router();
router.use(requireAuth, requireEmployee);

/* ── Razorpay client (lazy — only initialised when keys are set) ── */
let rzp = null;
function getRzp() {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    throw badRequest('Razorpay is not configured on this server. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env');
  }
  if (!rzp) {
    rzp = new Razorpay({
      key_id:     config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return rzp;
}

/* ── Helper: verify Razorpay HMAC signature ── */
function verifySignature(orderId, paymentId, signature) {
  const body    = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body)
    .digest('hex');
  return expected === signature;
}

/* ─────────────────────────────────────────────────────────────────
   GET /api/payments/razorpay/config
   Returns the public key_id so the frontend can initialise the SDK.
───────────────────────────────────────────────────────────────── */
router.get('/razorpay/config', asyncHandler(async (_req, res) => {
  if (!config.razorpay.keyId) {
    return res.json({ enabled: false, keyId: null });
  }
  res.json({ enabled: true, keyId: config.razorpay.keyId });
}));

/* ─────────────────────────────────────────────────────────────────
   POST /api/payments/razorpay/qr
   body: { tripId }
   Creates a Razorpay UPI QR Code — passenger scans with any UPI app.
   Returns { qrId, imageUrl, amount, expiresAt }
───────────────────────────────────────────────────────────────── */
router.post('/razorpay/qr', asyncHandler(async (req, res) => {
  const { tripId } = req.body || {};
  if (!tripId) throw badRequest('tripId is required');

  const orgId = req.auth.orgId;
  const me    = req.auth.employeeId;

  const payment = (await query(
    `SELECT * FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING' LIMIT 1`,
    [tripId, orgId]
  )).rows[0];
  if (!payment) throw notFound('No pending payment for this trip');
  if (payment.payer_employee_id !== me) throw forbidden('Only the passenger can initiate payment');

  const rzpClient = getRzp();
  const amountPaise = Math.round(Number(payment.amount) * 100);

  // QR code expires in 15 minutes
  const closeBy = Math.floor(Date.now() / 1000) + 15 * 60;

  const qr = await rzpClient.qrCode.create({
    type:           'upi_qr',
    name:           'CoRYD Payment',
    usage:          'single_use',
    fixed_amount:   true,
    payment_amount: amountPaise,
    description:    `Trip payment — ₹${payment.amount}`,
    close_by:       closeBy,
  });

  // Store QR id so we can poll its status later
  await query(
    `UPDATE payments SET payment_gateway_ref=$1 WHERE payment_id=$2 AND organization_id=$3`,
    [`qr_${qr.id}`, payment.payment_id, orgId]
  );

  res.json({
    qrId:      qr.id,
    imageUrl:  qr.image_url,
    amount:    payment.amount,
    expiresAt: new Date(closeBy * 1000).toISOString(),
  });
}));

/* ─────────────────────────────────────────────────────────────────
   GET /api/payments/razorpay/qr/:qrId/status?tripId=
   Polls whether the QR payment has been completed.
───────────────────────────────────────────────────────────────── */
router.get('/razorpay/qr/:qrId/status', asyncHandler(async (req, res) => {
  const { tripId } = req.query;
  if (!tripId) throw badRequest('tripId query param required');

  const rzpClient = getRzp();
  const orgId = req.auth.orgId;

  // Fetch payments made on this QR from Razorpay
  const { items } = await rzpClient.qrCode.fetchAllPayments(req.params.qrId, {});
  const paid = items?.find((p) => p.status === 'captured');

  if (paid) {
    // Mark our DB payment as completed
    const updated = (await query(
      `UPDATE payments
          SET status='COMPLETED', payment_method='RAZORPAY', payment_gateway_ref=$3, paid_at=now()
        WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING'
        RETURNING *`,
      [tripId, orgId, paid.id]
    )).rows[0];

    // Close the QR code so it can't be scanned again
    try { await rzpClient.qrCode.close(req.params.qrId); } catch {}

    if (updated) {
      await query(
        `INSERT INTO notifications (organization_id, employee_id, title, body, notif_type)
         VALUES ($1,$2,'Payment received',$3,'PAYMENT_RECEIVED')`,
        [orgId, updated.payee_employee_id,
         `Payment of ₹${updated.amount} received via Razorpay QR.`]
      );
    }

    return res.json({ paid: true, payment: updated || null });
  }

  res.json({ paid: false });
}));

/* ─────────────────────────────────────────────────────────────────
   POST /api/payments/razorpay/order
   body: { tripId }
   Creates a Razorpay Order and returns orderId + amount for checkout.
───────────────────────────────────────────────────────────────── */
router.post('/razorpay/order', asyncHandler(async (req, res) => {
  const { tripId } = req.body || {};
  if (!tripId) throw badRequest('tripId is required');

  const orgId = req.auth.orgId;
  const me    = req.auth.employeeId;

  // Fetch pending payment
  const payment = (await query(
    `SELECT * FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING' LIMIT 1`,
    [tripId, orgId]
  )).rows[0];
  if (!payment) throw notFound('No pending payment for this trip');
  if (payment.payer_employee_id !== me) throw forbidden('Only the passenger can initiate payment');

  const rzpClient = getRzp();

  // Amount in paise (Razorpay uses smallest currency unit)
  const amountPaise = Math.round(Number(payment.amount) * 100);

  const order = await rzpClient.orders.create({
    amount:   amountPaise,
    currency: 'INR',
    receipt:  `trip_${tripId.slice(0, 8)}`,
    notes: {
      tripId,
      orgId,
      paymentId: payment.payment_id,
    },
  });

  // Persist the razorpay order id on the payment row for later verification
  await query(
    `UPDATE payments SET payment_gateway_ref=$1 WHERE payment_id=$2 AND organization_id=$3`,
    [order.id, payment.payment_id, orgId]
  );

  res.json({
    orderId:    order.id,
    amount:     order.amount,       // paise
    currency:   order.currency,
    paymentId:  payment.payment_id,
    keyId:      config.razorpay.keyId,
  });
}));

/* ─────────────────────────────────────────────────────────────────
   POST /api/payments/razorpay/verify
   body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, tripId }
   Verifies HMAC, then marks the DB payment COMPLETED.
───────────────────────────────────────────────────────────────── */
router.post('/razorpay/verify', asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    tripId,
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !tripId) {
    throw badRequest('Missing Razorpay verification fields');
  }

  if (!config.razorpay.keySecret) throw badRequest('Razorpay not configured');

  const valid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!valid) throw badRequest('Payment signature verification failed');

  const orgId = req.auth.orgId;
  const me    = req.auth.employeeId;

  const out = await withTenant(orgId, async (client) => {
    const payment = (await client.query(
      `SELECT * FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING' FOR UPDATE`,
      [tripId, orgId]
    )).rows[0];
    if (!payment) throw notFound('No pending payment found for this trip');
    if (payment.payer_employee_id !== me) throw forbidden('Not the payer');

    // Mark completed
    const updated = (await client.query(
      `UPDATE payments
          SET status='COMPLETED',
              payment_method='RAZORPAY',
              payment_gateway_ref=$3,
              paid_at=now()
        WHERE payment_id=$1 AND organization_id=$2
        RETURNING *`,
      [payment.payment_id, orgId, razorpay_payment_id]
    )).rows[0];

    // Notify driver
    await client.query(
      `INSERT INTO notifications (organization_id, employee_id, title, body, notif_type)
       VALUES ($1,$2,'Payment received',$3,'PAYMENT_RECEIVED')`,
      [orgId, payment.payee_employee_id,
       `Payment of ₹${payment.amount} received via Razorpay (ref: ${razorpay_payment_id}).`]
    );

    return updated;
  });

  res.json({ payment: out, success: true });
}));

/* ─────────────────────────────────────────────────────────────────
   GET /api/payments/trip/:tripId — latest payment for a trip.
───────────────────────────────────────────────────────────────── */
router.get('/trip/:tripId', asyncHandler(async (req, res) => {
  const row = (await query(
    `SELECT * FROM payments WHERE organization_id=$1 AND trip_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [req.auth.orgId, req.params.tripId]
  )).rows[0] || null;
  res.json({ payment: row });
}));

/* ─────────────────────────────────────────────────────────────────
   POST /api/payments/pay — settle via CASH / CARD / UPI / WALLET
   (unchanged manual payment flow)
───────────────────────────────────────────────────────────────── */
router.post('/pay', asyncHandler(async (req, res) => {
  const { tripId, method, gatewayRef } = req.body || {};
  if (!tripId || !method) throw badRequest('tripId and method are required');
  if (!['CASH', 'CARD', 'UPI', 'WALLET', 'RAZORPAY'].includes(method)) throw badRequest('Invalid payment method');
  const orgId = req.auth.orgId;
  const me    = req.auth.employeeId;

  const out = await withTenant(orgId, async (client) => {
    const payment = (await client.query(
      `SELECT * FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status='PENDING' FOR UPDATE`,
      [tripId, orgId]
    )).rows[0];
    if (!payment) throw notFound('No pending payment for this trip');
    if (payment.payer_employee_id !== me) throw forbidden('Only the passenger can pay for this trip');

    if (method === 'WALLET') {
      const payerWallet = (await client.query(
        `SELECT * FROM wallets WHERE organization_id=$1 AND employee_id=$2 FOR UPDATE`,
        [orgId, payment.payer_employee_id]
      )).rows[0];
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

      // Credit driver wallet
      let driverWallet = (await client.query(
        `SELECT * FROM wallets WHERE organization_id=$1 AND employee_id=$2 FOR UPDATE`,
        [orgId, payment.payee_employee_id]
      )).rows[0];
      if (!driverWallet) {
        driverWallet = (await client.query(
          `INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1,$2,0) RETURNING *`,
          [orgId, payment.payee_employee_id]
        )).rows[0];
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
      [payment.payment_id, orgId, method, gatewayRef || null]
    )).rows[0];

    await client.query(
      `INSERT INTO notifications (organization_id, employee_id, title, body, notif_type)
       VALUES ($1,$2,'Payment received',$3,'PAYMENT_RECEIVED')`,
      [orgId, payment.payee_employee_id,
       `Payment of ${payment.amount} received via ${method}.`]);

    return updated;
  });

  res.json({ payment: out });
}));

export default router;
