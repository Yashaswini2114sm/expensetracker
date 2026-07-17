import fs from 'fs';
import path from 'path';
import { query } from './pool';

/**
 * Simple file-based migration runner.
 * Reads .sql files from the migrations directory in alphabetical order.
 * Tracks applied migrations in a `_migrations` table.
 * Each migration file runs inside its own transaction.
 */
export async function runMigrations(): Promise<void> {
  // Ensure _migrations tracking table exists
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Find migration files (path is relative to src/db or dist/db)
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[migrate] No migrations directory found, skipping');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[migrate] No migration files found');
    return;
  }

  // Get already-applied migrations
  const applied = await query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY filename'
  );
  const appliedSet = new Set(applied.rows.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[migrate] Already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[migrate] Applying: ${file}`);

    // Run each migration in a transaction
    await query('BEGIN');
    try {
      await query(sql);
      await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await query('COMMIT');
      console.log(`[migrate] Applied: ${file}`);
    } catch (err) {
      await query('ROLLBACK');
      console.error(`[migrate] Failed to apply ${file}:`, err);
      throw err;
    }
  }

  console.log('[migrate] All migrations applied');
}
