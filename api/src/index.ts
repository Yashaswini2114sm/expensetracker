import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { runMigrations } from './db/migrate';
import authRoutes from './routes/auth';
import groupsRoutes from './routes/groups';
import { AppError } from './utils/errors';

const app = express();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[api] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[api] Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Startup sequence
async function start() {
  try {
    console.log('[api] Starting up...');
    
    // Run DB migrations before listening
    await runMigrations();

    app.listen(config.port, () => {
      console.log(`[api] Listening on port ${config.port}`);
    });
  } catch (err) {
    console.error('[api] Startup failed:', err);
    process.exit(1);
  }
}

start();
