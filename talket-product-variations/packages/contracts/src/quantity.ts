export type PolicyKey = "quantity.v1" | "seat.v1" | "interval.v1";

export type CatalogKind = "quantity" | "session-seat" | "time-slot" | "interval" | "shipping";

export type LedgerEntryView = {
  kind: "sale" | "fee" | "refund" | "payable";
  amount: number;
  recipient: string | null;
  orderLineId: string | null;
};

export type OfferView = {
  id: string;
  priceKey: string;
  channel: string;
  currency: string;
  unitPrice: number;
};

export type InventoryView = {
  id: string;
  policyKey: PolicyKey;
  label: string | null;
  onHand: number | null;
  requiredQuantity: number;
  state: string | null;
};

export type SellableView = {
  id: string;
  name: string;
  bindingMode: "all" | "choice";
  stock: number | null;
  options: { axis: string; value: string }[];
  offers: OfferView[];
  inventories: InventoryView[];
};

export type InputFieldView = {
  id: string;
  label: string;
  required: boolean;
  minLength: number;
  maxLength: number;
  scope: "line" | "unit";
};

export type QuantityProduct = {
  id: string;
  name: string;
  usageMethod: CatalogKind;
  sellableId: string;
  offerId: string;
  unitPrice: number;
  stock: number;
  sellables: SellableView[];
  inputs: InputFieldView[];
};

export type OrderLineView = {
  id: string;
  sellableId: string;
  productName: string;
  sellableName: string;
  unitPrice: number;
  quantity: number;
  refundedQuantity: number;
  amountDueNow: number;
  fulfilled: boolean;
  policyKey: string;
};

export type OrderStatus = "draft" | "held" | "sold" | "fulfilled" | "refunded" | "settled";

export type QuantityOrder = {
  id: string;
  status: OrderStatus;
  lines: OrderLineView[];
  line: OrderLineView;
  entries: LedgerEntryView[];
  balance: number;
  paymentAmount: number | null;
};

export type HoldSubject = {
  inventoryId: string;
  intervalStart?: string;
  intervalEnd?: string;
};

export type HoldAnswer = {
  fieldId: string;
  unitIndex?: number;
  value: string;
};

export type HoldLineRequest = {
  sellableId: string;
  offerId?: string;
  quantity: number;
  subjects?: HoldSubject[];
  intervalStart?: string;
  intervalEnd?: string;
  answers?: HoldAnswer[];
};

export type HoldOrderRequest = {
  lines: HoldLineRequest[];
};
