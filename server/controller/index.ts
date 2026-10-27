import express from 'express';

export const router = express.Router();

// GET /  หน้าแรกของ API (เปิดใน browser เพื่อเช็กว่า backend ทำงาน)
router.get('/', (req, res) => {
  res.json({
    message: 'Smart Rider Backend ทำงานปกติ — หน้าเว็บอยู่ที่ http://localhost:4200',
    health: '/api/health',
  });
});

// GET /api/health - ตรวจว่าเซิร์ฟเวอร์ทำงานอยู่ (ไม่ต้องล็อกอิน)
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
