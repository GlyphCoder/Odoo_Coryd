import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, CircleCheck, Banknote, Smartphone, WalletMinimal, Phone, ArrowLeft, Route, QrCode } from 'lucide-react';
import api, { apiError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { getSocket } from '../socket.js';
import MapView from '../components/MapView.jsx';
import RazorpayButton from '../components/RazorpayButton.jsx';
import RazorpayQR from '../components/RazorpayQR.jsx';
import AudioCallOverlay from '../components/AudioCallOverlay.jsx';
import { useWebRTC } from '../hooks/useWebRTC.js';
import { Button, Card, Badge, Spinner, Alert, money } from '../components/ui.jsx';

const NEXT = { BOOKED: 'STARTED', STARTED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED' };
const NEXT_LABEL = { BOOKED: 'Start trip', STARTED: 'Begin journey', IN_PROGRESS: 'Complete trip' };

/** Haversine distance in km */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Format seconds → "X min Y sec" */
function fmtEta(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function TripDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [trip, setTrip] = useState(null);
  const [payment, setPayment] = useState(null);
  const [messages, setMessages] = useState([]);
  const [vehiclePos, setVehiclePos] = useState(null);
  const [myLocation, setMyLocation] = useState(null);   // ← passenger live GPS
  const [peerOnline, setPeerOnline] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [eta, setEta] = useState(null);   // { distKm, minutes }

  const socketRef = useRef(null);
  const watchRef = useRef(null);  // driver GPS watch id
  const myWatchRef = useRef(null);  // passenger GPS watch id
  const chatEnd = useRef(null);
  const joinRoomRef = useRef(null);  // exposed so the manual reconnect button can call it

  const iAmDriver = trip && trip.driver_employee_id === user.employeeId;

  // ── Stable signal emitter — passed to the WebRTC hook ─────────────────
  // Wrapped in useCallback so it never re-creates on every render.
  const emitSignal = useCallback((type, data) => {
    socketRef.current?.emit('call:signal', { tripId: id, type, data: data ?? null });
  }, [id]);

  // ── WebRTC hook — all peer-connection logic lives here ────────────────
  const {
    callState,
    connStatus,
    isMuted,
    callError,
    remoteAudioRef,
    startCall,
    endCall,
    acceptCall,
    rejectCall,
    toggleMic,
    handleSignal,
    teardownCall,
  } = useWebRTC({ tripId: id, myEmployeeId: user.employeeId, emitSignal });

  /* ── Load trip ── */
  const loadTrip = useCallback(async () => {
    const { data } = await api.get(`/trips/${id}`);
    setTrip(data.trip);
    setPayment(data.payment);
    if (data.lastPing) setVehiclePos({ lat: +data.lastPing.latitude, lng: +data.lastPing.longitude });
  }, [id]);

  useEffect(() => {
    loadTrip().catch((e) => setError(apiError(e)));
    api.get(`/trips/${id}/messages`).then(({ data }) => setMessages(data.messages)).catch(() => { });
  }, [id, loadTrip]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  /* ── Compute ETA whenever vehicle or destination changes ── */
  useEffect(() => {
    if (!vehiclePos || !trip) { setEta(null); return; }
    const dest = { lat: +trip.destination_lat, lng: +trip.destination_lng };
    const distKm = haversineKm(vehiclePos, dest);
    // Assume average 30 km/h in urban traffic
    const minutes = Math.max(1, Math.round((distKm / 30) * 60));
    setEta({ distKm: distKm.toFixed(1), minutes });
  }, [vehiclePos, trip]);

  /* ── My own live location (both driver & passenger) ── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    myWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
    return () => {
      if (myWatchRef.current != null) navigator.geolocation.clearWatch(myWatchRef.current);
    };
  }, []);

  /* ── Socket wiring ── */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    const onLocation = (p) => setVehiclePos({ lat: p.lat, lng: p.lng });
    const onChat = (m) => setMessages((prev) => [...prev, m]);
    const onJoin = () => setPeerOnline(true);
    const onLeave = () => setPeerOnline(false);
    const onSignal = (msg) => handleSignal(msg);
    // peer:online is a lightweight ack the server sends back when the peer
    // is already in the room and we query them with presence:ping.
    const onPeerOnline = () => setPeerOnline(true);
    const onPeerOffline = () => setPeerOnline(false);

    // ── Register ALL listeners BEFORE joining the room ──────────────────
    // This is critical: the server emits presence:join synchronously inside
    // the trip:join handler (if a peer is already present). If we call
    // joinRoom() first and register listeners after, we miss that event.
    socket.on('location:update', onLocation);
    socket.on('chat:new', onChat);
    socket.on('presence:join', onJoin);
    socket.on('presence:leave', onLeave);
    socket.on('call:signal', onSignal);
    socket.on('peer:online', onPeerOnline);
    socket.on('peer:offline', onPeerOffline);

    const joinRoom = () => {
      console.log('[TripDetail] joinRoom() called | socket.connected:', socket.connected, '| id:', socket.id);
      setPeerOnline(false);
      // If socket is disconnected, reconnect first, then join on the connect event.
      if (!socket.connected) {
        console.log('[TripDetail] socket disconnected — calling socket.connect()');
        socket.connect();
        return; // the 'connect' listener below will call joinRoom again
      }
      socket.emit('trip:join', id, (res) => {
        console.log('[TripDetail] trip:join ack →', JSON.stringify(res));
        if (res?.ok === false) {
          setError(res.error);
        } else if (res?.ok) {
          setPeerOnline(!!res.peerOnline);
          setTimeout(() => {
            console.log('[TripDetail] sending presence:ping for tripId:', id);
            socket.emit('presence:ping', id);
          }, 1000);
        }
      });
    };
    // Expose joinRoom so the manual reconnect button can trigger it.
    joinRoomRef.current = joinRoom;

    // Join immediately if already connected.
    if (socket.connected) joinRoom();

    // Re-join the trip room on every reconnection (network blip, server restart, etc.)
    socket.on('connect', joinRoom);

    return () => {
      // Remove all listeners for this component instance on unmount.
      socket.off('connect', joinRoom);
      socket.off('location:update', onLocation);
      socket.off('chat:new', onChat);
      socket.off('presence:join', onJoin);
      socket.off('presence:leave', onLeave);
      socket.off('call:signal', onSignal);
      socket.off('peer:online', onPeerOnline);
      socket.off('peer:offline', onPeerOffline);
      socket.emit('trip:leave', id);
      stopLocationWatch();
      // Clean up the WebRTC call if the user navigates away mid-call.
      teardownCall(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ── Driver broadcasts GPS while trip is live ── */
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
          tripId: id,
          lat: latitude,
          lng: longitude,
          speed: speed != null ? +(speed * 3.6).toFixed(1) : null,
          heading: heading != null ? Math.round(heading) : null,
        });
      },
      () => { },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }
  function stopLocationWatch() {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }

  /* ── Trip lifecycle ── */
  const advance = async (status) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/trips/${id}/status`, { status });
      setTrip((t) => ({ ...t, ...data.trip }));
      if (status === 'COMPLETED') await loadTrip();
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  /* ── Chat ── */
  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socketRef.current?.emit('chat:send', { tripId: id, text }, (res) => {
      if (res?.ok) setMessages((prev) => [...prev, res.message]);
    });
    setDraft('');
  };

  /* ── WebRTC voice call: all logic is in useWebRTC hook (see hooks/useWebRTC.js) ── */

  /* ── Payment ── */
  const pay = async (method) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/payments/pay', { tripId: id, method });
      setPayment(data.payment);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  if (!trip) return <Spinner label={error || 'Loading trip…'} />;

  const peer = iAmDriver
    ? { name: trip.passenger_name, phone: trip.passenger_phone, role: 'Passenger' }
    : { name: trip.driver_name, phone: trip.driver_phone, role: 'Driver' };
  const showPay = !iAmDriver && payment && payment.status === 'PENDING';
  const isLive = ['STARTED', 'IN_PROGRESS'].includes(trip.status);

  /* Status badge label with ETA */
  const trackingLabel = isLive
    ? trip.status === 'IN_PROGRESS'
      ? `Trip in progress${eta ? ` · ~${eta.minutes} min to dest (${eta.distKm} km)` : ''}`
      : `Heading to pickup`
    : `${trip.distance_km} km route`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/app/trips"
          className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-ink-600 transition hover:text-brand-dark"
        >
          <ArrowLeft className="h-4 w-4" /> Back to trips
        </Link>
        <Badge status={trip.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Left: map + details ── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Live tracking map */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink-800">Live tracking</span>
                {isLive && (
                  <span className="flex items-center gap-1.5 rounded-lg bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand-dark ring-1 ring-brand/25">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                    LIVE
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-ink-500">{trackingLabel}</span>
            </div>
            <MapView
              pickup={{ lat: +trip.pickup_lat, lng: +trip.pickup_lng, address: trip.pickup_address }}
              destination={{ lat: +trip.destination_lat, lng: +trip.destination_lng, address: trip.destination_address }}
              routeGeometry={trip.route_polyline}
              vehicle={isLive ? vehiclePos : null}
              myLocation={!iAmDriver ? myLocation : null}
              height={360}
              follow={isLive}
              liveTrip={isLive}
            />
          </Card>

          {/* ETA banner when live */}
          {isLive && eta && (
            <div className="glass flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand ring-1 ring-brand/20">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <div className="font-bold text-ink-800">
                  ~{eta.minutes} min estimated arrival
                </div>
                <div className="text-xs text-ink-500">{eta.distKm} km remaining to destination</div>
              </div>
              <div className="ml-auto font-mono text-[11px] text-ink-400">
                {vehiclePos ? `Car at ${vehiclePos.lat.toFixed(4)}, ${vehiclePos.lng.toFixed(4)}` : ''}
              </div>
            </div>
          )}

          {/* Trip details */}
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 border-b border-white/60 pb-3 font-bold text-ink-800"><Route className="h-4 w-4 text-brand" /> Trip details</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
                <Button onClick={() => advance(NEXT[trip.status])} disabled={busy}>
                  {NEXT_LABEL[trip.status]}
                </Button>
              </div>
            )}
            {!iAmDriver && trip.status === 'BOOKED' && (
              <p className="mt-4 rounded-xl bg-brand/[0.08] px-3.5 py-2.5 text-sm font-medium text-brand-dark">
                Waiting for the driver to start the trip.
              </p>
            )}
            {error && <div className="mt-3"><Alert variant="error">{error}</Alert></div>}
          </Card>

          {/* Payment */}
          {(showPay || payment?.status === 'COMPLETED') && (
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 border-b border-white/60 pb-3 font-bold text-ink-800"><Banknote className="h-4 w-4 text-brand" /> Payment</h2>
              {payment.status === 'COMPLETED' ? (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-200/70">
                  <CircleCheck className="h-6 w-6 shrink-0 text-emerald-500" strokeWidth={1.9} />
                  <div>
                    <p className="font-bold text-emerald-700">
                      Paid {money(payment.amount)} via {payment.payment_method}
                    </p>
                    {payment.payment_gateway_ref && (
                      <p className="mt-0.5 font-mono text-xs text-emerald-600">
                        Ref: {payment.payment_gateway_ref}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-brand/[0.08] px-4 py-3 ring-1 ring-brand/15">
                    <span className="text-sm font-semibold text-ink-600">Amount due</span>
                    <span className="text-xl font-extrabold text-brand-dark">{money(payment.amount)}</span>
                  </div>

                  {/* ── Primary: Razorpay checkout + QR ── */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    <RazorpayButton
                      tripId={trip.trip_id}
                      amount={payment.amount}
                      disabled={busy}
                      onSuccess={(p) => { setPayment(p); }}
                      onError={(msg) => setError(msg)}
                    />
                    <button
                      onClick={() => setShowQR(true)}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand-dark backdrop-blur-sm transition hover:bg-brand/20 active:scale-95 disabled:opacity-50"
                    >
                      <QrCode className="h-4 w-4" /> Show QR Code
                    </button>
                  </div>

                  {/* ── Divider ── */}
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/70" />
                    </div>
                    <div className="relative flex justify-center text-xs font-semibold text-ink-400">
                      <span className="rounded-full bg-white/70 px-3 py-0.5 backdrop-blur-sm">or pay manually</span>
                    </div>
                  </div>

                  {/* ── Fallback: manual methods ── */}
                  <div className="flex flex-wrap gap-2">
                    {['CASH', 'UPI', 'WALLET'].map((m) => (
                      <Button key={m} variant="outline" onClick={() => pay(m)} disabled={busy}>
                        {m === 'CASH' ? <Banknote className="h-4 w-4" /> : m === 'UPI' ? <Smartphone className="h-4 w-4" /> : <WalletMinimal className="h-4 w-4" />}{' '}{m}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>

        {/* ── Right: chat + call ── */}
        <div className="space-y-5">
          <Card className="flex h-[520px] flex-col">
            <div className="flex items-center justify-between border-b border-white/60 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-ink-800">{peer.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-ink-400">
                  {peerOnline
                    ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                  {peer.role} · {peerOnline ? 'online' : 'offline'}
                  {/* Manual reconnect — tap if peer shows offline but both are on the page */}
                  <button
                    onClick={() => joinRoomRef.current?.()}
                    className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/10 transition"
                    title="Re-join the room to refresh connection status"
                  >
                    ↺ Reconnect
                  </button>
                </div>
              </div>
              {/* Call button — show when idle; disabled only when peer is definitively offline */}
              {callState === 'idle' && (
                <Button
                  variant="subtle"
                  onClick={startCall}
                  title={peerOnline ? 'Start a voice call' : 'Peer appears offline — call may not connect'}
                >
                  <Phone className="h-4 w-4" /> Call
                </Button>
              )}
              {/* Active call status badge in header */}
              {callState === 'calling' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Calling…
                </span>
              )}
              {callState === 'connected' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> In call
                </span>
              )}
              {callState === 'incoming' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-dark ring-1 ring-brand/20">
                  <Phone className="h-3.5 w-3.5" /> Incoming…
                </span>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="pt-6 text-center text-xs text-ink-400">No messages yet. Start the conversation.</p>
              )}
              {messages.map((m) => {
                const mine = m.sender_employee_id === user.employeeId;
                if (m.message_type === 'CALL_LOG') {
                  return (
                    <div key={m.message_id} className="text-center text-[11px] text-ink-400">
                      — {m.message_text} —
                    </div>
                  );
                }
                return (
                  <div key={m.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine
                        ? 'bg-gradient-to-br from-brand to-brand-dark text-white ring-1 ring-white/20'
                        : 'border border-white/60 bg-white/70 text-ink-700 backdrop-blur-sm'
                      }`}>
                      {m.message_text}
                      <div className={`mt-0.5 text-[10px] ${mine ? 'text-white/70' : 'text-ink-400'}`}>
                        {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEnd} />
            </div>

            <form onSubmit={send} className="flex gap-2 border-t border-white/60 p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="glass-input flex-1 rounded-xl px-3.5 py-2 text-sm text-ink-800 placeholder:text-ink-400 outline-none transition-all"
              />
              <Button type="submit">Send</Button>
            </form>
          </Card>
        </div>
      </div>

      {showQR && (
        <RazorpayQR
          tripId={trip.trip_id}
          amount={payment.amount}
          onSuccess={(p) => {
            setPayment(p);
            setShowQR(false);
          }}
          onClose={() => setShowQR(false)}
        />
      )}

      {/* ── Audio call overlay — renders as a full-screen modal when call is active ── */}
      <AudioCallOverlay
        callState={callState}
        connStatus={connStatus}
        peerName={peer.name}
        peerRole={peer.role}
        isMuted={isMuted}
        callError={callError}
        remoteAudioRef={remoteAudioRef}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMic={toggleMic}
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0 pr-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-0.5 truncate font-semibold text-ink-700" title={value}>{value}</div>
    </div>
  );
}
