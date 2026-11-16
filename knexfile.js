"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const config = {
    development: {
        client: 'mysql2',
        connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            charset: 'utf8mb4'
        },
        migrations: {
            directory: './migrations',
            extension: 'ts',
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations'
        }
    }
};
exports.default = config;
//# sourceMappingURL=knexfile.js.map