import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api.js';
import { Button } from './ui.jsx';

/* ── Module-level script state so we only inject it once per page ── */
let scriptLoaded  = !!window.Razorpay;   // already on page (e.g. HMR)
let scriptLoading = false;
const scriptCallbacks = [];              // queue of (resolve, reject) waiting

function loadRazorpayScript() {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    scriptCallbacks.push({ resolve, reject });
    if (scriptLoading) return;          // already loading — just queue
    scriptLoading = true;
    const s = document.createElement('script');
    s.src   = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      scriptCallbacks.splice(0).forEach(({ resolve }) => resolve());
    };
    s.onerror = () => {
      scriptLoading = false;
      scriptCallbacks.splice(0).forEach(({ reject }) => reject(new Error('Could not load Razorpay checkout.')));
    };
    document.head.appendChild(s);
  });
}

/**
 * useRazorpay — loads the checkout script and returns a trigger function.
 */
export function useRazorpay({ tripId, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);
  const [ready,   setReady]   = useState(scriptLoaded);

  /* Stable refs so the open() callback never becomes stale */
  const tripIdRef    = useRef(tripId);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef   = useRef(onError);
  useEffect(() => { tripIdRef.current    = tripId;    }, [tripId]);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onErrorRef.current   = onError;   }, [onError]);

  /* Load/detect script */
  useEffect(() => {
    if (scriptLoaded) { setReady(true); return; }
    loadRazorpayScript()
      .then(() => setReady(true))
      .catch((e) => onErrorRef.current?.(e.message));
  }, []);

  const open = useCallback(async () => {
    if (!ready) return onErrorRef.current?.('Razorpay checkout not ready. Please refresh.');
    setLoading(true);
    try {
      const { data: orderData } = await api.post('/payments/razorpay/order', {
        tripId: tripIdRef.current,
      });

      await new Promise((resolve, reject) => {
        let settled = false;         // guard against ondismiss firing after handler

        const options = {
          key:         orderData.keyId,
          amount:      orderData.amount,
          currency:    orderData.currency || 'INR',
          name:        'CoRYD',
          description: 'Ride payment',
          order_id:    orderData.orderId,
          theme:       { color: '#7c3aed' },
          prefill:     {},
          modal: {
            ondismiss: () => {
              if (!settled) {
                settled = true;
                reject(new Error('Payment cancelled by user'));
              }
            },
          },
          handler: async (response) => {
            settled = true;          // prevent ondismiss from also rejecting
            try {
              const { data: v } = await api.post('/payments/razorpay/verify', {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                tripId:              tripIdRef.current,
              });
              resolve(v.payment);
            } catch (e) {
              reject(new Error(e?.response?.data?.error || 'Payment verification failed'));
            }
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp) => {
          if (!settled) {
            settled = true;
            reject(new Error(resp.error?.description || 'Payment failed'));
          }
        });
        rzp.open();
      }).then((payment) => onSuccessRef.current?.(payment));

    } catch (e) {
      if (e.message !== 'Payment cancelled by user') {
        onErrorRef.current?.(e.message || 'Payment failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [ready]);

  return { open, loading, ready };
}

/**
 * RazorpayButton — standalone button, uses the hook above.
 */
export default function RazorpayButton({ tripId, amount, onSuccess, onError, disabled }) {
  const { open, loading, ready } = useRazorpay({ tripId, onSuccess, onError });

  return (
    <Button
      onClick={open}
      disabled={disabled || loading || !ready}
      className="flex items-center gap-2"
    >
      {loading ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Processing…
        </>
      ) : (
        <>
          <RazorpayIcon />
          Pay ₹{Number(amount || 0).toFixed(2)} via Razorpay
        </>
      )}
    </Button>
  );
}

function RazorpayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.5 14.5v-5H9l3-5 3 5h-1.5v5h-3z"/>
    </svg>
  );
}
