import { useEffect, useRef, useState } from 'react';
import api from '../api.js';
import { Button } from './ui.jsx';

/**
 * RazorpayButton — loads the Razorpay checkout script once,
 * creates an order server-side, then opens the Razorpay popup.
 *
 * Props:
 *  tripId      string   — the trip to pay for
 *  amount      number   — display amount in ₹ (for the button label)
 *  onSuccess   fn(payment) — called after server verifies the payment
 *  onError     fn(msg)     — called on any failure
 *  disabled    bool
 */
export default function RazorpayButton({ tripId, amount, onSuccess, onError, disabled }) {
  const [loading, setLoading]   = useState(false);
  const [rzpReady, setRzpReady] = useState(false);
  const scriptRef = useRef(null);

  /* Load Razorpay checkout script once */
  useEffect(() => {
    if (window.Razorpay) { setRzpReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload  = () => setRzpReady(true);
    script.onerror = () => onError?.('Could not load Razorpay checkout.');
    document.head.appendChild(script);
    scriptRef.current = script;
    return () => { /* keep script — reused across re-renders */ };
  }, []);

  const handlePay = async () => {
    if (!rzpReady) return onError?.('Razorpay checkout not ready. Please refresh.');
    setLoading(true);
    try {
      /* 1️⃣  Create Razorpay Order on server */
      const { data: orderData } = await api.post('/payments/razorpay/order', { tripId });

      /* 2️⃣  Open Razorpay popup */
      await new Promise((resolve, reject) => {
        const options = {
          key:         orderData.keyId,
          amount:      orderData.amount,      // paise
          currency:    orderData.currency || 'INR',
          name:        'Carpool Platform',
          description: 'Ride payment',
          order_id:    orderData.orderId,
          theme:       { color: '#0d9488' },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled by user')),
          },
          handler: async (response) => {
            try {
              /* 3️⃣  Verify signature on server */
              const { data: verifyData } = await api.post('/payments/razorpay/verify', {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                tripId,
              });
              resolve(verifyData.payment);
            } catch (e) {
              reject(new Error(e?.response?.data?.error || 'Payment verification failed'));
            }
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp) => {
          reject(new Error(resp.error?.description || 'Payment failed'));
        });
        rzp.open();
      }).then((payment) => {
        onSuccess?.(payment);
      });

    } catch (e) {
      // "Payment cancelled by user" is not an error — just log silently
      if (e.message !== 'Payment cancelled by user') {
        onError?.(e.message || 'Payment failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePay}
      disabled={disabled || loading || !rzpReady}
      className="bg-[#1a73e8] hover:bg-[#1557b0] text-white flex items-center gap-2"
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
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
