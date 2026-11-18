
import dotenv from 'dotenv';

dotenv.config();

export const env = {
  appEnv: process.env.APP_ENV || 'development',
  port: Number(process.env.PORT) || 8090,
  appName: process.env.APP_NAME || 'ByaheGo Locale Service',
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  // Origins allowed to call the API from a browser (the globe page when hosted
  // separately). Comma-separated, e.g. https://locale-web.example.com; "*" = any.
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    name: process.env.DB_NAME || 'byahego_localization'
  }
};
