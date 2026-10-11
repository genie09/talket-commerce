# Talket × Medusa

원문: [Talket](../talket/README.md), [Medusa](README.md)

Medusa는 헤드리스 커머스다. 가격·재고·주문이 모듈이고 링크 테이블로 붙는다. Talket은 티켓과 굿즈가 한 주문 테이블을 쓰고, 정원은 옵션 컬럼이다.

## 구성

| | Talket | Medusa |
|--|--------|--------|
| 그릇 | `Product`. 카테고리, 판매 기간, 배송·환불 정책 | `Product`. 이름, 핸들, 상태, 타입, 카테고리 |
| 파는 단위 | `ProductOption`. 이름 하나 = 가격·정원 하나 | `ProductVariant`. 옵션 값 조합 = SKU |
| 옵션 축 | 축 조합이 없다. “VIP”, “S”는 각각 옵션 행 | `ProductOption` × `ProductOptionValue`로 Red × M을 만든다 |
| 재고 주체 | 옵션의 `totalCount` | `InventoryItem`. Variant와 `required_quantity`로 링크 |
| 권리 1개 | 결제 후 `ProductItem` | 출고 단위. 디지털은 `requires_shipping = false` |
| 키트 | `CreateProductBundle`은 생성 묶음. 구성품 재고를 안 깎음 | Variant 1개가 InventoryItem 여러 개 |
| 가격 | 옵션에 `nominalPrice`, `price` (KRW) | `Price`가 PriceSet에 있음. Variant와 링크 |

Talket 옵션은 Medusa의 Variant와 InventoryItem을 한 행에 붙인 자리다. 색·사이즈를 곱해 SKU를 만들지 않는다.

## 재고

Medusa는 `available = stocked_quantity - reserved_quantity`다. 창고(`location`)마다 레벨이 있다.

Talket은 `totalCount - (VERIFIED·PAID·부분취소 줄의 currentQuantity)`다. 창고가 없고, 예약 행(`reservation_item`)도 없다.

| 시점 | Talket | Medusa |
|------|--------|--------|
| 카트 | 수량만 저장 | `confirmInventory`로 available 검사. 예약 행은 안 만듦 |
| 주문 확정 | 결제 완료 때 옵션 락 아래 합산 | `completeCart`에서 `reserved_quantity` 증가 |
| 출고 | 굿즈는 배송 상태만 바꿈. 정원을 또 안 깎음 | `stocked_quantity` 감소, 예약 해제 |
| 품절 허용 | 정원 초과면 결제 확정 실패 | `allow_backorder`면 검사 생략. `manage_inventory = false`면 항상 있음 |

Talket의 결제 확정 합산은 Medusa의 “카트는 검사, 주문에서 예약”과 시점이 같다. Medusa는 그 예약을 행으로 남기고, Talket은 주문 줄 상태가 곧 예약이다.

## 주문

Medusa 라인은 Variant를 가리키고, 가격·이름은 `order_line_item`에 복사된다. Talket 줄은 옵션 id와 상품명·옵션명·단가를 복사하고, 수량만큼 `OrderItem` id를 미리 만든다. 그 id가 결제 후 `ProductItem` id다.

Medusa는 한 카트에 채널 안의 Variant를 섞는다. Talket 바로구매는 상품 하나 안의 옵션 여러 개이고, 카트 주문은 상품 여러 개를 한 `Order`에 넣는다.

## 환불

Medusa는 `Refund`(캡처 한도)와 `Return` / `Claim` / `Exchange`가 갈라지고, 반품 수령 때 `stocked_quantity`가 늘어난다.

Talket은 `Claim`(`CANCEL`, `CANCEL_REQUEST`, `RETURN`)이 돈(`OrderRefund`)과 소유 회수를 같이 탄다. 정원은 줄의 `currentQuantity`가 줄거나 `PAID_CANCELED`가 되어 다음 합에서 빠진다. 선반 숫자를 되돌리는 단계가 없다.

## 락

Medusa는 재고 키 advisory/Redis 락, 카트 락, 환불 때 payment 행 `FOR UPDATE`다. Talket은 결제 완료의 구매자 락 다음 옵션 락이고, 폴백은 MySQL `GET_LOCK`이다. 제출 시점 수량 검사는 양쪽 다 락 밖에 있어 마지막 1개를 같이 통과할 수 있다. 막는 지점은 주문 확정이다.

## 이 비교에서 남는 것

- 가격·재고·주문을 링크로 떼는 Medusa 모듈 경계는 Talket에 없다. 옵션 행이 가격과 정원을 함께 가진다.
- “검사 후 확정 때 점유”는 같다. Talket의 점유는 예약 테이블이 아니라 주문 줄 상태다.
- 구성품이 재고를 나눠 갖는 키트, 창고, 백오더는 Talket 구성 밖에 있다.
