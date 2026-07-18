import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) { socket.auth = { token }; socket.connect(); return socket; }

  socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
    auth: { token },
    autoConnect: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
