export const archetypes = ["quantity", "session-seat", "time-slot", "interval", "shipping"] as const;

export type Archetype = (typeof archetypes)[number];

export const archetypeLabels: Record<Archetype, string> = {
  quantity: "수량",
  "session-seat": "회차+좌석",
  "time-slot": "시간 슬롯",
  interval: "구간",
  shipping: "배송",
};

export const archetypeDescriptions: Record<Archetype, string> = {
  quantity: "개수로 점유합니다. 굿즈, 쿠폰, 비지정 티켓이 여기 있습니다.",
  "session-seat": "회차를 고른 뒤 그 안의 좌석을 점유합니다.",
  "time-slot": "날짜와 슬롯을 고르고, 슬롯 정원 안에서 점유합니다.",
  interval: "시작과 종료가 겹치면 점유할 수 없습니다.",
  shipping: "개수와 받는 곳을 함께 받습니다. 재고는 수량입니다.",
};

export type OptionAxis = {
  id: string;
  label: string;
  values: { id: string; label: string }[];
};

type ProductBase = {
  id: string;
  name: string;
  summary: string;
  unitPrice: number;
  priceNote: string;
  options: OptionAxis[];
};

export type QuantityProductFixture = ProductBase & {
  archetype: "quantity";
  stock: number;
};

export type Seat = {
  id: string;
  row: string;
  number: number;
  grade: string;
  price: number;
  taken: boolean;
};

export type PerformanceSession = {
  id: string;
  label: string;
  seats: Seat[];
};

export type SessionSeatProduct = ProductBase & {
  archetype: "session-seat";
  sessions: PerformanceSession[];
};

export type TimeSlot = {
  id: string;
  date: string;
  label: string;
  remaining: number;
};

export type TimeSlotProduct = ProductBase & {
  archetype: "time-slot";
  demandOptionId?: string;
  slots: TimeSlot[];
};

export type BlockedRange = {
  label: string;
  start: string;
  end: string;
};

export type IntervalProduct = ProductBase & {
  archetype: "interval";
  unit: "night" | "hour";
  blocked: BlockedRange[];
};

export type ShippingProduct = ProductBase & {
  archetype: "shipping";
  stock: number;
};

export type CatalogProduct =
  | QuantityProductFixture
  | SessionSeatProduct
  | TimeSlotProduct
  | IntervalProduct
  | ShippingProduct;

const party = (id: string, values: number[]): OptionAxis => ({
  id,
  label: "인원",
  values: values.map((value) => ({ id: String(value), label: `${value}명` })),
});

function seats(sessionId: string, taken: string[]): Seat[] {
  const rows: { row: string; grade: string; price: number; count: number }[] = [
    { row: "A", grade: "VIP", price: 99000, count: 4 },
    { row: "B", grade: "R", price: 77000, count: 6 },
    { row: "C", grade: "S", price: 55000, count: 6 },
  ];
  return rows.flatMap((row) =>
    Array.from({ length: row.count }, (_, index) => {
      const number = index + 1;
      const id = `${sessionId}-${row.row}${number}`;
      return {
        id,
        row: row.row,
        number,
        grade: row.grade,
        price: row.price,
        taken: taken.includes(id),
      };
    }),
  );
}

function slots(
  date: string,
  entries: { label: string; remaining: number }[],
): TimeSlot[] {
  return entries.map((entry) => ({
    id: `${date}-${entry.label}`,
    date,
    label: entry.label,
    remaining: entry.remaining,
  }));
}

export const catalog: CatalogProduct[] = [
  {
    id: "linen-tote",
    archetype: "quantity",
    name: "린넨 토트",
    summary: "색과 사이즈를 고르고 개수로 삽니다.",
    unitPrice: 32000,
    priceNote: "1개",
    stock: 8,
    options: [
      {
        id: "color",
        label: "색",
        values: [
          { id: "natural", label: "내추럴" },
          { id: "black", label: "블랙" },
        ],
      },
      {
        id: "size",
        label: "사이즈",
        values: [
          { id: "s", label: "S" },
          { id: "m", label: "M" },
        ],
      },
    ],
  },
  {
    id: "americano-coupon",
    archetype: "quantity",
    name: "아메리카노 쿠폰",
    summary: "구매는 수량형입니다. 사용은 구매 뒤에 소진으로 남습니다.",
    unitPrice: 4500,
    priceNote: "1장",
    stock: 30,
    options: [],
  },
  {
    id: "standing-ticket",
    archetype: "quantity",
    name: "비지정 스탠딩",
    summary: "권종만 고르고 좌석은 지정하지 않습니다.",
    unitPrice: 55000,
    priceNote: "1매",
    stock: 80,
    options: [
      {
        id: "kind",
        label: "권종",
        values: [
          { id: "adult", label: "성인" },
          { id: "youth", label: "청소년" },
        ],
      },
    ],
  },
  {
    id: "spring-concert",
    archetype: "session-seat",
    name: "봄 콘서트",
    summary: "회차를 고른 다음 등급별 좌석을 점유합니다.",
    unitPrice: 55000,
    priceNote: "좌석",
    options: [],
    sessions: [
      {
        id: "oct3-1900",
        label: "10월 3일 19:00",
        seats: seats("oct3-1900", ["oct3-1900-A2", "oct3-1900-B3"]),
      },
      {
        id: "oct4-1500",
        label: "10월 4일 15:00",
        seats: seats("oct4-1500", ["oct4-1500-A1"]),
      },
    ],
  },
  {
    id: "omelette",
    archetype: "time-slot",
    name: "한남 오므라이스",
    summary: "일반형 식당입니다. 인원은 옵션이고 점유는 시간 슬롯입니다.",
    unitPrice: 28000,
    priceNote: "1명",
    demandOptionId: "party",
    options: [party("party", [1, 2, 3, 4])],
    slots: [
      ...slots("2026-10-02", [
        { label: "11:30", remaining: 4 },
        { label: "12:00", remaining: 0 },
        { label: "17:30", remaining: 6 },
        { label: "18:30", remaining: 2 },
      ]),
      ...slots("2026-10-03", [
        { label: "11:30", remaining: 5 },
        { label: "12:00", remaining: 3 },
        { label: "17:30", remaining: 1 },
        { label: "18:30", remaining: 4 },
      ]),
    ],
  },
  {
    id: "haircut",
    archetype: "time-slot",
    name: "커트",
    summary: "뷰티형입니다. 시술과 담당은 옵션이고 시간은 슬롯입니다.",
    unitPrice: 35000,
    priceNote: "1회",
    options: [
      {
        id: "menu",
        label: "시술",
        values: [
          { id: "cut", label: "커트" },
          { id: "perm", label: "펌" },
        ],
      },
      {
        id: "stylist",
        label: "담당",
        values: [
          { id: "minji", label: "민지" },
          { id: "hajun", label: "하준" },
        ],
      },
    ],
    slots: [
      ...slots("2026-10-02", [
        { label: "11:00", remaining: 1 },
        { label: "13:00", remaining: 1 },
        { label: "15:00", remaining: 0 },
        { label: "17:00", remaining: 1 },
      ]),
      ...slots("2026-10-03", [
        { label: "11:00", remaining: 1 },
        { label: "13:00", remaining: 1 },
        { label: "15:00", remaining: 1 },
        { label: "17:00", remaining: 1 },
      ]),
    ],
  },
  {
    id: "clinic",
    archetype: "time-slot",
    name: "내과 진료",
    summary: "병의원형입니다. 초진과 재진은 옵션이고 진료 시각은 슬롯입니다.",
    unitPrice: 15000,
    priceNote: "1회",
    options: [
      {
        id: "visit",
        label: "구분",
        values: [
          { id: "first", label: "초진" },
          { id: "return", label: "재진" },
        ],
      },
    ],
    slots: [
      ...slots("2026-10-02", [
        { label: "09:30", remaining: 1 },
        { label: "10:00", remaining: 0 },
        { label: "10:30", remaining: 1 },
        { label: "11:00", remaining: 1 },
      ]),
      ...slots("2026-10-03", [
        { label: "09:30", remaining: 1 },
        { label: "10:00", remaining: 1 },
        { label: "10:30", remaining: 0 },
        { label: "11:00", remaining: 1 },
      ]),
    ],
  },
  {
    id: "pottery",
    archetype: "time-slot",
    name: "도예 원데이",
    summary: "회차형입니다. 이름이 있는 회차가 정원을 가진 슬롯입니다.",
    unitPrice: 48000,
    priceNote: "1회",
    options: [],
    slots: [
      ...slots("2026-10-02", [
        { label: "1회차 11:00", remaining: 8 },
        { label: "2회차 15:00", remaining: 2 },
      ]),
      ...slots("2026-10-03", [
        { label: "1회차 11:00", remaining: 0 },
        { label: "2회차 15:00", remaining: 6 },
      ]),
    ],
  },
  {
    id: "picnic",
    archetype: "time-slot",
    name: "한강 피크닉 자리",
    summary: "날짜선택형입니다. 하루가 슬롯 하나이고 인원만큼 정원을 씁니다.",
    unitPrice: 20000,
    priceNote: "1명",
    demandOptionId: "party",
    options: [party("party", [2, 4])],
    slots: [
      ...slots("2026-10-02", [{ label: "하루", remaining: 5 }]),
      ...slots("2026-10-03", [{ label: "하루", remaining: 0 }]),
      ...slots("2026-10-04", [{ label: "하루", remaining: 3 }]),
    ],
  },
  {
    id: "namhae",
    archetype: "interval",
    name: "남해 독채",
    summary: "숙박형입니다. 체크아웃일 전날 밤까지 점유하고, 겹치면 막습니다.",
    unitPrice: 180000,
    priceNote: "1박",
    unit: "night",
    options: [
      {
        id: "room",
        label: "객실",
        values: [
          { id: "studio", label: "원룸" },
          { id: "loft", label: "복층" },
        ],
      },
    ],
    blocked: [
      { label: "10월 3일–5일", start: "2026-10-03", end: "2026-10-05" },
      { label: "10월 9일–11일", start: "2026-10-09", end: "2026-10-11" },
    ],
  },
  {
    id: "studio",
    archetype: "interval",
    name: "성수 촬영 스튜디오",
    summary: "공간 대여입니다. 시간 단위로 잡고, 이미 잡힌 구간과 겹치면 막습니다.",
    unitPrice: 40000,
    priceNote: "1시간",
    unit: "hour",
    options: [],
    blocked: [
      { label: "10월 2일 13:00–16:00", start: "2026-10-02T13:00", end: "2026-10-02T16:00" },
      { label: "10월 3일 10:00–12:00", start: "2026-10-03T10:00", end: "2026-10-03T12:00" },
    ],
  },
  {
    id: "jeju",
    archetype: "interval",
    name: "제주 일정",
    summary: "여행 일정입니다. 숙박과 같이 날짜 구간으로 점유합니다.",
    unitPrice: 240000,
    priceNote: "1박",
    unit: "night",
    options: [party("party", [2, 4])],
    blocked: [{ label: "10월 6일–8일", start: "2026-10-06", end: "2026-10-08" }],
  },
  {
    id: "meeting-room",
    archetype: "interval",
    name: "회의실",
    summary: "시작–종료시간형입니다. 같은 자원의 겹치는 시간은 한 건만 점유합니다.",
    unitPrice: 25000,
    priceNote: "1시간",
    unit: "hour",
    options: [],
    blocked: [{ label: "10월 2일 15:00–17:00", start: "2026-10-02T15:00", end: "2026-10-02T17:00" }],
  },
  {
    id: "poster-set",
    archetype: "shipping",
    name: "포스터 세트",
    summary: "개수를 고르고 받는 곳을 적습니다. 출고 상태는 구매 뒤에 붙습니다.",
    unitPrice: 18000,
    priceNote: "1세트",
    stock: 15,
    options: [],
  },
];

export function findProduct(id: string): CatalogProduct | undefined {
  return catalog.find((product) => product.id === id);
}

export function optionLines(product: CatalogProduct, selected: Record<string, string>): string[] {
  return product.options.flatMap((axis) => {
    const value = axis.values.find((item) => item.id === selected[axis.id]);
    return value ? [`${axis.label} ${value.label}`] : [];
  });
}

export function initialOptions(product: CatalogProduct): Record<string, string> {
  return Object.fromEntries(product.options.map((axis) => [axis.id, axis.values[0]?.id ?? ""]));
}
