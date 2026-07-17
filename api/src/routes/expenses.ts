import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, getClient } from '../db/pool';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';

const router = Router({ mergeParams: true }); // Access :groupId from parent router
router.use(authenticate);

// ─── Zod Schemas ────────────────────────────────────────────

const createExpenseSchema = z.object({
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  paidBy: z.string().uuid(),
  splitType: z.enum(['equal', 'custom', 'percentage']),
  splits: z.array(
    z.object({
      userId: z.string().uuid(),
      amountOwed: z.number().nonnegative(),
    })
  ).min(1),
});

// ─── Helpers ────────────────────────────────────────────────

async function assertGroupMember(groupId: string, userId: string) {
  const result = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (result.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this group');
  }
}

// ─── POST /groups/:groupId/expenses ─────────────────────────

router.post(
  '/',
  validate(createExpenseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await getClient();
    try {
      const groupId = req.params.groupId;
      const currentUserId = req.user!.id;
      const { description, amount, paidBy, splitType, splits } = req.body;

      // Verify current user is in group
      await assertGroupMember(groupId, currentUserId);

      // Verify all participants are in the group
      const allUserIds = [...new Set([paidBy, ...splits.map((s: any) => s.userId)])];
      const membersResult = await client.query(
        'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])',
        [groupId, allUserIds]
      );
      if (membersResult.rows.length !== allUserIds.length) {
        throw new BadRequestError('One or more users are not in the group');
      }

      // Verify total splits equal the total amount
      const totalSplit = splits.reduce((sum: number, s: any) => sum + s.amountOwed, 0);
      if (Math.abs(totalSplit - amount) > 0.01) { // Floating point tolerance
        throw new BadRequestError('Split amounts must add up to the total amount');
      }

      await client.query('BEGIN');

      // 1. Insert Expense
      const expenseResult = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO expenses (group_id, paid_by, amount, description, split_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [groupId, paidBy, amount, description, splitType]
      );
      const expense = expenseResult.rows[0];

      // 2. Insert Expense Splits
      for (const split of splits) {
        await client.query(
          `INSERT INTO expense_splits (expense_id, user_id, amount_owed)
           VALUES ($1, $2, $3)`,
          [expense.id, split.userId, split.amountOwed]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        id: expense.id,
        groupId,
        paidBy,
        amount,
        description,
        splitType,
        splits,
        createdAt: expense.created_at,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ─── GET /groups/:groupId/expenses ──────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.groupId;
      const currentUserId = req.user!.id;
      await assertGroupMember(groupId, currentUserId);

      // Fetch expenses with their splits
      const result = await query(
        `SELECT 
           e.id, e.amount, e.description, e.split_type, e.created_at, e.paid_by,
           u.name as paid_by_name,
           json_agg(
             json_build_object(
               'userId', es.user_id,
               'userName', su.name,
               'amountOwed', es.amount_owed
             )
           ) as splits
         FROM expenses e
         JOIN users u ON u.id = e.paid_by
         JOIN expense_splits es ON es.expense_id = e.id
         JOIN users su ON su.id = es.user_id
         WHERE e.group_id = $1
         GROUP BY e.id, u.name
         ORDER BY e.created_at DESC`,
        [groupId]
      );

      res.json(result.rows.map(r => ({
        id: r.id,
        amount: parseFloat(r.amount),
        description: r.description,
        splitType: r.split_type,
        createdAt: r.created_at,
        paidBy: {
          id: r.paid_by,
          name: r.paid_by_name
        },
        splits: r.splits.map((s: any) => ({
          userId: s.userId,
          userName: s.userName,
          amountOwed: parseFloat(s.amountOwed)
        }))
      })));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
