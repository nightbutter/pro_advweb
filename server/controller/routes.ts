import express from 'express';
import { query, transaction, SHOP_LOCATION } from '../dbconnect';
import { RouteOptimizerService } from '../services/route-optimizer';
import { Order } from '../model/order';
import { Rider } from '../model/rider';
import { requireRole, canAccessRider, sendServerError } from '../jwtauth';

export const router = express.Router();
const optimizer = new RouteOptimizerService();

// State caching the latest plan
let latestPlan: any = null;

const ORDER_WITH_CUSTOMER = `
  SELECT
    o.id,
    o."orderNumber",
    o."customerId",
    o."boxCount",
    o."orderTime",
    o.status,
    c.name as "customerName",
    c.phone as "customerPhone",
    c.address as "customerAddress",
    c.zone,
    c.lat,
    c.lng
  FROM orders o
  JOIN customers c ON o."customerId" = c.id
  ORDER BY o.id ASC
`;

async function loadOrdersAndRiders(): Promise<{ orders: Order[]; riders: Rider[] }> {
  const { rows: orders } = await query<Order>(ORDER_WITH_CUSTOMER);
  const { rows: riders } = await query<Rider>('SELECT * FROM riders ORDER BY id ASC');
  return { orders, riders };
}

// POST /api/routes/optimize - Run or re-calculate route optimization
router.post('/optimize', requireRole('admin'), async (req, res) => {
  try {
    const seed = Number(req.body?.seed) || 0;
    const { orders, riders } = await loadOrdersAndRiders();

    const plan = optimizer.optimize(orders, riders, SHOP_LOCATION, seed);
    latestPlan = plan;

    // Persist assignments back to orders table
    await transaction(async (client) => {
      for (const route of plan.routes) {
        for (const ord of route.orders) {
          await client.query(
            `UPDATE orders
             SET "assignedRiderId" = $1, "deliverySequence" = $2, status = 'assigned'
             WHERE id = $3`,
            [route.riderId, ord.deliverySequence, ord.id]
          );
        }
      }
    });

    res.json(plan);
  } catch (error) {
    sendServerError(res, error);
  }
});

// GET /api/routes/current - Get current optimized plan
router.get('/current', requireRole('admin'), async (req, res) => {
  try {
    if (!latestPlan) {
      // Generate initial plan automatically if not generated yet
      const { orders, riders } = await loadOrdersAndRiders();
      latestPlan = optimizer.optimize(orders, riders, SHOP_LOCATION, 0);
    }
    res.json(latestPlan);
  } catch (error) {
    sendServerError(res, error);
  }
});

// GET /api/routes/rider/:jobCodeOrId - Rider view specific route by ID or job code
router.get('/rider/:jobCodeOrId', async (req, res) => {
  try {
    const param = req.params.jobCodeOrId.trim();
    let riderId = parseInt(param, 10);

    if (isNaN(riderId)) {
      const match = param.match(/\d+/);
      if (match) {
        riderId = parseInt(match[0], 10);
      }
    }

    if (isNaN(riderId)) {
      return res.status(400).json({ error: 'หมายเลขใบงานไม่ถูกต้อง' });
    }

    if (!canAccessRider(req.user, riderId)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูใบงานของไรเดอร์คนอื่น' });
    }

    if (!latestPlan) {
      // Initialize if needed
      const { orders, riders } = await loadOrdersAndRiders();
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
  } catch (error) {
    sendServerError(res, error);
  }
});
