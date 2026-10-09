import express from 'express';
import cors from 'cors';
import { initDatabase } from './database/connection';
import { customerRouter } from './routes/customers';
import { orderRouter } from './routes/orders';
import { riderRouter } from './routes/riders';
import { routingRouter } from './routes/routing';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: allow the production frontend (and its Vercel preview deployments)
// plus local Angular dev origins. Extra origins can be added via FRONTEND_URL.
const allowedOrigins = [
  'https://pro-advweb.vercel.app',
  'http://localhost:4200',
  'http://127.0.0.1:4200'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
const vercelPreviewPattern = /^https:\/\/pro-advweb(-[a-z0-9-]+)?\.vercel\.app$/;

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // non-browser clients (curl, health checks)
    if (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// Initialize SQLite database schema and seed
initDatabase();

// API Endpoints
app.use('/api/customers', customerRouter);
app.use('/api/orders', orderRouter);
app.use('/api/riders', riderRouter);
app.use('/api/routes', routingRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // Vercel serverless can only write to /tmp — the SQLite file is not persistent.
    storage: process.env.VERCEL ? 'ephemeral' : 'file'
  });
});

// On Vercel the exported app is used as a serverless function, so only listen locally
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Smart Rider Backend running on http://localhost:${PORT}`);
  });
}

export default app;
