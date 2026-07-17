import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, getClient } from '../db/pool';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors';

import expensesRoutes from './expenses';
import loansRoutes from './loans';
import settlementsRoutes from './settlements';
import balancesRoutes from './balances';

const router = Router();

// Mount nested ledger routes (these routers use mergeParams: true)
router.use('/:groupId/expenses', expensesRoutes);
router.use('/:groupId/loans', loansRoutes);
router.use('/:groupId/settlements', settlementsRoutes);
router.use('/:groupId/balances', balancesRoutes);

// All group routes require authentication
router.use(authenticate);

// ─── Zod Schemas ────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(200),
});

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(200),
});

const addMemberSchema = z.object({
  email: z.string().email('Invalid email'),
});

// ─── Helpers ────────────────────────────────────────────────

async function assertGroupMember(groupId: string, userId: string) {
  const result = await query(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Group not found');
  }
  return result.rows[0].role as string;
}

async function assertGroupAdmin(groupId: string, userId: string) {
  const role = await assertGroupMember(groupId, userId);
  if (role !== 'admin') {
    throw new ForbiddenError('Only group admins can perform this action');
  }
}

// ─── POST /groups ───────────────────────────────────────────
// Creates group + adds creator as admin member in a single transaction

router.post(
  '/',
  validate(createGroupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await getClient();
    try {
      const { name } = req.body;
      const userId = req.user!.id;

      await client.query('BEGIN');

      // Create the group
      const groupResult = await client.query<{
        id: string;
        name: string;
        created_by: string;
        created_at: string;
      }>(
        `INSERT INTO groups (name, created_by)
         VALUES ($1, $2)
         RETURNING id, name, created_by, created_at`,
        [name, userId]
      );
      const group = groupResult.rows[0];

      // Add creator as admin member
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [group.id, userId]
      );

      await client.query('COMMIT');

      res.status(201).json({
        id: group.id,
        name: group.name,
        createdBy: group.created_by,
        createdAt: group.created_at,
        role: 'admin',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ─── GET /groups ────────────────────────────────────────────
// List all groups the current user belongs to

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const result = await query<{
        id: string;
        name: string;
        created_by: string;
        created_at: string;
        role: string;
        member_count: string;
      }>(
        `SELECT g.id, g.name, g.created_by, g.created_at, gm.role,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
         FROM groups g
         JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
         ORDER BY g.created_at DESC`,
        [userId]
      );

      res.json(
        result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          createdBy: r.created_by,
          createdAt: r.created_at,
          role: r.role,
          memberCount: parseInt(r.member_count, 10),
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /groups/activity ─────────────────────────────────────
// Get global activity feed for the current user

router.get(
  '/activity',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const result = await query(
        `SELECT
            'settlement' as type,
            s.id, s.amount, s.note as description, s.settled_at as created_at,
            g.name as group_name,
            up.id as paid_by_id, up.name as paid_by_name,
            ut.id as paid_to_id, ut.name as paid_to_name
         FROM settlements s
         JOIN groups g ON g.id = s.group_id
         JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
         JOIN users up ON up.id = s.paid_by
         JOIN users ut ON ut.id = s.paid_to
         
         UNION ALL
         
         SELECT
            'expense' as type,
            e.id, e.amount, e.description, e.created_at,
            g.name as group_name,
            up.id as paid_by_id, up.name as paid_by_name,
            NULL as paid_to_id, NULL as paid_to_name
         FROM expenses e
         JOIN groups g ON g.id = e.group_id
         JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
         JOIN users up ON up.id = e.paid_by
         
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      res.json(result.rows.map((r: any) => ({
        type: r.type,
        id: r.id,
        amount: parseFloat(r.amount),
        description: r.description,
        createdAt: r.created_at,
        groupName: r.group_name,
        paidBy: { id: r.paid_by_id, name: r.paid_by_name },
        paidTo: r.paid_to_id ? { id: r.paid_to_id, name: r.paid_to_name } : null
      })));
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /groups/:id ────────────────────────────────────────
// Get group detail with members list (must be a member)

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.id;
      const userId = req.user!.id;

      // Verify membership
      const role = await assertGroupMember(groupId, userId);

      // Fetch group info
      const groupResult = await query<{
        id: string;
        name: string;
        created_by: string;
        created_at: string;
      }>(
        'SELECT id, name, created_by, created_at FROM groups WHERE id = $1',
        [groupId]
      );

      if (groupResult.rows.length === 0) {
        throw new NotFoundError('Group not found');
      }

      const group = groupResult.rows[0];

      // Fetch members
      const membersResult = await query<{
        user_id: string;
        name: string;
        email: string;
        role: string;
        joined_at: string;
      }>(
        `SELECT gm.user_id, u.name, u.email, gm.role, gm.joined_at
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1
         ORDER BY gm.joined_at`,
        [groupId]
      );

      res.json({
        id: group.id,
        name: group.name,
        createdBy: group.created_by,
        createdAt: group.created_at,
        currentUserRole: role,
        members: membersResult.rows.map((m) => ({
          id: m.user_id,
          name: m.name,
          email: m.email,
          role: m.role,
          joinedAt: m.joined_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /groups/:id ────────────────────────────────────────
// Update group name (admin only)

router.put(
  '/:id',
  validate(updateGroupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.id;
      await assertGroupAdmin(groupId, req.user!.id);

      const { name } = req.body;
      const result = await query<{ id: string; name: string }>(
        `UPDATE groups SET name = $1 WHERE id = $2 RETURNING id, name`,
        [name, groupId]
      );

      res.json({ id: result.rows[0].id, name: result.rows[0].name });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /groups/:id ─────────────────────────────────────
// Delete group (admin only, cascades to group_members)

router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.id;
      await assertGroupAdmin(groupId, req.user!.id);

      await query('DELETE FROM groups WHERE id = $1', [groupId]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /groups/:id/members ───────────────────────────────
// Add member by email (admin only)

router.post(
  '/:id/members',
  validate(addMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.id;
      await assertGroupAdmin(groupId, req.user!.id);

      const { email } = req.body;

      // Look up the user by email
      const userResult = await query<{ id: string; name: string; email: string }>(
        'SELECT id, name, email FROM users WHERE email = $1',
        [email]
      );
      if (userResult.rows.length === 0) {
        throw new NotFoundError('No user found with that email');
      }

      const newMember = userResult.rows[0];

      // Check if already a member
      const existing = await query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, newMember.id]
      );
      if (existing.rows.length > 0) {
        throw new BadRequestError('User is already a member of this group');
      }

      // Add as regular member
      await query(
        `INSERT INTO group_members (group_id, user_id, role)
         VALUES ($1, $2, 'member')`,
        [groupId, newMember.id]
      );

      res.status(201).json({
        id: newMember.id,
        name: newMember.name,
        email: newMember.email,
        role: 'member',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /groups/:id/members/:userId ─────────────────────
// Remove member (admin only, can't remove self if last admin)

router.delete(
  '/:id/members/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.id;
      const targetUserId = req.params.userId;
      await assertGroupAdmin(groupId, req.user!.id);

      // Prevent removing the last admin
      if (targetUserId === req.user!.id) {
        const adminCount = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM group_members
           WHERE group_id = $1 AND role = 'admin'`,
          [groupId]
        );
        if (parseInt(adminCount.rows[0].count, 10) <= 1) {
          throw new BadRequestError(
            'Cannot remove the last admin. Promote another member first.'
          );
        }
      }

      const result = await query(
        'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, targetUserId]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Member not found in this group');
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
