import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { apiError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { getSocket } from '../socket.js';
import MapView from '../components/MapView.jsx';
import { Button, Card, Badge, money } from '../components/ui.jsx';

const NEXT = { BOOKED: 'STARTED', STARTED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED' };
const NEXT_LABEL = { BOOKED: 'Start trip', STARTED: 'Begin journey', IN_PROGRESS: 'Complete trip' };
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
    document.body.appendChild(script);
  });
}

export default function TripDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [trip, setTrip] = useState(null);
  const [payment, setPayment] = useState(null);
  const [messages, setMessages] = useState([]);
  const [vehiclePos, setVehiclePos] = useState(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payingMethod, setPayingMethod] = useState('');
  const [callState, setCallState] = useState('idle'); // idle|calling|incoming|connected

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const watchRef = useRef(null);
  const pendingOffer = useRef(null);
  const chatEnd = useRef(null);

  const iAmDriver = trip && trip.driver_employee_id === user.employeeId;

  const loadTrip = useCallback(async () => {
    const { data } = await api.get(`/trips/${id}`);
    setTrip(data.trip);
    setPayment(data.payment);
    if (data.lastPing) setVehiclePos({ lat: +data.lastPing.latitude, lng: +data.lastPing.longitude });
  }, [id]);

  // Initial data
  useEffect(() => {
    loadTrip().catch((e) => setError(apiError(e)));
    api.get(`/trips/${id}/messages`).then(({ data }) => setMessages(data.messages)).catch(() => {});
  }, [id, loadTrip]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Socket wiring
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    socket.emit('trip:join', id, (res) => { if (res?.ok === false) setError(res.error); });

    const onLocation = (p) => setVehiclePos({ lat: p.lat, lng: p.lng });
    const onChat = (m) => setMessages((prev) => [...prev, m]);
    const onJoin = () => setPeerOnline(true);
    const onLeave = () => setPeerOnline(false);
    const onSignal = (msg) => handleSignal(msg);

    socket.on('location:update', onLocation);
    socket.on('chat:new', onChat);
    socket.on('presence:join', onJoin);
    socket.on('presence:leave', onLeave);
    socket.on('call:signal', onSignal);

    return () => {
      socket.emit('trip:leave', id);
      socket.off('location:update', onLocation);
      socket.off('chat:new', onChat);
      socket.off('presence:join', onJoin);
      socket.off('presence:leave', onLeave);
      socket.off('call:signal', onSignal);
      stopLocationWatch();
      teardownCall(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Driver broadcasts GPS while the trip is live
  useEffect(() => {
    if (iAmDriver && trip && ['STARTED', 'IN_PROGRESS'].includes(trip.status)) startLocationWatch();
    else stopLocationWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmDriver, trip?.status]);

  function startLocationWatch() {
    if (watchRef.current != null || !navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading } = pos.coords;
        setVehiclePos({ lat: latitude, lng: longitude });
        socketRef.current?.emit('location:update', {
          tripId: id, lat: latitude, lng: longitude,
          speed: speed != null ? +(speed * 3.6).toFixed(1) : null,
          heading: heading != null ? Math.round(heading) : null,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }
  function stopLocationWatch() {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
  }

  // ── Lifecycle ────────────────────────────────────────────
  const advance = async (status) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/trips/${id}/status`, { status });
      setTrip((t) => ({ ...t, ...data.trip }));
      if (status === 'COMPLETED') await loadTrip();
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  // ── Chat ─────────────────────────────────────────────────
  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socketRef.current?.emit('chat:send', { tripId: id, text }, (res) => {
      if (res?.ok) setMessages((prev) => [...prev, res.message]);
    });
    setDraft('');
  };

  // ── WebRTC voice call ────────────────────────────────────
  async function getMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  }
  function newPeer() {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('call:signal', { tripId: id, type: 'ice', data: e.candidate });
    };
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) teardownCall(true);
    };
    pcRef.current = pc;
    return pc;
  }
  async function startCall() {
    try {
      setCallState('calling');
      const pc = newPeer();
      const stream = await getMic();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      socketRef.current?.emit('call:signal', { tripId: id, type: 'invite' });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('call:signal', { tripId: id, type: 'offer', data: offer });
    } catch (e) { setError('Microphone unavailable'); teardownCall(false); }
  }
  async function acceptCall() {
    try {
      const pc = pcRef.current || newPeer();
      const stream = await getMic();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('call:signal', { tripId: id, type: 'answer', data: answer });
      setCallState('connected');
    } catch (e) { setError('Could not start call'); teardownCall(true); }
  }
  async function handleSignal(msg) {
    const { type, data } = msg;
    if (type === 'invite') { if (callState === 'idle') setCallState('incoming'); return; }
    if (type === 'offer') { pendingOffer.current = data; newPeer(); if (callState !== 'connected') setCallState('incoming'); return; }
    if (type === 'answer') { await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data)); setCallState('connected'); return; }
    if (type === 'ice') { try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(data)); } catch {} return; }
    if (type === 'reject' || type === 'end') { teardownCall(false); return; }
  }
  function endCall() { socketRef.current?.emit('call:signal', { tripId: id, type: 'end' }); teardownCall(false); }
  function rejectCall() { socketRef.current?.emit('call:signal', { tripId: id, type: 'reject' }); teardownCall(false); }
  function teardownCall() {
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingOffer.current = null;
    setCallState('idle');
  }

  // ── Payment ──────────────────────────────────────────────
  const pay = async (method) => {
    if (['CARD', 'UPI'].includes(method)) {
      await payWithRazorpay(method);
      return;
    }

    setBusy(true); setError('');
    try {
      const { data } = await api.post('/payments/pay', { tripId: id, method });
      setPayment(data.payment);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const payWithRazorpay = async (method) => {
    setBusy(true); setPayingMethod(method); setError('');
    try {
      const { data } = await api.post('/payments/razorpay/order', { tripId: id, method });
      await loadRazorpayCheckout();

      await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: data.keyId,
          amount: data.order.amount,
          currency: data.order.currency,
          name: 'Coryd Carpool',
          description: `${method} payment for trip fare`,
          order_id: data.order.id,
          prefill: {
            name: user.fullName || '',
            email: user.email || '',
            contact: user.phoneNumber || '',
          },
          notes: {
            tripId: id,
            paymentId: data.payment.payment_id,
            method,
          },
          config: {
            display: {
              blocks: {
                selected_method: {
                  name: method === 'UPI' ? 'Pay using UPI' : 'Pay using card',
                  instruments: [{ method: method.toLowerCase() }],
                },
              },
              sequence: ['block.selected_method'],
              preferences: { show_default_blocks: true },
            },
          },
          theme: { color: '#2563eb' },
          modal: {
            ondismiss: () => resolve(),
          },
          handler: async (response) => {
            try {
              const verified = await api.post('/payments/pay', {
                tripId: id,
                method,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              setPayment(verified.data.payment);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });

        checkout.open();
      });
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); setPayingMethod(''); }
  };

  if (!trip) return <div className="p-8 text-slate-500">{error || 'Loading…'}</div>;

  const peer = iAmDriver
    ? { name: trip.passenger_name, phone: trip.passenger_phone, role: 'Passenger' }
    : { name: trip.driver_name, phone: trip.driver_phone, role: 'Driver' };
  const showPay = !iAmDriver && payment && payment.status === 'PENDING';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/app/trips" className="text-sm text-slate-500 hover:text-slate-700">← Back to trips</Link>
        <Badge status={trip.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: map + details */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="font-semibold text-slate-700">Live tracking</span>
              <span className="text-slate-500">
                {trip.status === 'IN_PROGRESS' ? '🟢 Trip in progress' : trip.status === 'STARTED' ? '🟡 Heading to pickup' : trip.distance_km + ' km route'}
              </span>
            </div>
            <MapView
              pickup={{ lat: +trip.pickup_lat, lng: +trip.pickup_lng }}
              destination={{ lat: +trip.destination_lat, lng: +trip.destination_lng }}
              routeGeometry={trip.route_polyline}
              vehicle={['STARTED', 'IN_PROGRESS'].includes(trip.status) ? vehiclePos : null}
              height={340}
            />
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-slate-700">Trip details</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Info label="Driver" value={trip.driver_name} />
              <Info label="Passenger" value={trip.passenger_name} />
              <Info label="Vehicle" value={`${trip.vehicle_model} (${trip.registration_number})`} />
              <Info label="Schedule" value={new Date(trip.departure_datetime).toLocaleString()} />
              <Info label="Pickup" value={trip.pickup_address} />
              <Info label="Destination" value={trip.destination_address} />
              <Info label="Distance" value={`${trip.distance_km} km`} />
              <Info label="Fare" value={money(trip.fare_amount)} />
            </div>

            {iAmDriver && NEXT[trip.status] && (
              <div className="mt-4">
                <Button onClick={() => advance(NEXT[trip.status])} disabled={busy}>{NEXT_LABEL[trip.status]}</Button>
              </div>
            )}
            {!iAmDriver && trip.status === 'BOOKED' && (
              <p className="mt-4 text-sm text-slate-400">Waiting for the driver to start the trip.</p>
            )}
            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          </Card>

          {/* Payment */}
          {(showPay || payment?.status === 'COMPLETED') && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold text-slate-700">Payment</h2>
              {payment.status === 'COMPLETED' ? (
                <p className="text-sm text-emerald-600">✓ Paid {money(payment.amount)} via {payment.payment_method}.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-slate-600">Amount due: <b>{money(payment.amount)}</b></p>
                  <div className="flex flex-wrap gap-2">
                    {['CASH', 'CARD', 'UPI', 'WALLET'].map((m) => (
                      <Button key={m} variant="subtle" onClick={() => pay(m)} disabled={busy}>
                        {payingMethod === m ? 'Opening...' : m}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>

        {/* Right: chat + call */}
        <div className="space-y-5">
          <Card className="flex h-[520px] flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">{peer.name}</div>
                <div className="text-xs text-slate-400">{peer.role} · {peerOnline ? 'online' : 'offline'}</div>
              </div>
              {callState === 'idle' && <Button variant="subtle" onClick={startCall}>📞 Call</Button>}
              {callState === 'calling' && <Button variant="danger" onClick={endCall}>Cancel</Button>}
              {callState === 'connected' && <Button variant="danger" onClick={endCall}>End call</Button>}
            </div>

            {callState === 'incoming' && (
              <div className="flex items-center justify-between bg-brand/10 px-4 py-2 text-sm">
                <span>📞 Incoming call…</span>
                <span className="flex gap-2">
                  <Button onClick={acceptCall}>Accept</Button>
                  <Button variant="danger" onClick={rejectCall}>Decline</Button>
                </span>
              </div>
            )}
            {callState === 'connected' && <div className="bg-emerald-50 px-4 py-1.5 text-center text-xs text-emerald-600">🎙️ Call connected</div>}

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 && <p className="text-center text-xs text-slate-400">No messages yet. Say hi 👋</p>}
              {messages.map((m) => {
                const mine = m.sender_employee_id === user.employeeId;
                if (m.message_type === 'CALL_LOG') {
                  return <div key={m.message_id} className="text-center text-[11px] text-slate-400">— {m.message_text} —</div>;
                }
                return (
                  <div key={m.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {m.message_text}
                      <div className={`mt-0.5 text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                        {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEnd} />
            </div>

            <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <Button type="submit">Send</Button>
            </form>
          </Card>
        </div>
      </div>

      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="pr-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-slate-700">{value}</div>
    </div>
  );
}
