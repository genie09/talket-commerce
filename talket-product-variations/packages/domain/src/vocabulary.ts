/** README의 다섯 원형. 쿠폰은 quantity에 소진 상태를 붙이며 원형이 아니다. */
export const archetypes = [
  "quantity",
  "session-seat",
  "time-slot",
  "interval",
  "shipping",
] as const;

export type Archetype = (typeof archetypes)[number];

/** 작성 → 판매중 → 점유 → 판매됨 → 사용/출고 → 환불 → 정산 */
export const orderStates = [
  "draft",
  "on-sale",
  "held",
  "sold",
  "fulfilled",
  "refunded",
  "settled",
] as const;

export type OrderState = (typeof orderStates)[number];

export const commerceEvents = [
  "list",
  "hold",
  "release",
  "sell",
  "fulfill",
  "change",
  "refund",
  "settle",
] as const;

export type CommerceEvent = (typeof commerceEvents)[number];

/** 재고와 돈을 쓰는 입구. 공통 재고 증감 경로는 두지 않는다. */
export const commands = ["hold", "confirm-sale", "change", "refund"] as const;

export type Command = (typeof commands)[number];
