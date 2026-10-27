import express from 'express';
import cors from 'cors';
import { initDatabase } from './dbconnect';
import { requireAuth, requireRole } from './jwtauth';
import { router as index } from './controller/index';
import { router as auth } from './controller/auth';
import { router as customers } from './controller/customers';
import { router as orders } from './controller/orders';
import { router as riders } from './controller/riders';
import { router as routes } from './controller/routes';

export const app = express();

// Only allow known frontends. Set CORS_ORIGINS as a comma-separated list on Vercel.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4200')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

// Database readiness gate.
// The promise always resolves (never rejects), so a failed init can never
// become an unhandled rejection. On failure the promise resets so the next
// request retries initialization (e.g. after transient DB unavailability).
let initPromise: Promise<boolean> | null = null;

export function ensureDb(): Promise<boolean> {
  if (!initPromise) {
    initPromise = initDatabase()
      .then(() => true)
      .catch((err) => {
        console.error('Failed to initialize database:', err.message);
        initPromise = null;
        return false;
      });
  }
  return initPromise;
}

app.use((req, res, next) => {
  ensureDb().then((ok) => {
    if (!ok) {
      return res.status(503).json({ error: 'Database initialization failed' });
    }
    next();
  });
});

// Public endpoints
app.use('/', index);
app.use('/api/auth', auth);

// Everything below requires a valid token
app.use('/api', requireAuth);

// Admin only
app.use('/api/customers', requireRole('admin'), customers);
app.use('/api/orders', requireRole('admin'), orders);

// Admin + rider (per-rider checks happen inside the routers)
app.use('/api/riders', requireRole('admin', 'rider'), riders);
app.use('/api/routes', requireRole('admin', 'rider'), routes);

// Vercel ใช้ app ที่ export ออกไปเป็น serverless function
export default app;
