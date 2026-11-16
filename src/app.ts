
import express, { Request, Response } from 'express';
import { env } from './config/env';
import pool from './config/database';
import countryRoutes from './modules/countries/country.routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
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
