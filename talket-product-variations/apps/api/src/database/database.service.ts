import { Injectable, OnModuleDestroy } from "@nestjs/common";
import mysql, { Pool } from "mysql2/promise";

function tcpHost(host: string | undefined): string {
  if (!host || host === "localhost") return "127.0.0.1";
  return host;
}

export function createDatabasePool(): Pool {
  return mysql.createPool({
    host: tcpHost(process.env.DATABASE_HOST),
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeout: Number(process.env.DATABASE_POOL_IDLE ?? 10000),
    connectTimeout: Number(process.env.DATABASE_POOL_ACQUIRE ?? 30000),
    enableKeepAlive: true,
  });
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    this.pool = createDatabasePool();
  }

  async ping(): Promise<boolean> {
    try {
      const connection = await this.pool.getConnection();
      try {
        await connection.query("SELECT 1");
        return true;
      } finally {
        connection.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`database ping failed: ${message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
