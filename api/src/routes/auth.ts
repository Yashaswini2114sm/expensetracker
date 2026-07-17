import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/pool';
import { config } from '../config';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { ConflictError, UnauthorizedError } from '../utils/errors';

const router = Router();

// ─── Zod Schemas ────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Helpers ────────────────────────────────────────────────

function signToken(user: { id: string; email: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

const BCRYPT_ROUNDS = 12;

// ─── POST /auth/register ────────────────────────────────────

router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;

      // Check if email already taken
      const existing = await query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existing.rows.length > 0) {
        throw new ConflictError('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Insert user
      const result = await query<{ id: string; name: string; email: string; created_at: string }>(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at`,
        [name, email, passwordHash]
      );

      const user = result.rows[0];
      const token = signToken(user);

      res.status(201).json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
        },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/login ───────────────────────────────────────

router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const result = await query<{
        id: string;
        name: string;
        email: string;
        password_hash: string;
        created_at: string;
      }>(
        'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const token = signToken(user);

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
        },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /auth/me ───────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query<{
        id: string;
        name: string;
        email: string;
        created_at: string;
      }>(
        'SELECT id, name, email, created_at FROM users WHERE id = $1',
        [req.user!.id]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedError('User not found');
      }

      const user = result.rows[0];
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
