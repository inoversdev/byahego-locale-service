
import app from './app';
import { env } from './config/env';
import { testDatabaseConnection } from './config/database';

const startServer = async (): Promise<void> => {
  try {
    // Verify database connection
    await testDatabaseConnection();

    // Start HTTP server
    const server = app.listen(env.port, () => {
      console.log('=================================');
      console.log(`${env.appName}`);
      console.log(`Environment: ${env.appEnv}`);
      console.log(`Port: ${env.port}`);
      console.log(`URL: http://localhost:${env.port}`);
      console.log('=================================');
    });

    // Graceful shutdown
    const shutdown = (signal: string): void => {
      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        const pool = (await import('./config/database')).default;

        await pool.end();

        console.log('Server and database connections closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Application startup failed:', error);
    process.exit(1);
  }
};

startServer();
