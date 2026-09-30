import type { Pool, PoolConnection } from "mysql2/promise";

const statements = [
  `CREATE TABLE IF NOT EXISTS products (
    id CHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    usage_method VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sellables (
    id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    unit_price INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT sellables_product FOREIGN KEY (product_id) REFERENCES products (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS quantity_stocks (
    sellable_id CHAR(36) NOT NULL,
    on_hand INT NOT NULL,
    PRIMARY KEY (sellable_id),
    CONSTRAINT quantity_on_hand_nonnegative CHECK (on_hand >= 0),
    CONSTRAINT quantity_stocks_sellable FOREIGN KEY (sellable_id) REFERENCES sellables (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS orders (
    id CHAR(36) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_lines (
    id CHAR(36) NOT NULL,
    order_id CHAR(36) NOT NULL,
    sellable_id CHAR(36) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    sellable_name VARCHAR(200) NOT NULL,
    unit_price INT NOT NULL,
    quantity INT NOT NULL,
    refunded_quantity INT NOT NULL,
    fulfilled TINYINT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT order_lines_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT order_lines_sellable FOREIGN KEY (sellable_id) REFERENCES sellables (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS ledger_entries (
    seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id CHAR(36) NOT NULL,
    order_id CHAR(36) NOT NULL,
    order_line_id CHAR(36) NULL,
    kind VARCHAR(32) NOT NULL,
    amount INT NOT NULL,
    idempotency_key VARCHAR(191) NOT NULL,
    PRIMARY KEY (seq),
    UNIQUE KEY ledger_id (id),
    UNIQUE KEY ledger_idempotency (idempotency_key),
    KEY ledger_order (order_id),
    CONSTRAINT ledger_order_fk FOREIGN KEY (order_id) REFERENCES orders (id)
  ) ENGINE=InnoDB`,
];

export async function ensureSchema(pool: Pool): Promise<void> {
  for (const statement of statements) {
    await pool.query(statement);
  }
}

export async function truncateCommerce(pool: Pool | PoolConnection): Promise<void> {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "ledger_entries",
    "order_lines",
    "orders",
    "quantity_stocks",
    "sellables",
    "products",
  ]) {
    await pool.query(`TRUNCATE TABLE ${table}`);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}
