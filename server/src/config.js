import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  enableRls: String(process.env.ENABLE_RLS || 'false').toLowerCase() === 'true',
  geo: {
    // Photon (Komoot) — free, keyless, permissive; ideal for autocomplete.
    photonUrl: process.env.PHOTON_URL || 'https://photon.komoot.io',
    // Nominatim kept as an optional fallback (needs a valid contact UA).
    nominatimUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
    osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
    userAgent: process.env.GEO_USER_AGENT || 'coryd-hackathon/1.0',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  },
};

export default config;
