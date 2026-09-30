export type DatabaseStatus = "up" | "down";

export type HealthResponse = {
  ok: boolean;
  database: DatabaseStatus;
};

export type { LedgerEntryView, QuantityOrder, QuantityProduct } from "./quantity";
