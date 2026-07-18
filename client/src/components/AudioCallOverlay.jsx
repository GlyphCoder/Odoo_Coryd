/**
 * AudioCallOverlay.jsx — Premium audio call UI for CoRYD
 *
 * Renders a full-screen glassmorphic overlay in three states:
 *   • incoming  → animated ring, caller name, Accept / Decline
 *   • calling   → pulsing avatar, "Calling…", Cancel
 *   • connected → timer, mic-mute toggle, End Call, connection status pill
 *
 * Usage:
 *   <AudioCallOverlay
 *     callState="incoming"         // 'idle'|'calling'|'incoming'|'connected'
 *     connStatus="connecting"      // 'connecting'|'connected'|'reconnecting'|'failed'
 *     peerName="John Driver"
 *     peerRole="Driver"
 *     isMuted={false}
 *     callError=""
 *     remoteAudioRef={remoteAudioRef}
 *     onAccept={acceptCall}
 *     onReject={rejectCall}
 *     onEnd={endCall}
 *     onToggleMic={toggleMic}
 *   />
 *
 * The overlay is only rendered when callState !== 'idle'.
 * We use CSS animations defined in index.css (no framer-motion dep).
 */

import { useEffect, useRef, useState } from 'react';

// ── Avatar helper ──────────────────────────────────────────────────────────
function CallAvatar({ name, size = 'lg' }) {
  const initials = (name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const sz = size === 'lg'
    ? 'h-24 w-24 text-3xl'
    : 'h-16 w-16 text-xl';

  return (
    <div
      className={`${sz} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-2xl`}
      style={{ background: 'linear-gradient(135deg, #16a34a 0%, #065f46 100%)' }}
    >
      {initials}
    </div>
  );
}

// ── Call duration timer ────────────────────────────────────────────────────
function CallTimer({ running }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!running) { setElapsed(0); startRef.current = null; return; }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return <span className="font-mono text-white/80 text-sm tabular-nums">{mm}:{ss}</span>;
}

// ── Connection status pill ────────────────────────────────────────────────
const STATUS_PILL = {
  connecting:   { color: 'bg-amber-400/20 text-amber-300 border-amber-400/30', dot: 'bg-amber-400 animate-pulse', label: 'Connecting…' },
  connected:    { color: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30', dot: 'bg-emerald-400', label: 'Connected' },
  reconnecting: { color: 'bg-orange-400/20 text-orange-300 border-orange-400/30', dot: 'bg-orange-400 animate-pulse', label: 'Reconnecting…' },
  failed:       { color: 'bg-rose-400/20 text-rose-300 border-rose-400/30', dot: 'bg-rose-400', label: 'Connection failed' },
  idle:         { color: 'bg-white/10 text-white/50 border-white/10', dot: 'bg-white/40', label: '' },
};

function StatusPill({ status }) {
  const { color, dot, label } = STATUS_PILL[status] ?? STATUS_PILL.idle;
  if (!label) return null;
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

// ── Control button ─────────────────────────────────────────────────────────
function CtrlBtn({ onClick, label, active, danger, icon }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={[
        'flex flex-col items-center gap-1.5 rounded-2xl px-5 py-3.5 text-xs font-semibold',
        'transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        danger
          ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-lg'
          : active
          ? 'bg-white/20 text-white hover:bg-white/30'
          : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white',
      ].join(' ')}
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ── Main overlay ───────────────────────────────────────────────────────────
export default function AudioCallOverlay({
  callState,
  connStatus,
  peerName,
  peerRole,
  isMuted,
  callError,
  remoteAudioRef,
  onAccept,
  onReject,
  onEnd,
  onToggleMic,
}) {
  return (
    <>
      {/* Hidden audio element — receives the remote peer's audio stream.
          We keep this mounted in the DOM at all times (even when callState === 'idle')
          so that it registers with the browser's autoplay permissions/context. */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Full-screen glassmorphic overlay */}
      {callState !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'linear-gradient(160deg, rgba(6,95,70,0.97) 0%, rgba(15,23,42,0.98) 60%, rgba(6,78,59,0.97) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Decorative ambient rings */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10"
              style={{
                width: 600, height: 600,
                background: 'radial-gradient(circle, #16a34a 0%, transparent 70%)',
                animation: callState === 'incoming' || callState === 'calling'
                  ? 'callPulseRing 2.2s ease-in-out infinite'
                  : 'none',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
              style={{
                width: 400, height: 400,
                background: 'radial-gradient(circle, #4ade80 0%, transparent 70%)',
                animation: callState === 'incoming' || callState === 'calling'
                  ? 'callPulseRing 2.2s ease-in-out infinite 0.7s'
                  : 'none',
              }}
            />
          </div>

          {/* Content card */}
          <div className="relative flex w-full max-w-sm flex-col items-center gap-6 px-6 text-center">

            {/* ── INCOMING STATE ─────────────────────────────────────── */}
            {callState === 'incoming' && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400/80">
                  Incoming Call
                </p>

                {/* Pulsing ring around avatar */}
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 120, height: 120,
                      background: 'rgba(22,163,74,0.2)',
                      animation: 'callPulseRing 1.6s ease-out infinite',
                    }}
                  />
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 140, height: 140,
                      background: 'rgba(22,163,74,0.10)',
                      animation: 'callPulseRing 1.6s ease-out infinite 0.4s',
                    }}
                  />
                  <CallAvatar name={peerName} size="lg" />
                </div>

                <div>
                  <p className="text-2xl font-bold text-white">{peerName}</p>
                  <p className="mt-1 text-sm text-white/60">{peerRole}</p>
                </div>

                {/* Accept / Decline */}
                <div className="flex gap-8">
                  <button
                    onClick={onReject}
                    className="flex flex-col items-center gap-2"
                  >
                    <span
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-3xl shadow-lg transition hover:bg-rose-500 active:scale-95"
                    >
                      📵
                    </span>
                    <span className="text-xs font-medium text-white/70">Decline</span>
                  </button>

                  <button
                    onClick={onAccept}
                    className="flex flex-col items-center gap-2"
                  >
                    <span
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl shadow-lg transition hover:bg-emerald-400 active:scale-95"
                      style={{ animation: 'callShake 0.7s ease-in-out infinite' }}
                    >
                      📞
                    </span>
                    <span className="text-xs font-medium text-white/70">Accept</span>
                  </button>
                </div>
              </>
            )}

            {/* ── CALLING STATE ──────────────────────────────────────── */}
            {callState === 'calling' && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                  Calling…
                </p>

                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 128, height: 128,
                      background: 'rgba(22,163,74,0.15)',
                      animation: 'callPulseRing 1.8s ease-in-out infinite',
                    }}
                  />
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 148, height: 148,
                      background: 'rgba(22,163,74,0.08)',
                      animation: 'callPulseRing 1.8s ease-in-out infinite 0.6s',
                    }}
                  />
                  <CallAvatar name={peerName} size="lg" />
                </div>

                <div>
                  <p className="text-2xl font-bold text-white">{peerName}</p>
                  <p className="mt-1 text-sm text-white/60">{peerRole}</p>
                  <p
                    className="mt-2 text-xs text-white/40"
                    style={{ animation: 'callDotBlink 1.4s step-start infinite' }}
                  >
                    Waiting for answer
                  </p>
                </div>

                <button
                  onClick={onEnd}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-3xl shadow-lg transition hover:bg-rose-500 active:scale-95">
                    📵
                  </span>
                  <span className="text-xs font-medium text-white/70">Cancel</span>
                </button>
              </>
            )}

            {/* ── CONNECTED STATE ─────────────────────────────────────── */}
            {callState === 'connected' && (
              <>
                <StatusPill status={connStatus} />

                <CallAvatar name={peerName} size="lg" />

                <div>
                  <p className="text-2xl font-bold text-white">{peerName}</p>
                  <p className="mt-1 text-sm text-white/60">{peerRole}</p>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <CallTimer running={callState === 'connected'} />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4">
                  <CtrlBtn
                    onClick={onToggleMic}
                    label={isMuted ? 'Unmute' : 'Mute'}
                    active={isMuted}
                    icon={isMuted ? '🔇' : '🎤'}
                  />
                  <CtrlBtn
                    onClick={onEnd}
                    label="End Call"
                    danger
                    icon="📵"
                  />
                </div>

                {/* Muted indicator */}
                {isMuted && (
                  <p className="text-xs text-amber-400/80">
                    🔇 Your microphone is muted — the other person cannot hear you.
                  </p>
                )}
              </>
            )}

            {/* Error message (shown in any state) */}
            {callError && (
              <div className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
                ⚠ {callError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS keyframes for the animations (injected via <style> tag) */}
      <style>{`
        @keyframes callPulseRing {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(1.7);  opacity: 0; }
        }
        @keyframes callShake {
          0%, 100% { transform: rotate(0deg); }
          20%       { transform: rotate(-15deg); }
          40%       { transform: rotate(15deg); }
          60%       { transform: rotate(-10deg); }
          80%       { transform: rotate(10deg); }
        }
        @keyframes callDotBlink {
          0%   { opacity: 1; }
          33%  { opacity: 0.4; }
          66%  { opacity: 0.8; }
          100% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
