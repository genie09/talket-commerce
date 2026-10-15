import type { Pool, PoolConnection } from "mysql2/promise";
import type { CommandResult } from "./result";

export async function withTransaction<T>(
  pool: Pool,
  run: (connection: PoolConnection) => Promise<CommandResult<T>>,
): Promise<CommandResult<T>> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    if (!result.ok) {
      await connection.rollback();
      return result;
    }
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
