-- 001_initial_schema.sql
-- Full Ledgerly schema: event-sourced ledger model
-- Feature 1 exercises: users, groups, group_members
-- All tables created upfront for schema integrity

-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups (friend circles, roommates, trip groups)
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  role      TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Expenses (money already spent, to be split)
CREATE TABLE expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  paid_by     UUID NOT NULL REFERENCES users(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  split_type  TEXT NOT NULL DEFAULT 'equal', -- 'equal' | 'custom' | 'percentage'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who owes what share of a given expense (this is the ledger event)
CREATE TABLE expense_splits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  amount_owed NUMERIC(12,2) NOT NULL CHECK (amount_owed >= 0)
);

-- Informal loans (no expense attached — just "I lent Ravi 2000")
CREATE TABLE loans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id   UUID NOT NULL REFERENCES users(id),
  borrower_id UUID NOT NULL REFERENCES users(id),
  group_id    UUID REFERENCES groups(id), -- nullable: loans can be 1:1, outside a group
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'open', -- 'open' | 'settled' | 'overdue'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settlements (someone actually paid someone back — also a ledger event)
CREATE TABLE settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID REFERENCES groups(id),
  paid_by      UUID NOT NULL REFERENCES users(id),
  paid_to      UUID NOT NULL REFERENCES users(id),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note         TEXT,
  settled_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes that matter once data grows
CREATE INDEX idx_expense_splits_user   ON expense_splits(user_id);
CREATE INDEX idx_loans_lender         ON loans(lender_id);
CREATE INDEX idx_loans_borrower       ON loans(borrower_id);
CREATE INDEX idx_settlements_group    ON settlements(group_id);
