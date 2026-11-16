
import dotenv from 'dotenv';

dotenv.config();

export const env = {
  appEnv: process.env.APP_ENV || 'development',
  port: Number(process.env.PORT) || 8090,
  appName: process.env.APP_NAME || 'ByaheGo Locale Service',
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    name: process.env.DB_NAME || 'byahego_localization'
  }
};
