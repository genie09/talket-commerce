export type LedgerEntryView = {
  kind: "sale" | "fee" | "refund" | "payable";
  amount: number;
};

export type QuantityProduct = {
  id: string;
  sellableId: string;
  name: string;
  unitPrice: number;
  stock: number;
  usageMethod: "quantity";
};

export type QuantityOrder = {
  id: string;
  status: "sold" | "refunded" | "settled";
  line: {
    sellableId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    refundedQuantity: number;
  };
  entries: LedgerEntryView[];
  balance: number;
};
