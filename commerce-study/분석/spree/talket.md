# Talket × Spree 6

원문: [Talket](../talket/README.md), [Spree](README.md)

Spree 6은 카트와 주문을 테이블로 나누고, 재고 변화를 `StockMovement` 원장으로 남긴다. Talket은 카트 줄과 주문 줄이 따로이고, 재고 원장 대신 주문 줄 합을 쓴다.

## 구성

| | Talket | Spree 6 |
|--|--------|---------|
| 그릇 | `Product` | `Product`. `default_variant_id`가 얼굴 |
| 파는 단위 | `ProductOption` | `Variant`. 옵션 값(Size, Color)이 붙음 |
| 타입 | 카테고리 문자열 (`TICKET`, `GOODS`, …) | `ProductType`이 만들 때 옵션·카테고리·배송 프로필을 찍음 |
| 가격 | 옵션 금액 | `Price`. 통화, price list, 수량 구간 |
| 디지털 | 배송 정책이 없으면 소유·사용 | `DigitalAsset`. 주문 완료 시 자동 출고 가능 |
| 판매자 | `partnerId`가 상품에 하나 | Variant가 `seller_id`를 가질 수 있음 |

Talket 옵션 이름이 Spree의 OptionValue 조합 자리다. Spree는 그 조합이 Variant SKU가 되고 창고 `StockLevel`로 이어진다.

## 재고

Spree `available_count = count_on_hand - allocated_count`다. 이동 kind는 `received`, `adjusted`, `allocated`, `released`, `shipped`다.

Talket은 선반과 할당 컬럼이 없다. `PAID` 줄이 할당이고, 취소로 `currentQuantity`가 줄면 할당이 줄어든다. 출고해도 `totalCount`는 그대로다.

| 시점 | Talket | Spree 6 |
|------|--------|---------|
| 카트 | 수량, `isPaid` | `Stock::Packer`가 on_hand / backordered를 나누기만 함. 선택적 `StockReservation` 10분 |
| 주문 완료 | 합산 통과 후 `PAID`. 선반 감소 없음 | `allocated` 이동. `allocated_count`만 증가 |
| 출고 | `OUT_FOR_DELIVERY` → `DELIVERED` | `shipped` 이동. 선반 감소 + 할당 해제 |
| 반품 | 클레임 후 줄 수량 감소 | `received` 이동으로 재판매 수량 복원 |

Spree 카트 예약 TTL은 Talket 바로구매 ID 풀과 역할이 비슷하다. Spree는 재고 수량을 잡아 두고, Talket 풀은 미리 만든 아이템 id를 잡아 둔다.

## 주문

Spree 6은 `Cart`와 `Order`가 다른 테이블이고, 완료 시 카트가 주문으로 넘어간다. Talket `t_cart`는 담아 두는 목록이고, 주문은 제출 때 새로 만든다. `cartable` 바로구매는 주문과 함께 카트 줄을 넣고, 결제되면 그 줄을 paid로 표시한다.

Spree 주문 완료는 PREPARE 락 → 결제(외부) → FINALIZE다. Talket은 주문을 먼저 저장하고 PG 웹훅 뒤에 옵션 락으로 확정한다. 락을 잡은 채 PG HTTP를 하지 않는 순서는 Spree `external_step`과 같다.

## 환불

Spree는 `Return` 하나다. `requested → approved → received → refunded`. 여러 번에 나눠 환불하고, 재판매 수량은 `received` 이동이다.

Talket은 클레임 타입과 환불 행, 아이템 소유 회수가 따로다. 재고가 돌아오는 표현은 이동 원장이 아니라 줄 상태다.

## 락

Spree는 `stock_level.with_lock`, 주문·환불 행 락이다. 여러 행은 pk 순서다. Talket 옵션 락은 판매 칸 하나다. 창고가 여럿이면 Spree처럼 잠글 행이 늘고 순서가 필요해진다. Talket은 그 행이 없다.

## 이 비교에서 남는 것

- 카트와 주문을 문서로 나누는 점은 같다. Talket 카트는 재고를 할당하지 않는다.
- 재고 이동을 원인(주문, 출고, 반품)과 함께 남기는 원장은 Talket에 없다. 판매 수 표시용 `totalSalesCount`만 결제 뒤에 다시 쓴다.
- 수량 구간 가격, 백오더 한도, price list는 Talket 옵션 금액에 없다.
