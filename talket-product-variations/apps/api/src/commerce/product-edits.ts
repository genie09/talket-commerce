import type { QuantityProduct } from "@talket/contracts";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { loadProduct, listQuantityProducts } from "./read-product";
import { fail, succeed, type CommandResult } from "./result";

const maxUnitPrice = 10_000_000;
const maxStock = 1_000_000;

export { listQuantityProducts };

export async function updateProduct(
  pool: Pool,
  input: { productId: string; name?: string; unitPrice?: number },
): Promise<CommandResult<QuantityProduct>> {
  const current = await loadProduct(pool, input.productId);
  if (!current) return fail("product-not-found");
  const name = input.name === undefined ? current.name : input.name.trim();
  if (name.trim().length === 0 || name.trim().length > 200) return fail("invalid-name");
  if (input.unitPrice !== undefined && (!Number.isSafeInteger(input.unitPrice) || input.unitPrice < 0 || input.unitPrice > maxUnitPrice)) {
    return fail("invalid-price");
  }

  await pool.query("UPDATE products SET name = ? WHERE id = ?", [name, input.productId]);
  if (current.sellables.length === 1) {
    await pool.query("UPDATE sellables SET name = ? WHERE product_id = ?", [name, input.productId]);
  }
  if (input.unitPrice !== undefined) {
    await pool.query(
      `UPDATE offers o
       JOIN sellables s ON s.id = o.sellable_id
       SET o.unit_price = ?
       WHERE s.product_id = ? AND o.price_key = 'default'`,
      [input.unitPrice, input.productId],
    );
  }
  const product = await loadProduct(pool, input.productId);
  if (!product) return fail("product-not-found");
  return succeed(product);
}

export async function adjustStock(
  pool: Pool,
  input: { productId: string; delta: number },
): Promise<CommandResult<QuantityProduct>> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) return fail("invalid-stock");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT DISTINCT q.inventory_id, q.on_hand
       FROM availability_quantity_stocks q
       JOIN availability_bindings b ON b.inventory_id = q.inventory_id
       JOIN sellables s ON s.id = b.sellable_id
       WHERE s.product_id = ?
       FOR UPDATE`,
      [input.productId],
    );
    if (rows.length !== 1) {
      await connection.rollback();
      return fail(rows.length === 0 ? "product-not-found" : "invalid-stock");
    }
    const current = Number(rows[0].on_hand);
    const next = current + input.delta;
    if (next < 0 || next > maxStock) {
      await connection.rollback();
      return fail("invalid-stock");
    }
    const [updated] = await connection.query<ResultSetHeader>(
      "UPDATE availability_quantity_stocks SET on_hand = ? WHERE inventory_id = ? AND on_hand = ?",
      [next, rows[0].inventory_id, current],
    );
    if (updated.affectedRows !== 1) {
      await connection.rollback();
      return fail("stock-conflict", true);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const product = await loadProduct(pool, input.productId);
  if (!product) return fail("product-not-found");
  return succeed(product);
}
