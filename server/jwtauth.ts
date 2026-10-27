import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export type Role = 'admin' | 'rider' | 'customer';

export interface AuthUser {
  userId: number;
  username: string;
  role: Role;
  riderId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const isProduction = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

// Fail fast in production: a missing secret would let anyone forge tokens
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '8h';

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

// Password hashing with Node's built-in scrypt (no native dependency needed)
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
    req.user = {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      riderId: payload.riderId
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Session หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
    }
    next();
  };
}

// Riders may only access their own riderId; admins may access any
export function canAccessRider(user: AuthUser | undefined, riderId: number): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.riderId === riderId;
}

// Log the real error server-side, return a generic message to the client
export function sendServerError(res: Response, error: unknown) {
  console.error(error);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
}
