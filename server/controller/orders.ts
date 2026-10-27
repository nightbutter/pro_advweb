import express from 'express';
import { sendServerError } from '../jwtauth';
import { query, transaction } from '../dbconnect';
import { Order } from '../model/order';

export const router = express.Router();

const SIMULATE_LOCK_KEY = 727202;

const ORDER_WITH_CUSTOMER = `
  SELECT
    o.id,
    o."orderNumber",
    o."customerId",
    o."boxCount",
    o."orderTime",
    o.status,
    o."assignedRiderId",
    o."deliverySequence",
    c.name as "customerName",
    c.phone as "customerPhone",
    c.address as "customerAddress",
    c.zone,
    c.lat,
    c.lng
  FROM orders o
  JOIN customers c ON o."customerId" = c.id
`;

// GET all orders with customer details
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`${ORDER_WITH_CUSTOMER} ORDER BY o.id ASC`);
    res.json(rows);
  } catch (error) {
    sendServerError(res, error);
  }
});

// CREATE single order
router.post('/', async (req, res) => {
  try {
    const { customerId, boxCount }: { customerId: number; boxCount: number } = req.body;
    if (!customerId || !boxCount || boxCount < 1 || boxCount > 3) {
      return res.status(400).json({ error: 'Valid customerId and boxCount (1-3) are required' });
    }
    if (!(await query('SELECT 1 FROM customers WHERE id = $1', [customerId])).rows.length) {
      return res.status(400).json({ error: 'Valid customerId and boxCount (1-3) are required' });
    }

    // Concurrency-safe orderNumber: sequence value is unique even under
    // parallel inserts (COUNT(*)-based numbering could collide -> 23505).
    const seqResult = await query<{ seq: string }>(
      `SELECT nextval('order_number_seq') AS seq`
    );
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${String(seqResult.rows[0].seq).padStart(2, '0')}`;
    // 'HH:MM:SS' in server local time (same format as the pre-migration API)
    const orderTime = new Date().toTimeString().slice(0, 8);

    const inserted = await query<{ id: number }>(
      `INSERT INTO orders ("orderNumber", "customerId", "boxCount", "orderTime", status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [orderNumber, customerId, boxCount, orderTime]
    );

    const { rows } = await query(
      `${ORDER_WITH_CUSTOMER} WHERE o.id = $1`,
      [inserted.rows[0].id]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendServerError(res, error);
  }
});

// UPDATE order
router.put('/:id', async (req, res) => {
  try {
    const { boxCount, customerId }: { boxCount?: number; customerId?: number } = req.body;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (boxCount !== undefined && (boxCount < 1 || boxCount > 3)) {
      return res.status(400).json({ error: 'Box count must be between 1 and 3' });
    }

    const current = await query<any>('SELECT * FROM orders WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const currentOrder = current.rows[0];
    const updatedBoxCount = boxCount !== undefined ? boxCount : currentOrder.boxCount;
    const updatedCustomerId = customerId !== undefined ? customerId : currentOrder.customerId;

    if (!(await query('SELECT 1 FROM customers WHERE id = $1', [updatedCustomerId])).rows.length) {
      return res.status(400).json({ error: 'customerId does not exist' });
    }

    await query(
      `UPDATE orders SET "boxCount" = $1, "customerId" = $2 WHERE id = $3`,
      [updatedBoxCount, updatedCustomerId, id]
    );

    const { rows } = await query(
      `${ORDER_WITH_CUSTOMER} WHERE o.id = $1`,
      [id]
    );
    res.json(rows[0]);
  } catch (error) {
    sendServerError(res, error);
  }
});

// DELETE single order
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const { rowCount } = await query('DELETE FROM orders WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted' });
  } catch (error) {
    sendServerError(res, error);
  }
});

// GENERATE SIMULATED ORDERS (จำลองออเดอร์มื้อเที่ยง 25 - 35 รายการ)
router.post('/simulate', async (req, res) => {
  try {
    const MAX_SIMULATED_ORDERS = 100;
    // No count given -> random 28-35 orders (normal lunch volume)
    const count = req.body?.count === undefined
      ? 28 + Math.floor(Math.random() * 8)
      : Number(req.body.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_SIMULATED_ORDERS) {
      return res.status(400).json({ error: `count must be an integer between 1 and ${MAX_SIMULATED_ORDERS}` });
    }
    const { rows: customers } = await query<{ id: number }>('SELECT id FROM customers');

    if (customers.length === 0) {
      return res.status(400).json({ error: 'No customers available in database' });
    }

    await transaction(async (client) => {
      // Serialize concurrent simulations: the second request waits instead of
      // racing DELETE/INSERT batches (which produced 500s / lock contention).
      await client.query('SELECT pg_advisory_xact_lock($1)', [SIMULATE_LOCK_KEY]);
      // Clear existing orders
      await client.query('DELETE FROM orders');

      // Shuffle (Fisher-Yates) so each run picks different customers.
      // A customer orders at most once unless count exceeds the customer list.
      const shuffled = [...customers];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Random boxes (1-3) and order time (10:00-10:45), sorted by time so
      // order numbers follow the order the orders came in
      const simulated = Array.from({ length: count }, (_, i) => ({
        customerId: shuffled[i % shuffled.length].id,
        boxes: Math.floor(Math.random() * 3) + 1,
        timeMinute: 10 * 60 + Math.floor(Math.random() * 46)
      })).sort((a, b) => a.timeMinute - b.timeMinute);

      for (let i = 0; i < simulated.length; i++) {
        const o = simulated[i];
        const hour = Math.floor(o.timeMinute / 60);
        const min = o.timeMinute % 60;
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`;
        const orderNum = `ORD-LUNCH-${(i + 1).toString().padStart(3, '0')}`;
        await client.query(
          `INSERT INTO orders ("orderNumber", "customerId", "boxCount", "orderTime", status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [orderNum, o.customerId, o.boxes, timeStr]
        );
      }
    });

    const { rows } = await query(`${ORDER_WITH_CUSTOMER} ORDER BY o.id ASC`);
    res.json({ message: `Simulated ${count} lunch orders successfully!`, orders: rows });
  } catch (error) {
    sendServerError(res, error);
  }
});

// CLEAR all orders
router.delete('/', async (req, res) => {
  try {
    await query('DELETE FROM orders');
    res.json({ success: true, message: 'All orders cleared' });
  } catch (error) {
    sendServerError(res, error);
  }
});
