import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { ForbiddenError } from '../utils/errors';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── GET /groups/:groupId/balances ──────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.params.groupId;

      // Ensure caller is in the group
      const membership = await query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user!.id]
      );
      if (membership.rows.length === 0) {
        throw new ForbiddenError('Not a member of this group');
      }

      // Query the event-sourced view
      const result = await query(
        `SELECT 
           pb.user_id, u1.name as user_name,
           pb.owes_to_id, u2.name as owes_to_name,
           pb.amount
         FROM pairwise_balances pb
         JOIN users u1 ON u1.id = pb.user_id
         JOIN users u2 ON u2.id = pb.owes_to_id
         WHERE pb.group_id = $1
         ORDER BY pb.amount DESC`,
        [groupId]
      );

      // Return exactly who owes whom
      res.json(result.rows.map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        owesToId: r.owes_to_id,
        owesToName: r.owes_to_name,
        amount: parseFloat(r.amount)
      })));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
