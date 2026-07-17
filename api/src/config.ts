import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.API_PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ledgerly:ledgerly_dev@localhost:5432/ledgerly',
  jwtSecret: process.env.JWT_SECRET || 'dev-fallback-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
} as const;
