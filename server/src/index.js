import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';

import config from './config.js';
import { healthCheck } from './db.js';
import { ApiError } from './utils/http.js';
import { registerSockets } from './sockets/index.js';

import authRoutes from './routes/auth.js';
import vehicleRoutes from './routes/vehicles.js';
import savedPlaceRoutes from './routes/savedPlaces.js';
import geoRoutes from './routes/geo.js';
import rideRoutes from './routes/rides.js';
import bookingRoutes from './routes/bookings.js';
import tripRoutes from './routes/trips.js';
import paymentRoutes from './routes/payments.js';
import walletRoutes from './routes/wallet.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, db: await healthCheck(), time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/saved-places', savedPlaceRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

// 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  if (err?.code === '23505') return res.status(409).json({ error: 'Duplicate value violates a unique constraint' });
  if (err?.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: config.clientOrigin, credentials: true },
});
registerSockets(io);

server.listen(config.port, () => {
  console.log(`\n🚗 Carpool API + realtime listening on http://localhost:${config.port}`);
  console.log(`   CORS origin: ${config.clientOrigin}`);
  console.log(`   RLS enforcement: ${config.enableRls ? 'ON' : 'OFF (app-layer scoping)'}\n`);
});

export { app, io };
