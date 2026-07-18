import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api.js';
import { Button } from './ui.jsx';

/**
 * RazorpayQR
 * Shows a full-screen modal with a UPI QR code that the passenger can
 * share with the driver (or scan themselves on another device).
 * Polls every 4 seconds; auto-closes and calls onSuccess when paid.
 *
 * Props:
 *  tripId      string
 *  amount      number|string  — display ₹ amount
 *  onSuccess   fn(payment)
 *  onClose     fn()
 */
export default function RazorpayQR({ tripId, amount, onSuccess, onClose }) {
  const [phase, setPhase]     = useState('loading');  // loading | ready | paid | error
  const [qrData, setQrData]   = useState(null);
  const [errMsg, setErrMsg]   = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const pollRef   = useRef(null);
  const timerRef  = useRef(null);

  /* ── Generate QR on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/payments/razorpay/qr', { tripId });
        if (cancelled) return;
        setQrData(data);
        setPhase('ready');
        startPolling(data.qrId);
        startCountdown(data.expiresAt);
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e?.response?.data?.error || 'Failed to generate QR code');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [tripId]);

  /* ── Poll payment status every 4 s ── */
  function startPolling(qrId) {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(
          `/payments/razorpay/qr/${qrId}/status?tripId=${tripId}`
        );
        if (data.paid) {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setPhase('paid');
          setTimeout(() => onSuccess?.(data.payment), 1500);
        }
      } catch {}
    }, 4000);
  }

  /* ── Countdown timer ── */
  function startCountdown(expiresAt) {
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0) {
        clearInterval(timerRef.current);
        clearInterval(pollRef.current);
        setPhase('error');
        setErrMsg('QR code expired. Please generate a new one.');
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  }

  const fmtTime = (secs) => {
    if (secs === null) return '';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  /* ── UPI deep-link fallback (for mobile "open UPI app") ── */
  const upiLink = qrData
    ? `upi://pay?pa=&pn=CarpoolPlatform&am=${amount}&cu=INR&tn=Carpool+Trip+Payment`
    : null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl mx-4">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 text-xl font-bold"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-5 text-center">
          <div className="mb-1 text-3xl">📱</div>
          <h2 className="text-lg font-bold text-slate-800">Scan to Pay</h2>
          <p className="text-sm text-slate-500">
            Use any UPI app — GPay, PhonePe, Paytm, BHIM
          </p>
        </div>

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <svg className="animate-spin h-10 w-10 text-teal-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-slate-500">Generating QR code…</p>
          </div>
        )}

        {/* ── Ready — show QR ── */}
        {phase === 'ready' && qrData && (
          <>
            {/* Amount badge */}
            <div className="mb-4 rounded-2xl bg-teal-50 px-4 py-3 text-center">
              <p className="text-xs text-teal-600 font-medium">Amount to pay</p>
              <p className="text-3xl font-bold text-teal-700">₹{Number(amount).toFixed(2)}</p>
            </div>

            {/* QR image from Razorpay (preferred) or fallback SVG */}
            <div className="flex justify-center mb-4">
              {qrData.imageUrl ? (
                <div className="rounded-2xl border-4 border-teal-100 p-2 shadow-inner">
                  <img
                    src={qrData.imageUrl}
                    alt="Razorpay UPI QR Code"
                    className="h-52 w-52 rounded-xl object-contain"
                  />
                </div>
              ) : (
                /* Fallback: generate QR locally from UPI link */
                <div className="rounded-2xl border-4 border-teal-100 p-3 shadow-inner bg-white">
                  <QRCodeSVG
                    value={upiLink}
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#0f766e"
                    level="H"
                    includeMargin={false}
                  />
                </div>
              )}
            </div>

            {/* Countdown */}
            <div className="mb-4 flex items-center justify-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-slate-500">
                Waiting for payment · expires in{' '}
                <span className={`font-mono font-bold ${timeLeft < 60 ? 'text-rose-500' : 'text-slate-700'}`}>
                  {fmtTime(timeLeft)}
                </span>
              </span>
            </div>

            {/* Mobile UPI deep link */}
            <a
              href={upiLink}
              className="block w-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 py-3 text-center text-sm font-semibold text-white shadow hover:from-teal-600 hover:to-teal-700 transition mb-2"
            >
              📱 Open UPI App directly
            </a>
            <p className="text-center text-xs text-slate-400">
              QR refreshes automatically once paid
            </p>
          </>
        )}

        {/* ── Paid ── */}
        {phase === 'paid' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-5xl">✅</span>
            </div>
            <p className="text-xl font-bold text-emerald-700">Payment received!</p>
            <p className="text-sm text-slate-500">
              ₹{Number(amount).toFixed(2)} paid successfully via Razorpay
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
              <span className="text-3xl">❌</span>
            </div>
            <p className="text-center text-sm text-rose-600 font-medium">{errMsg}</p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
