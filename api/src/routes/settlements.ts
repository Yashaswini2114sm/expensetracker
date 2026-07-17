import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { ForbiddenError, BadRequestError } from '../utils/errors';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── Zod Schemas ────────────────────────────────────────────

const createSettlementSchema = z.object({
  paidTo: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().optional(),
});

// ─── POST /groups/:groupId/settlements ──────────────────────

router.post(
  '/',
  validate(createSettlementSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.groupId;
      const paidBy = req.user!.id;
      const { paidTo, amount, note } = req.body;

      if (paidBy === paidTo) {
        throw new BadRequestError('Cannot settle with yourself');
      }

      // Verify both are in group
      const members = await query(
        'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])',
        [groupId, [paidBy, paidTo]]
      );
      if (members.rows.length !== 2) {
        throw new ForbiddenError('Both users must be members of the group');
      }

      // Record the settlement
      const result = await query(
        `INSERT INTO settlements (group_id, paid_by, paid_to, amount, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, settled_at`,
        [groupId, paidBy, paidTo, amount, note || null]
      );

      res.status(201).json({
        id: result.rows[0].id,
        groupId,
        paidBy,
        paidTo,
        amount,
        note,
        settledAt: result.rows[0].settled_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /groups/:groupId/settlements ───────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.groupId;

      const membership = await query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user!.id]
      );
      if (membership.rows.length === 0) {
        throw new ForbiddenError('Not a member of this group');
      }

      const result = await query(
        `SELECT s.id, s.amount, s.note, s.settled_at,
                up.id as paid_by_id, up.name as paid_by_name,
                ut.id as paid_to_id, ut.name as paid_to_name
         FROM settlements s
         JOIN users up ON up.id = s.paid_by
         JOIN users ut ON ut.id = s.paid_to
         WHERE s.group_id = $1
         ORDER BY s.settled_at DESC`,
        [groupId]
      );

      res.json(result.rows.map(r => ({
        id: r.id,
        amount: parseFloat(r.amount),
        note: r.note,
        settledAt: r.settled_at,
        paidBy: { id: r.paid_by_id, name: r.paid_by_name },
        paidTo: { id: r.paid_to_id, name: r.paid_to_name }
      })));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
