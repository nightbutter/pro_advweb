import express from 'express';
import { sendServerError } from '../jwtauth';
import { query, transaction } from '../dbconnect';
import { Customer } from '../model/customer';
import { isZone, inferZone } from '../model/zones';
import { MAX_DELIVERY_RADIUS_KM, distanceFromShopKm } from '../services/route-optimizer';

function outsideDeliveryAreaError(lat: number, lng: number): string | null {
  const km = distanceFromShopKm(lat, lng);
  if (km <= MAX_DELIVERY_RADIUS_KM) return null;
  return `ที่อยู่นี้อยู่นอกพื้นที่จัดส่ง (ห่างร้าน ${km.toFixed(2)} กม. เกิน ${MAX_DELIVERY_RADIUS_KM} กม.)`;
}

export const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM customers ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    sendServerError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const { rows } = await query('SELECT * FROM customers WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    sendServerError(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, phone, address, lat, lng, zone }: Customer = req.body;
    if (!name || !phone || !address || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: 'Missing or invalid customer fields' });
    }
    if (zone !== undefined && !isZone(zone)) {
      return res.status(400).json({ error: 'zone must be one of: ขามเรียง, ท่าขอนยาง, หน้าป้าย' });
    }
    const areaError = outsideDeliveryAreaError(Number(lat), Number(lng));
    if (areaError) {
      return res.status(400).json({ error: areaError });
    }
    const finalZone = zone ?? inferZone(Number(lat), Number(lng), address);
    const { rows } = await query(
      `INSERT INTO customers (name, phone, address, lat, lng, zone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, phone, address, Number(lat), Number(lng), finalZone]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendServerError(res, error);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, phone, address, lat, lng, zone }: Customer = req.body;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (!name || !phone || !address || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: 'Missing or invalid customer fields' });
    }
    if (zone !== undefined && !isZone(zone)) {
      return res.status(400).json({ error: 'zone must be one of: ขามเรียง, ท่าขอนยาง, หน้าป้าย' });
    }
    if (!(await query('SELECT 1 FROM customers WHERE id = $1', [id])).rows.length) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const areaError = outsideDeliveryAreaError(Number(lat), Number(lng));
    if (areaError) {
      return res.status(400).json({ error: areaError });
    }
    const finalZone = zone ?? inferZone(Number(lat), Number(lng), address);
    const { rows } = await query(
      `UPDATE customers
       SET name = $1, phone = $2, address = $3, lat = $4, lng = $5, zone = $6
       WHERE id = $7 RETURNING *`,
      [name, phone, address, Number(lat), Number(lng), finalZone, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    sendServerError(res, error);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const deleted = await transaction(async (client) => {
      await client.query('DELETE FROM orders WHERE "customerId" = $1', [id]);
      const { rowCount } = await client.query('DELETE FROM customers WHERE id = $1', [id]);
      return rowCount;
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    sendServerError(res, error);
  }
});
