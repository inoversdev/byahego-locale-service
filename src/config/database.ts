
import mysql, { Pool } from 'mysql2/promise';
import { env } from './env';

const pool: Pool = mysql.createPool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,

  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,

  charset: 'utf8mb4'
});

export const testDatabaseConnection = async (): Promise<void> => {
  try {
    const connection = await pool.getConnection();

    await connection.query('SELECT 1');

    connection.release();

    console.log('MySQL database connection successful.');
  } catch (error) {
    console.error('MySQL database connection failed:', error);
    throw error;
  }
};

export default pool;
