import express from 'express';
import cors from 'cors';
import { initDatabase } from './database/connection';
import { customerRouter } from './routes/customers';
import { orderRouter } from './routes/orders';
import { riderRouter } from './routes/riders';
import { routingRouter } from './routes/routing';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database schema and seed
initDatabase();

// API Endpoints
app.use('/api/customers', customerRouter);
app.use('/api/orders', orderRouter);
app.use('/api/riders', riderRouter);
app.use('/api/routes', routingRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// On Vercel the exported app is used as a serverless function, so only listen locally
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Smart Rider Backend running on http://localhost:${PORT}`);
  });
}

export default app;
