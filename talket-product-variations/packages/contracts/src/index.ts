export type DatabaseStatus = "up" | "down";

export type HealthResponse = {
  ok: boolean;
  database: DatabaseStatus;
};

export type {
  CatalogKind,
  HoldAnswer,
  HoldLineRequest,
  HoldOrderRequest,
  HoldSubject,
  InputFieldView,
  InventoryView,
  LedgerEntryView,
  OfferView,
  OrderLineView,
  OrderStatus,
  PolicyKey,
  QuantityOrder,
  QuantityProduct,
  SellableView,
} from "./quantity";
