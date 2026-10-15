import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

export type LockedInventory = {
  id: string;
  policyKey: string;
  onHand: number | null;
  seatState: string | null;
};

type LockRow = RowDataPacket & {
  id: string;
  policy_key: string;
  on_hand: number | null;
  seat_state: string | null;
};

/** 재고를 가감하지 않는다. 잠금 순서만 재고 id 정렬로 고정한다. */
export async function lockInventories(connection: PoolConnection, ids: string[]): Promise<LockedInventory[]> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return [];
  const [rows] = await connection.query<LockRow[]>(
    `SELECT i.id, i.policy_key, q.on_hand, s.state AS seat_state
     FROM availability_inventories i
     LEFT JOIN availability_quantity_stocks q ON q.inventory_id = i.id
     LEFT JOIN availability_seats s ON s.inventory_id = i.id
     WHERE i.id IN (?)
     ORDER BY i.id
     FOR UPDATE`,
    [unique],
  );
  return rows.map((row) => ({
    id: row.id,
    policyKey: row.policy_key,
    onHand: row.on_hand === null ? null : Number(row.on_hand),
    seatState: row.seat_state,
  }));
}
