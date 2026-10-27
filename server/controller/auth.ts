import express from 'express';
import { query, transaction } from '../dbconnect';
import { requireAuth, signToken, verifyPassword, sendServerError, AuthUser, Role, hashPassword } from '../jwtauth';

export const router = express.Router();

interface UserRow {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
  riderId: number | null;
}

// POST /api/auth/login - Exchange username/password for a JWT
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    const row = rows[0] as UserRow | undefined;
    // Same message for unknown user and wrong password, so usernames can't be probed
    if (!row || !verifyPassword(password, row.passwordHash)) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user: AuthUser = { userId: row.id, username: row.username, role: row.role, riderId: row.riderId };
    res.json({ token: signToken(user), user });
  } catch (error) {
    sendServerError(res, error);
  }
});

// POST /api/auth/register/customer - Create a customer account and profile
router.post('/register/customer', async (req, res) => {
  try {
    const { name, phone, address, username, password } = req.body ?? {};
    if (
      typeof name !== 'string' ||
      typeof phone !== 'string' ||
      typeof address !== 'string' ||
      typeof username !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร' });
    }
    if (!/^[+\d][\d\s-]{7,17}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง' });
    }
    if (!cleanAddress || cleanAddress.length > 300) {
      return res.status(400).json({ error: 'กรุณากรอกที่อยู่ไม่เกิน 300 ตัวอักษร' });
    }
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 3–24 ตัวอักษร และใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร' });
    }

    const profile = await transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [cleanUsername]);
      const existing = await client.query(
        'SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1',
        [cleanUsername]
      );
      if (existing.rows.length > 0) return null;

      const { rows: [user] } = await client.query<{ id: number }>(
        `INSERT INTO users (username, "passwordHash", role, "riderId")
         VALUES ($1, $2, 'customer', NULL)
         RETURNING id`,
        [cleanUsername, hashPassword(password)]
      );
      const { rows: [createdProfile] } = await client.query(
        `INSERT INTO customer_profiles ("userId", name, phone, address)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, phone, address`,
        [user.id, cleanName, cleanPhone, cleanAddress]
      );
      return createdProfile;
    });

    if (!profile) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    return res.status(201).json({
      message: 'สมัครสมาชิกเรียบร้อยแล้ว',
      profile
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    }
    return sendServerError(res, error);
  }
});

// GET /api/auth/me - Return the user attached to the current token
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'customer') {
      return res.json({ user: req.user });
    }
    const { rows } = await query(
      `SELECT id, name, phone, address FROM customer_profiles WHERE "userId" = $1`,
      [req.user.userId]
    );
    return res.json({ user: req.user, profile: rows[0] ?? null });
  } catch (error) {
    return sendServerError(res, error);
  }
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
