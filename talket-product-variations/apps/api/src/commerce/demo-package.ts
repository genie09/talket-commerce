import { randomUUID } from "node:crypto";
import type { PackageProductView, QuantityProduct } from "@talket/contracts";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { createProduct } from "./create-product";
import { loadProducts } from "./read-product";

type PackageRow = RowDataPacket & {
  id: string;
  slug: string;
  name: string;
  summary: string;
  starts_on: Date | string;
  ends_on: Date | string;
};

type ComponentRow = RowDataPacket & {
  id: string;
  package_id: string;
  product_id: string;
  role: PackageProductView["components"][number]["role"];
  required: number;
  position: number;
};

export const demoPackageSlug = "kpop-seoul-2n3d";

export async function ensureDemoPackage(pool: Pool): Promise<void> {
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM package_products WHERE slug = ?",
    [demoPackageSlug],
  );
  let packageId = existing[0]?.id as string | undefined;
  let concert: QuantityProduct;
  let lodging: QuantityProduct;
  if (!packageId) {
    concert = await createConcert(pool);
    lodging = await createLodging(pool);
    packageId = randomUUID();
    await pool.query(
      `INSERT INTO package_products (id, slug, name, summary, starts_on, ends_on)
       VALUES (?, ?, ?, ?, '2026-11-20', '2026-11-22')`,
      [
        packageId,
        demoPackageSlug,
        "STARLIGHT 서울 2박 3일",
        "왕복 항공, 콘서트 지정좌석, 날짜별 선택 관광, 홍대 숙박을 한 번에 예약합니다.",
      ],
    );
  } else {
    const [linked] = await pool.query<(RowDataPacket & { product_id: string; role: string; name: string })[]>(
      `SELECT pc.product_id, pc.role, p.name
       FROM package_components pc JOIN products p ON p.id = pc.product_id
       WHERE pc.package_id = ?`,
      [packageId],
    );
    if (
      linked.some((row) => row.name === "서울 왕복 항공권 · 출발 일정") &&
      linked.filter((row) => row.role === "activity").length === 3
    ) return;
    const concertId = linked.find((row) => row.role === "concert")?.product_id;
    const lodgingId = linked.find((row) => row.role === "lodging")?.product_id;
    const products = await loadProducts(pool, [concertId, lodgingId].filter((id): id is string => Boolean(id)));
    concert = products.find((product) => product.id === concertId) ?? await createConcert(pool);
    lodging = products.find((product) => product.id === lodgingId) ?? await createLodging(pool);
    await pool.query("DELETE FROM package_components WHERE package_id = ?", [packageId]);
  }

  const flight = await createFlight(pool);
  const activities = await createActivities(pool);
  const components = [
    [flight.id, "flight", 1],
    [concert.id, "concert", 1],
    ...activities.map((activity) => [activity.id, "activity", 0] as const),
    [lodging.id, "lodging", 1],
  ] as const;
  for (const [position, component] of components.entries()) {
    await pool.query(
      `INSERT INTO package_components (id, package_id, product_id, role, required, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), packageId, component[0], component[1], component[2], position],
    );
  }
}

async function createFlight(pool: Pool): Promise<QuantityProduct> {
  return mustCreate(pool, {
    name: "서울 왕복 항공권 · 출발 일정",
    sellables: [
      {
        name: "김포 07:30 출발 · 11/22 18:40 귀국",
        unitPrice: 238_000,
        inventories: [{
          policyKey: "quantity.v1",
          onHand: 12,
          slot: { label: "11월 20일 07:30 · 김포 출발", startsAt: "2026-11-20 07:30", endsAt: "2026-11-20 08:40" },
        }],
      },
      {
        name: "부산 08:10 출발 · 11/22 19:20 귀국",
        unitPrice: 298_000,
        inventories: [{
          policyKey: "quantity.v1",
          onHand: 8,
          slot: { label: "11월 20일 08:10 · 부산 출발", startsAt: "2026-11-20 08:10", endsAt: "2026-11-20 09:20" },
        }],
      },
    ],
  });
}

async function createConcert(pool: Pool): Promise<QuantityProduct> {
  return mustCreate(pool, {
    name: "STARLIGHT 서울 콘서트",
    sessions: [{
      label: "11월 21일 19:00",
      startsAt: "2026-11-21 19:00",
      grades: [
        { label: "VIP", unitPrice: 198_000, seats: ["A1", "A2", "A3", "A4"].map((label) => ({ label })) },
        { label: "R", unitPrice: 154_000, seats: ["B1", "B2", "B3", "B4", "B5", "B6"].map((label) => ({ label })) },
      ],
    }],
  });
}

async function createActivities(pool: Pool): Promise<QuantityProduct[]> {
  const studio = await mustCreate(pool, {
    name: "성수 K-pop 댄스 클래스",
    sellables: [{
      name: "BTS Dynamite 안무",
      unitPrice: 69_000,
      inventories: [
        { policyKey: "quantity.v1", onHand: 6, slot: { label: "11월 20일 16:00", startsAt: "2026-11-20 16:00", endsAt: "2026-11-20 17:30" } },
        { policyKey: "quantity.v1", onHand: 8, slot: { label: "11월 20일 18:00", startsAt: "2026-11-20 18:00", endsAt: "2026-11-20 19:30" } },
      ],
    }],
  });
  const dinner = await mustCreate(pool, {
    name: "을지로 K-food 런치",
    axes: [{ label: "메뉴", values: ["한우 불고기 코스", "비건 사찰음식 코스"] }],
    sellables: [
      {
        name: "한우 불고기 코스",
        optionLabels: [{ axis: "메뉴", value: "한우 불고기 코스" }],
        unitPrice: 58_000,
        inventories: [
          { policyKey: "quantity.v1", onHand: 10, slot: { label: "11월 21일 12:00", startsAt: "2026-11-21 12:00", endsAt: "2026-11-21 13:20" } },
          { policyKey: "quantity.v1", onHand: 8, slot: { label: "11월 21일 13:30", startsAt: "2026-11-21 13:30", endsAt: "2026-11-21 14:50" } },
        ],
      },
      {
        name: "비건 사찰음식 코스",
        optionLabels: [{ axis: "메뉴", value: "비건 사찰음식 코스" }],
        unitPrice: 46_000,
        inventories: [
          { policyKey: "quantity.v1", onHand: 6, slot: { label: "11월 21일 12:00", startsAt: "2026-11-21 12:00", endsAt: "2026-11-21 13:20" } },
          { policyKey: "quantity.v1", onHand: 6, slot: { label: "11월 21일 13:30", startsAt: "2026-11-21 13:30", endsAt: "2026-11-21 14:50" } },
        ],
      },
    ],
  });
  const palace = await mustCreate(pool, {
    name: "경복궁 한복 촬영",
    axes: [{ label: "의상", values: ["기본 한복", "프리미엄 한복"] }],
    sellables: [
      {
        name: "기본 한복",
        optionLabels: [{ axis: "의상", value: "기본 한복" }],
        unitPrice: 49_000,
        inventories: [{ policyKey: "quantity.v1", onHand: 8, slot: { label: "11월 22일 09:00", startsAt: "2026-11-22 09:00", endsAt: "2026-11-22 11:00" } }],
      },
      {
        name: "프리미엄 한복",
        optionLabels: [{ axis: "의상", value: "프리미엄 한복" }],
        unitPrice: 79_000,
        inventories: [{ policyKey: "quantity.v1", onHand: 4, slot: { label: "11월 22일 09:00", startsAt: "2026-11-22 09:00", endsAt: "2026-11-22 11:00" } }],
      },
    ],
  });
  return [studio, dinner, palace];
}

async function createLodging(pool: Pool): Promise<QuantityProduct> {
  return mustCreate(pool, {
    name: "홍대 2박 숙박",
    axes: [{ label: "객실", values: ["스탠다드", "트윈"] }],
    sellables: [
      {
        name: "스탠다드 · 2박",
        optionLabels: [{ axis: "객실", value: "스탠다드" }],
        unitPrice: 260_000,
        inventories: [{ policyKey: "interval.v1", label: "스탠다드 101호" }],
      },
      {
        name: "트윈 · 2박",
        optionLabels: [{ axis: "객실", value: "트윈" }],
        unitPrice: 340_000,
        inventories: [{ policyKey: "interval.v1", label: "트윈 201호" }],
      },
    ],
  });
}

export async function listPackages(pool: Pool): Promise<PackageProductView[]> {
  const [rows] = await pool.query<PackageRow[]>(
    `SELECT id, slug, name, summary,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on
     FROM package_products ORDER BY created_at, id`,
  );
  const result: PackageProductView[] = [];
  for (const row of rows) {
    const item = await loadPackage(pool, row.slug);
    if (item) result.push(item);
  }
  return result;
}

export async function loadPackage(pool: Pool, slug: string): Promise<PackageProductView | null> {
  const [packages] = await pool.query<PackageRow[]>(
    `SELECT id, slug, name, summary,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on
     FROM package_products WHERE slug = ?`,
    [slug],
  );
  const item = packages[0];
  if (!item) return null;
  const [components] = await pool.query<ComponentRow[]>(
    `SELECT id, package_id, product_id, role, required, position
     FROM package_components WHERE package_id = ? ORDER BY position`,
    [item.id],
  );
  const products = await loadProducts(pool, components.map((component) => component.product_id));
  const byId = new Map(products.map((product) => [product.id, product]));
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    summary: item.summary,
    startsOn: dateOnly(item.starts_on),
    endsOn: dateOnly(item.ends_on),
    components: components.flatMap((component) => {
      const product = byId.get(component.product_id);
      return product
        ? [{
            id: component.id,
            role: component.role,
            required: component.required === 1,
            position: Number(component.position),
            product,
          }]
        : [];
    }),
  };
}

async function mustCreate(pool: Pool, input: Parameters<typeof createProduct>[1]): Promise<QuantityProduct> {
  const result = await createProduct(pool, input);
  if (!result.ok) throw new Error(`demo product creation failed: ${result.reason}`);
  return result.value;
}

function dateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
