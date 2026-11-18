
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import express, { Request, Response } from 'express';
import { env } from './config/env';
import pool from './config/database';
import countryRoutes from './modules/countries/country.routes';

const app = express();

// Read-only API: browsers on the allowed origins may GET it. No credentials.
// Without CORS_ORIGINS no CORS headers are sent (same-origin use only).
if (env.corsOrigins.length > 0) {
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? '*' : env.corsOrigins,
      methods: ['GET', 'HEAD', 'OPTIONS']
    })
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Globe web app (built with `npm run web:build`). Falls back to the JSON
// status response below when it has not been built.
const webRoot = path.resolve(__dirname, '..', 'web', 'dist');
const hasWebApp = fs.existsSync(path.join(webRoot, 'index.html'));

if (hasWebApp) {
  app.use(express.static(webRoot));
}

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  if (hasWebApp) {
    res.sendFile(path.join(webRoot, 'index.html'));
    return;
  }

  res.json({
    success: true,
    message: `${env.appName} is running.`,
    version: '1.0.0'
  });
});

// API health check
app.get(`${env.apiPrefix}/health`, (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy.',
    data: {
      service: env.appName,
      environment: env.appEnv,
      timestamp: new Date().toISOString()
    }
  });
});

// Database health check
app.get(
  `${env.apiPrefix}/health/database`,
  async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');

      res.status(200).json({
        success: true,
        message: 'Database connection is healthy.'
      });
    } catch (error) {
      console.error('Database health check failed:', error);

      res.status(503).json({
        success: false,
        message: 'Database connection is unavailable.'
      });
    }
  }
);

app.use(`${env.apiPrefix}/countries`, countryRoutes);

export default app;
