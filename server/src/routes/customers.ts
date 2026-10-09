import { Router } from 'express';
import { db } from '../database/connection';
import { Customer } from '../models/types';
import { distanceMeters, isFiniteNumber, parseLatLng } from '../services/geo';

export const customerRouter = Router();

const CUSTOMER_NEARBY_RADIUS_M = 1000; // HW-5: customers within 1 km

// GET all customers
customerRouter.get('/', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY id DESC').all();
    res.json(customers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /search?q= — search customers by part of first or last name
// (the `name` column stores the full name, so a substring match covers both parts).
// NOTE: must be registered before /:id or "search" would be treated as an id.
customerRouter.get('/search', (req, res) => {
  try {
    const q = req.query.q;
    if (typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const customers = db.prepare(`
      SELECT * FROM customers
      WHERE name LIKE ? ESCAPE '\\'
      ORDER BY id DESC
    `).all(`%${q.trim().replace(/[%_\\]/g, m => '\\' + m)}%`);
    res.json(customers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /nearby?lat=&lng=[&radius=] — customers within radius (default 1 km)
// Radius is in meters; boundary is inclusive (distance <= radius).
customerRouter.get('/nearby', (req, res) => {
  try {
    const origin = parseLatLng(req.query.lat, req.query.lng);
    if (!origin) {
      return res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    }
    let radius = CUSTOMER_NEARBY_RADIUS_M;
    if (req.query.radius !== undefined) {
      const r = Number(req.query.radius);
      if (!Number.isFinite(r) || r <= 0) {
        return res.status(400).json({ error: 'radius must be a positive number (meters)' });
      }
      radius = r;
    }

    const customers = (db.prepare('SELECT * FROM customers').all() as Customer[])
      .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .map(c => ({ ...c, _d: distanceMeters(origin.lat, origin.lng, c.lat, c.lng) }))
      .filter(c => c._d <= radius)
      .map(({ _d, ...c }) => ({ ...c, distanceMeters: Number(_d.toFixed(1)) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    res.json({ radiusMeters: radius, count: customers.length, customers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET single customer
customerRouter.get('/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE customer
customerRouter.post('/', (req, res) => {
  try {
    const { name, phone, address, lat, lng }: Customer = req.body;
    if (!name || !phone || !address || !isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return res.status(400).json({ error: 'Missing or invalid required customer fields' });
    }
    const coords = parseLatLng(lat, lng);
    if (!coords) {
      return res.status(400).json({ error: 'lat must be -90..90 and lng -180..180' });
    }
    const result = db.prepare(`
      INSERT INTO customers (name, phone, address, lat, lng)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, phone, address, Number(lat), Number(lng));

    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newCustomer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE customer (full update — all fields required)
customerRouter.put('/:id', (req, res) => {
  try {
    const { name, phone, address, lat, lng }: Customer = req.body;
    if (!name || !phone || !address || !isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return res.status(400).json({ error: 'Missing or invalid required customer fields' });
    }
    const coords = parseLatLng(lat, lng);
    if (!coords) {
      return res.status(400).json({ error: 'lat must be -90..90 and lng -180..180' });
    }
    const result = db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, address = ?, lat = ?, lng = ?
      WHERE id = ?
    `).run(name, phone, address, Number(lat), Number(lng), req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE customer
customerRouter.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE customerId = ?').run(req.params.id);
    const result = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
