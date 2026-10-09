import { Router } from 'express';
import { db } from '../database/connection';
import { Rider } from '../models/types';

export const riderRouter = Router();

// GET all 13 fixed riders
riderRouter.get('/', (req, res) => {
  try {
    const riders = db.prepare('SELECT * FROM riders ORDER BY id ASC').all();
    res.json(riders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET rider details by ID or Job code
riderRouter.get('/:idOrCode', (req, res) => {
  try {
    const idOrCode = req.params.idOrCode;
    let riderId = parseInt(idOrCode, 10);
    
    // Check if entered as 'TASK-01' or 'RD-01' or '1'
    if (isNaN(riderId)) {
      const match = idOrCode.match(/\d+/);
      if (match) {
        riderId = parseInt(match[0], 10);
      }
    }

    const rider = db.prepare('SELECT * FROM riders WHERE id = ?').get(riderId);
    if (!rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }
    res.json(rider);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
