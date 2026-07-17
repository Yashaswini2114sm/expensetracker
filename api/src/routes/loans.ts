import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { ForbiddenError, BadRequestError } from '../utils/errors';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── Zod Schemas ────────────────────────────────────────────

const createLoanSchema = z.object({
  borrowerId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().optional(),
});

// ─── POST /groups/:groupId/loans ────────────────────────────

router.post(
  '/',
  validate(createLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.groupId;
      const lenderId = req.user!.id;
      const { borrowerId, amount, description } = req.body;

      if (lenderId === borrowerId) {
        throw new BadRequestError('Cannot lend to yourself');
      }

      // Verify both are in group
      const members = await query(
        'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])',
        [groupId, [lenderId, borrowerId]]
      );
      if (members.rows.length !== 2) {
        throw new ForbiddenError('Both users must be members of the group');
      }

      const result = await query(
        `INSERT INTO loans (lender_id, borrower_id, group_id, amount, description, status)
         VALUES ($1, $2, $3, $4, $5, 'open')
         RETURNING id, created_at`,
        [lenderId, borrowerId, groupId, amount, description || null]
      );

      res.status(201).json({
        id: result.rows[0].id,
        groupId,
        lenderId,
        borrowerId,
        amount,
        description,
        status: 'open',
        createdAt: result.rows[0].created_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /groups/:groupId/loans ─────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.groupId;

      // Verify user is in group
      const membership = await query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user!.id]
      );
      if (membership.rows.length === 0) {
        throw new ForbiddenError('Not a member of this group');
      }

      const result = await query(
        `SELECT l.id, l.lender_id, l.borrower_id, l.amount, l.description, l.status, l.created_at,
                ul.name as lender_name, ub.name as borrower_name
         FROM loans l
         JOIN users ul ON ul.id = l.lender_id
         JOIN users ub ON ub.id = l.borrower_id
         WHERE l.group_id = $1
         ORDER BY l.created_at DESC`,
        [groupId]
      );

      res.json(result.rows.map(r => ({
        id: r.id,
        amount: parseFloat(r.amount),
        description: r.description,
        status: r.status,
        createdAt: r.created_at,
        lender: { id: r.lender_id, name: r.lender_name },
        borrower: { id: r.borrower_id, name: r.borrower_name }
      })));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
