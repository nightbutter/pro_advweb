import { Router } from 'express';
import { db, SHOP_LOCATION } from '../database/connection';
import { RouteOptimizerService } from '../services/routeOptimizer';
import { Order, Rider } from '../models/types';

export const routingRouter = Router();
const optimizer = new RouteOptimizerService();

// State caching the latest plan
let latestPlan: any = null;

// POST /api/routes/optimize - Run or re-calculate route optimization
routingRouter.post('/optimize', (req, res) => {
  try {
    const seed = Number(req.body.seed) || 0;

    // Fetch all current orders with customer coordinates
    const orders = db.prepare(`
      SELECT 
        o.id,
        o.orderNumber,
        o.customerId,
        o.boxCount,
        o.orderTime,
        o.status,
        c.name as customerName,
        c.phone as customerPhone,
        c.address as customerAddress,
        c.lat,
        c.lng
      FROM orders o
      JOIN customers c ON o.customerId = c.id
      ORDER BY o.id ASC
    `).all() as Order[];

    const riders = db.prepare('SELECT * FROM riders ORDER BY id ASC').all() as Rider[];

    const plan = optimizer.optimize(orders, riders, SHOP_LOCATION, seed);
    latestPlan = plan;

    // Persist assignments back to orders table
    const updateOrder = db.prepare(`
      UPDATE orders
      SET assignedRiderId = ?, deliverySequence = ?, status = 'assigned'
      WHERE id = ?
    `);

    const persistAssignments = db.transaction(() => {
      for (const route of plan.routes) {
        for (const ord of route.orders) {
          updateOrder.run(route.riderId, ord.deliverySequence, ord.id);
        }
      }
    });
    persistAssignments();

    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/routes/current - Get current optimized plan
routingRouter.get('/current', (req, res) => {
  try {
    if (!latestPlan) {
      // Generate initial plan automatically if not generated yet
      const orders = db.prepare(`
        SELECT 
          o.id,
          o.orderNumber,
          o.customerId,
          o.boxCount,
          o.orderTime,
          o.status,
          c.name as customerName,
          c.phone as customerPhone,
          c.address as customerAddress,
          c.lat,
          c.lng
        FROM orders o
        JOIN customers c ON o.customerId = c.id
        ORDER BY o.id ASC
      `).all() as Order[];

      const riders = db.prepare('SELECT * FROM riders ORDER BY id ASC').all() as Rider[];
      latestPlan = optimizer.optimize(orders, riders, SHOP_LOCATION, 0);
    }
    res.json(latestPlan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/routes/rider/:jobCodeOrId - Rider view specific route by ID or job code
routingRouter.get('/rider/:jobCodeOrId', (req, res) => {
  try {
    const param = req.params.jobCodeOrId.trim();
    let riderId = parseInt(param, 10);

    if (isNaN(riderId)) {
      const match = param.match(/\d+/);
      if (match) {
        riderId = parseInt(match[0], 10);
      }
    }

    if (!latestPlan) {
      // Initialize if needed
      const orders = db.prepare(`
        SELECT 
          o.id,
          o.orderNumber,
          o.customerId,
          o.boxCount,
          o.orderTime,
          o.status,
          c.name as customerName,
          c.phone as customerPhone,
          c.address as customerAddress,
          c.lat,
          c.lng
        FROM orders o
        JOIN customers c ON o.customerId = c.id
        ORDER BY o.id ASC
      `).all() as Order[];

      const riders = db.prepare('SELECT * FROM riders ORDER BY id ASC').all() as Rider[];
      latestPlan = optimizer.optimize(orders, riders, SHOP_LOCATION, 0);
    }

    const route = latestPlan.routes.find((r: any) => r.riderId === riderId);
    if (!route) {
      return res.status(404).json({ error: `ไม่พบใบงานสำหรับไรเดอร์หมายเลข ${param}` });
    }

    res.json({
      shopLocation: latestPlan.shopLocation,
      route
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
