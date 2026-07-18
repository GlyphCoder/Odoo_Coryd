import { io } from 'socket.io-client';

let socket = null;

/**
 * Returns the singleton socket, creating it only once.
 * We never destroy the socket on reconnect — Socket.IO handles that internally.
 * The socket's autoConnect + reconnection options handle all reconnection logic.
 */
export function getSocket() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  // Return existing socket regardless of connection state.
  // Socket.IO's built-in reconnection will re-establish the connection automatically.
  // We update the auth token so reconnects use a fresh token.
  if (socket) {
    socket.auth = { token };
    return socket;
  }

  socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
