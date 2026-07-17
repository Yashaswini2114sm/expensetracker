-- 002_ledger_views.sql

-- A view to derive the net balances between any two users in a group
-- This is the core event-sourced ledger derivation.
-- It sums all expense splits, unsettled loans, and settlements to compute exactly who owes whom.

CREATE OR REPLACE VIEW pairwise_balances AS
WITH directed_debts AS (
  -- Combine all ledger events into a single list of directed edges
  SELECT
    group_id,
    debtor,
    creditor,
    SUM(amount) AS amount
  FROM (
    -- 1. Expense splits: owed by user_id to the person who paid
    SELECT 
      e.group_id, 
      es.user_id AS debtor, 
      e.paid_by AS creditor, 
      es.amount_owed AS amount
    FROM expense_splits es 
    JOIN expenses e ON e.id = es.expense_id

    UNION ALL

    -- 2. Loans: borrower owes lender
    SELECT 
      group_id, 
      borrower_id AS debtor, 
      lender_id AS creditor, 
      amount
    FROM loans 
    WHERE status != 'settled' AND group_id IS NOT NULL

    UNION ALL

    -- 3. Settlements: paid_by paid paid_to (acts as a credit, reducing debt)
    SELECT 
      group_id, 
      paid_by AS debtor, 
      paid_to AS creditor, 
      -amount AS amount
    FROM settlements 
    WHERE group_id IS NOT NULL
  ) combined
  WHERE debtor != creditor
  GROUP BY group_id, debtor, creditor
),
net_balances AS (
  -- Net out the directed debts (e.g., A owes B $10, B owes A $5 => A owes B $5)
  SELECT
    COALESCE(d1.group_id, d2.group_id) AS group_id,
    COALESCE(d1.debtor, d2.creditor) AS person_a,
    COALESCE(d1.creditor, d2.debtor) AS person_b,
    COALESCE(d1.amount, 0) - COALESCE(d2.amount, 0) AS net_amount
  FROM directed_debts d1
  FULL OUTER JOIN directed_debts d2
    ON d1.group_id = d2.group_id
   AND d1.debtor = d2.creditor
   AND d1.creditor = d2.debtor
)
-- Only return the positive edges (who owes whom)
SELECT
  group_id,
  person_a AS user_id,
  person_b AS owes_to_id,
  net_amount AS amount
FROM net_balances
WHERE net_amount > 0;
