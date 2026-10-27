import express from 'express';

export const router = express.Router();

function frontendUrlForDisplay(): string | null {
  const configuredUrl = process.env.FRONTEND_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isLoopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0';
    const isProduction = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

    if (isProduction && (url.protocol !== 'https:' || isLoopback)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// GET /  หน้าแรกของ API (เปิดใน browser เพื่อเช็กว่า backend ทำงาน)
router.get('/', (req, res) => {
  const frontendUrl = frontendUrlForDisplay();
  res.json({
    message: frontendUrl
      ? `Smart Rider Backend ทำงานปกติ — หน้าเว็บอยู่ที่ ${frontendUrl}`
      : 'Smart Rider Backend ทำงานปกติ',
    health: '/api/health',
  });
});

// GET /api/health - ตรวจว่าเซิร์ฟเวอร์ทำงานอยู่ (ไม่ต้องล็อกอิน)
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
