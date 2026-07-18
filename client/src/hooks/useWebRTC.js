/**
 * useWebRTC — Audio-only 1-to-1 WebRTC calling hook for CoRYD
 *
 * ──────────────────────────────────────────────────────────────
 * HOW WEBRTC CALLING WORKS (step-by-step):
 *
 *  CALLER SIDE                          CALLEE SIDE
 *  ──────────                           ───────────
 *  1. getUserMedia({ audio: true })
 *  2. new RTCPeerConnection(iceConfig)
 *  3. addTrack(audioTrack) to PC
 *  4. createOffer()  ─────────────────► receive 'offer' signal
 *  5. setLocalDescription(offer)        setRemoteDescription(offer)
 *  6. [ICE gathering starts]            getUserMedia({ audio: true })
 *  7. emit 'offer' via socket           addTrack(audioTrack)
 *                                       createAnswer()
 *  8. receive 'answer' signal  ◄──────  setLocalDescription(answer)
 *  9. setRemoteDescription(answer)      emit 'answer' via socket
 * 10. exchange ICE candidates ◄────────► exchange ICE candidates
 * 11. ontrack fires on both sides — audio flows P2P!
 * ──────────────────────────────────────────────────────────────
 *
 * GLARE HANDLING:
 *   If both users click "Call" simultaneously, both sides receive
 *   an 'invite'. We use the lexicographic order of employeeId to
 *   break the tie: the lower employeeId becomes the canonical
 *   caller; the other resets to 'incoming'.
 *
 * CLEANUP:
 *   stopAllTracks() + pc.close() + nulls all refs.
 *   Called on: endCall, rejectCall, connection failure, unmount.
 */

import { useRef, useState, useCallback } from 'react';

// ── ICE Server Configuration ──────────────────────────────────────────────────
// STUN: helps punch through symmetric NAT on most corporate/home networks.
// TURN: fallback relay when direct P2P is impossible (strict firewalls).
//       Uncomment and fill in credentials when you provision a TURN server
//       (e.g. from Twilio Network Traversal Service or self-hosted coturn).
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },

    // ── TURN placeholder — plug in credentials here ──────────────────
    // {
    //   urls:       'turn:your-turn-server.example.com:3478',
    //   username:   'YOUR_TURN_USERNAME',
    //   credential: 'YOUR_TURN_CREDENTIAL',
    // },
  ],
};

/**
 * @param {object}   opts
 * @param {string}   opts.tripId       — current trip ID (used to scope signals)
 * @param {string}   opts.myEmployeeId — logged-in user's employeeId (for glare handling)
 * @param {Function} opts.emitSignal   — fn(type, data?) to emit a 'call:signal' socket event
 */
export function useWebRTC({ tripId, myEmployeeId, emitSignal }) {
  // ── Call state machine ────────────────────────────────────────────────────
  // idle → calling  (we initiated, waiting for peer to accept)
  // idle → incoming (peer initiated, waiting for us to accept/reject)
  // calling/incoming → connected (both sides have audio)
  // connected → idle (call ended by either side)
  const [callState, setCallState] = useState('idle');       // idle|calling|incoming|connected
  const [connStatus, setConnStatus] = useState('idle');       // idle|connecting|connected|reconnecting|failed
  const [isMuted, setIsMuted] = useState(false);
  const [callError, setCallError] = useState('');

  // Refs — we use refs (not state) for PC + stream so closures always see the latest instance.
  const pcRef          = useRef(null);   // RTCPeerConnection
  const localStreamRef = useRef(null);   // MediaStream from getUserMedia
  const remoteAudioRef = useRef(null);   // <audio> element ref (passed in from component)
  const pendingOffer   = useRef(null);   // SDP offer buffered while we wait for user to accept
  const callerIdRef    = useRef(null);   // employeeId of the person who sent the 'invite'
  const pendingIceCandidates = useRef([]); // ICE candidates queued before remoteDescription is set

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Request microphone access.
   * Throws a human-readable error on permission denied or no device found.
   */
  async function getMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission denied. Please allow mic access and try again.');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No microphone found. Please plug in a mic and try again.');
      }
      throw new Error('Could not access microphone: ' + err.message);
    }
  }

  /**
   * Create a fresh RTCPeerConnection and wire up its event handlers.
   *
   * The three key events:
   *  - onicecandidate: fired as the browser discovers ICE candidates (network paths).
   *    We relay each candidate to the peer via socket so they can try connecting.
   *  - ontrack: fired when the peer's audio track arrives — we pipe it to the <audio> element.
   *  - onconnectionstatechange: monitors the overall P2P connection health.
   */
  function createPeerConnection() {
    // Close any existing connection first (shouldn't normally happen, but guard against it).
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { }
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);

    // ── ICE candidate relay ──────────────────────────────────────────────
    // Each candidate represents a potential network path (host, srflx, relay).
    // We must relay them to the peer via the signaling server.
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Relay this candidate to the peer.
        emitSignal('ice', event.candidate);
      }
      // event.candidate === null means ICE gathering is complete — all candidates sent.
    };

    // ── Incoming remote audio track ──────────────────────────────────────
    // When the peer's audio arrives, attach it to the hidden <audio> element.
    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event received:', event);
      if (remoteAudioRef.current) {
        let stream;
        if (event.streams && event.streams[0]) {
          stream = event.streams[0];
        } else {
          console.log('[WebRTC] event.streams[0] missing, creating new MediaStream from track');
          stream = new MediaStream();
          stream.addTrack(event.track);
        }
        remoteAudioRef.current.srcObject = stream;
        // Explicitly trigger play() to bypass aggressive browser autoplay blocks
        remoteAudioRef.current.play().catch((err) => {
          console.error('[WebRTC] Error playing remote audio stream:', err);
        });
      }
    };

    // ── Connection state monitoring ──────────────────────────────────────
    // Tracks the overall ICE + DTLS connection lifecycle.
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connecting') setConnStatus('connecting');
      if (state === 'connected') setConnStatus('connected');
      if (state === 'disconnected') setConnStatus('reconnecting');
      if (state === 'failed') { setConnStatus('failed'); teardownCall(true); }
      if (state === 'closed') setConnStatus('idle');
    };

    // ── ICE connection state (more granular than connectionState) ────────
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallState('connected');
        setConnStatus('connected');
      }
      if (pc.iceConnectionState === 'disconnected') {
        setConnStatus('reconnecting');
      }
      if (pc.iceConnectionState === 'failed') {
        setConnStatus('failed');
        teardownCall(true);
      }
    };

    pcRef.current = pc;
    return pc;
  }

  /**
   * Flush any buffered ICE candidates that arrived before the remote description was set.
   */
  const flushIceCandidates = useCallback(async () => {
    if (!pcRef.current || !pcRef.current.remoteDescription) return;
    console.log(`[WebRTC] Applying ${pendingIceCandidates.current.length} buffered ICE candidates`);
    const candidates = [...pendingIceCandidates.current];
    pendingIceCandidates.current = [];
    for (const candidate of candidates) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Failed to add buffered ICE candidate:', err);
      }
    }
  }, []);

  /**
   * Tear down the peer connection and release all media resources.
   * This is always safe to call — it guards against null refs.
   *
   * @param {boolean} notifyPeer — if true, emit 'end' signal to let the peer know.
   */
  const teardownCall = useCallback((notifyPeer = false) => {
    if (notifyPeer) {
      emitSignal('end', null);
    }

    // Stop all local audio tracks to release the microphone.
    // Without this, the browser keeps the mic open (red dot stays on tab).
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    // Close the peer connection to release ICE agents and socket ports.
    try { pcRef.current?.close(); } catch { }
    pcRef.current = null;

    // Clear any buffered offer from an incoming call we didn't accept yet.
    pendingOffer.current = null;
    callerIdRef.current = null;
    pendingIceCandidates.current = [];

    // Reset all state.
    setCallState('idle');
    setConnStatus('idle');
    setIsMuted(false);
    setCallError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitSignal]);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * STEP 1 (CALLER): Initiate a call.
   *
   * Flow:
   *   1. Send 'invite' signal to let the peer know we're calling.
   *   2. Request microphone access.
   *   3. Create RTCPeerConnection and add audio tracks.
   *   4. createOffer() → produces an SDP blob describing our audio capabilities.
   *   5. setLocalDescription(offer) → starts ICE gathering on our side.
   *   6. Send the offer SDP to the peer via socket.
   */
  const startCall = useCallback(async () => {
    if (callState !== 'idle') return;
    setCallError('');
    try {
      setCallState('calling');
      setConnStatus('connecting');

      // Step 1: Notify the peer that we're calling (shows their incoming call UI).
      emitSignal('invite', null);

      // Step 2: Get microphone access.
      const stream = await getMic();

      // Step 3: Create the peer connection.
      const pc = createPeerConnection();

      // Add each audio track to the peer connection.
      // This tells the PC "I want to send this audio to the remote peer".
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Step 4: createOffer() negotiates what we can send/receive (codecs, etc.)
      const offer = await pc.createOffer();

      // Step 5: setLocalDescription() kicks off ICE candidate gathering.
      await pc.setLocalDescription(offer);

      // Step 6: Send the offer SDP to the peer.
      emitSignal('offer', offer);
    } catch (err) {
      setCallError(err.message || 'Could not start call');
      teardownCall(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, emitSignal, teardownCall]);

  /**
   * STEP 2 (CALLEE): Accept an incoming call.
   *
   * Flow:
   *   1. Request microphone access.
   *   2. Create RTCPeerConnection (or reuse the one created when offer arrived).
   *   3. Add our audio tracks.
   *   4. setRemoteDescription(pendingOffer) → tells PC what the caller supports.
   *   5. createAnswer() → produces our SDP response.
   *   6. setLocalDescription(answer) → starts our ICE gathering.
   *   7. Send the answer SDP back to the caller.
   */
  const acceptCall = useCallback(async () => {
    if (!pendingOffer.current) return;
    setCallError('');
    try {
      // Step 1: Get microphone access.
      const stream = await getMic();

      // Step 2: Use existing PC (created when we received the offer) or create a new one.
      const pc = pcRef.current || createPeerConnection();

      // Step 3: Add our audio tracks.
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Step 4: Apply the caller's SDP offer as the remote description.
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));

      // Flush any ICE candidates that were sent before we accepted the call.
      await flushIceCandidates();

      // Step 5: Create our answer SDP.
      const answer = await pc.createAnswer();

      // Step 6: Set our local description (starts ICE gathering on callee side).
      await pc.setLocalDescription(answer);

      // Step 7: Send the answer back to the caller.
      emitSignal('answer', answer);

      setCallState('connected');
      setConnStatus('connecting'); // will become 'connected' when ICE completes
    } catch (err) {
      setCallError(err.message || 'Could not accept call');
      teardownCall(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitSignal, teardownCall]);

  /** Reject an incoming call (callee declines). */
  const rejectCall = useCallback(() => {
    emitSignal('reject', null);
    teardownCall(false);
  }, [emitSignal, teardownCall]);

  /** End an active or outgoing call. */
  const endCall = useCallback(() => {
    teardownCall(true); // true → send 'end' signal to peer
  }, [teardownCall]);

  /**
   * Toggle microphone mute.
   * We use track.enabled instead of removing the track so ICE stays connected.
   * The peer hears silence (not a dropped stream) when muted.
   */
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  /**
   * Handle incoming signaling messages from the socket.
   * Called by TripDetail whenever a 'call:signal' event is received.
   *
   * @param {{ from: string, fromName: string, type: string, data: any }} msg
   */
  const handleSignal = useCallback(async (msg) => {
    const { from, type, data } = msg;

    switch (type) {
      // ── Incoming call invitation ─────────────────────────────────────
      case 'invite': {
        // GLARE HANDLING: both sides clicked "Call" at the same time.
        // The user with the lexically-lower employeeId becomes the canonical caller;
        // the other user resets to 'incoming' state.
        if (callState === 'calling') {
          const iAmCaller = myEmployeeId < from;
          if (iAmCaller) {
            // We win the tie-break — stay as caller, ignore this invite.
            return;
          } else {
            // We lose — tear down our outgoing attempt and become the callee.
            teardownCall(false);
          }
        }
        // Only show incoming if we're not already in a call.
        if (callState === 'idle' || callState === 'calling') {
          callerIdRef.current = from;
          setCallState('incoming');
        }
        break;
      }

      // ── Incoming SDP offer (from caller) ─────────────────────────────
      case 'offer': {
        // Buffer the offer — we'll apply it when the user clicks "Accept".
        pendingOffer.current = data;
        // Create the PC now (before user accepts) so it's ready immediately.
        if (!pcRef.current) createPeerConnection();
        // If not already showing incoming, show it now.
        if (callState !== 'connected') setCallState('incoming');
        break;
      }

      // ── Incoming SDP answer (from callee, sent back to caller) ───────
      case 'answer': {
        // Step 8 of the handshake: apply the callee's answer as remote description.
        // After this, ICE candidates will be exchanged and audio will flow.
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
          await flushIceCandidates();
        }
        break;
      }

      // ── ICE candidate from the peer ──────────────────────────────────
      case 'ice': {
        // Add the peer's ICE candidate to our connection.
        if (data) {
          if (pcRef.current && pcRef.current.remoteDescription) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(data));
            } catch (err) {
              console.error('[WebRTC] Error adding ICE candidate:', err);
            }
          } else {
            console.log('[WebRTC] Queuing ICE candidate until remote description is set');
            pendingIceCandidates.current.push(data);
          }
        }
        break;
      }

      // ── Call rejected by callee ──────────────────────────────────────
      case 'reject': {
        teardownCall(false);
        break;
      }

      // ── Call ended by either side (or synthetic 'end' from server on disconnect) ──
      case 'end': {
        teardownCall(false);
        break;
      }

      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, myEmployeeId, emitSignal, teardownCall]);

  return {
    // State
    callState,      // 'idle' | 'calling' | 'incoming' | 'connected'
    connStatus,     // 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
    isMuted,
    callError,

    // Refs
    remoteAudioRef, // attach to <audio autoPlay ref={remoteAudioRef} />

    // Actions
    startCall,
    endCall,
    acceptCall,
    rejectCall,
    toggleMic,
    handleSignal,   // call this from socket's 'call:signal' listener
    teardownCall,   // expose for unmount cleanup
  };
}
