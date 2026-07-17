import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Log slow queries in development
pool.on('connect', () => {
  console.log('[db] New client connected to pool');
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err);
});

/**
 * Thin query wrapper with optional slow-query logging.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 200) {
    console.warn(`[db] Slow query (${duration}ms):`, text.slice(0, 120));
  }

  return result;
}

/**
 * Get a client from the pool for transactions.
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... queries ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient() {
  return pool.connect();
}

export default pool;
