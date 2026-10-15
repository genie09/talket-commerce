import type { Pool, PoolConnection } from "mysql2/promise";

const tables = [
  "ledger_entries",
  "payments",
  "holds",
  "order_line_answers",
  "order_line_policies",
  "order_items",
  "order_lines",
  "orders",
  "availability_bindings",
  "availability_interval_resources",
  "availability_seats",
  "availability_sessions",
  "availability_slot_subjects",
  "availability_quantity_stocks",
  "availability_inventories",
  "offers",
  "input_fields",
  "sellable_option_values",
  "sellables",
  "option_values",
  "option_axes",
  "products",
];

const statements = [
  `CREATE TABLE IF NOT EXISTS products (
    id CHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    catalog_kind VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    fee_bps INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS option_axes (
    id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    label VARCHAR(80) NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT option_axes_product FOREIGN KEY (product_id) REFERENCES products (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS option_values (
    id CHAR(36) NOT NULL,
    axis_id CHAR(36) NOT NULL,
    label VARCHAR(80) NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT option_values_axis FOREIGN KEY (axis_id) REFERENCES option_axes (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sellables (
    id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    binding_mode VARCHAR(16) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT sellables_product FOREIGN KEY (product_id) REFERENCES products (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sellable_option_values (
    sellable_id CHAR(36) NOT NULL,
    option_value_id CHAR(36) NOT NULL,
    PRIMARY KEY (sellable_id, option_value_id),
    CONSTRAINT sellable_values_sellable FOREIGN KEY (sellable_id) REFERENCES sellables (id),
    CONSTRAINT sellable_values_value FOREIGN KEY (option_value_id) REFERENCES option_values (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS input_fields (
    id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    label VARCHAR(80) NOT NULL,
    required TINYINT NOT NULL,
    min_length INT NOT NULL,
    max_length INT NOT NULL,
    scope VARCHAR(16) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT input_fields_product FOREIGN KEY (product_id) REFERENCES products (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS offers (
    id CHAR(36) NOT NULL,
    sellable_id CHAR(36) NOT NULL,
    price_key VARCHAR(64) NOT NULL,
    channel VARCHAR(64) NOT NULL,
    currency CHAR(3) NOT NULL,
    unit_price INT NOT NULL,
    available_from DATETIME NULL,
    available_to DATETIME NULL,
    PRIMARY KEY (id),
    CONSTRAINT offers_sellable FOREIGN KEY (sellable_id) REFERENCES sellables (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_inventories (
    id CHAR(36) NOT NULL,
    policy_key VARCHAR(32) NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_quantity_stocks (
    inventory_id CHAR(36) NOT NULL,
    on_hand INT NOT NULL,
    PRIMARY KEY (inventory_id),
    CONSTRAINT availability_quantity_on_hand_nonnegative CHECK (on_hand >= 0),
    CONSTRAINT availability_quantity_stocks_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_slot_subjects (
    inventory_id CHAR(36) NOT NULL,
    label VARCHAR(200) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    PRIMARY KEY (inventory_id),
    CONSTRAINT availability_slot_subjects_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_sessions (
    id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    label VARCHAR(200) NOT NULL,
    starts_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT availability_sessions_product FOREIGN KEY (product_id) REFERENCES products (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_seats (
    inventory_id CHAR(36) NOT NULL,
    session_id CHAR(36) NOT NULL,
    label VARCHAR(64) NOT NULL,
    grade VARCHAR(64) NOT NULL,
    state VARCHAR(16) NOT NULL,
    PRIMARY KEY (inventory_id),
    UNIQUE KEY availability_seats_session_label (session_id, label),
    CONSTRAINT availability_seats_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id),
    CONSTRAINT availability_seats_session FOREIGN KEY (session_id) REFERENCES availability_sessions (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_interval_resources (
    inventory_id CHAR(36) NOT NULL,
    label VARCHAR(200) NOT NULL,
    PRIMARY KEY (inventory_id),
    CONSTRAINT availability_interval_resources_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS availability_bindings (
    sellable_id CHAR(36) NOT NULL,
    inventory_id CHAR(36) NOT NULL,
    required_quantity INT NOT NULL,
    PRIMARY KEY (sellable_id, inventory_id),
    CONSTRAINT bindings_sellable FOREIGN KEY (sellable_id) REFERENCES sellables (id),
    CONSTRAINT bindings_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id)
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
    offer_id CHAR(36) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    sellable_name VARCHAR(200) NOT NULL,
    policy_key VARCHAR(32) NOT NULL,
    currency CHAR(3) NOT NULL,
    unit_price INT NOT NULL,
    quantity INT NOT NULL,
    amount_due_now INT NOT NULL,
    refunded_quantity INT NOT NULL,
    fulfilled TINYINT NOT NULL,
    fee_bps INT NOT NULL,
    PRIMARY KEY (id),
    KEY order_lines_order (order_id),
    CONSTRAINT order_lines_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT order_lines_sellable FOREIGN KEY (sellable_id) REFERENCES sellables (id),
    CONSTRAINT order_lines_offer FOREIGN KEY (offer_id) REFERENCES offers (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id CHAR(36) NOT NULL,
    order_line_id CHAR(36) NOT NULL,
    unit_index INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY order_items_line_index (order_line_id, unit_index),
    CONSTRAINT order_items_line FOREIGN KEY (order_line_id) REFERENCES order_lines (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_line_policies (
    order_line_id CHAR(36) NOT NULL,
    inventory_id CHAR(36) NOT NULL,
    policy_key VARCHAR(32) NOT NULL,
    required_quantity INT NOT NULL,
    PRIMARY KEY (order_line_id, inventory_id),
    CONSTRAINT line_policies_line FOREIGN KEY (order_line_id) REFERENCES order_lines (id),
    CONSTRAINT line_policies_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_line_answers (
    id CHAR(36) NOT NULL,
    order_line_id CHAR(36) NOT NULL,
    order_item_id CHAR(36) NULL,
    field_id CHAR(36) NOT NULL,
    unit_index INT NOT NULL,
    label VARCHAR(80) NOT NULL,
    value VARCHAR(500) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT line_answers_line FOREIGN KEY (order_line_id) REFERENCES order_lines (id),
    CONSTRAINT line_answers_item FOREIGN KEY (order_item_id) REFERENCES order_items (id),
    CONSTRAINT line_answers_field FOREIGN KEY (field_id) REFERENCES input_fields (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS holds (
    id CHAR(36) NOT NULL,
    order_line_id CHAR(36) NOT NULL,
    inventory_id CHAR(36) NOT NULL,
    policy_key VARCHAR(32) NOT NULL,
    quantity INT NOT NULL,
    interval_start DATETIME NULL,
    interval_end DATETIME NULL,
    state VARCHAR(16) NOT NULL,
    PRIMARY KEY (id),
    KEY holds_inventory_state (inventory_id, state),
    CONSTRAINT holds_line FOREIGN KEY (order_line_id) REFERENCES order_lines (id),
    CONSTRAINT holds_inventory FOREIGN KEY (inventory_id) REFERENCES availability_inventories (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS payments (
    id CHAR(36) NOT NULL,
    order_id CHAR(36) NOT NULL,
    order_line_id CHAR(36) NULL,
    kind VARCHAR(16) NOT NULL,
    amount INT NOT NULL,
    currency CHAR(3) NOT NULL,
    idempotency_key VARCHAR(191) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY payments_idempotency (idempotency_key),
    CONSTRAINT payments_order FOREIGN KEY (order_id) REFERENCES orders (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS ledger_entries (
    seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id CHAR(36) NOT NULL,
    order_id CHAR(36) NOT NULL,
    order_line_id CHAR(36) NULL,
    kind VARCHAR(32) NOT NULL,
    amount INT NOT NULL,
    recipient VARCHAR(64) NULL,
    idempotency_key VARCHAR(191) NOT NULL,
    PRIMARY KEY (seq),
    UNIQUE KEY ledger_id (id),
    UNIQUE KEY ledger_idempotency (idempotency_key),
    KEY ledger_order (order_id),
    CONSTRAINT ledger_order_fk FOREIGN KEY (order_id) REFERENCES orders (id)
  ) ENGINE=InnoDB`,
];

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS schema_meta");
  for (const statement of statements) {
    await pool.query(statement);
  }
}

export async function truncateCommerce(pool: Pool | PoolConnection): Promise<void> {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of tables) {
    await pool.query(`TRUNCATE TABLE ${table}`);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}
