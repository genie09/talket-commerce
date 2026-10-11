# Talket × Saleor

원문: [Talket](../talket/README.md), [Saleor](README.md)

Saleor는 창고 수량, 주문 할당, 체크아웃 예약이 테이블로 나뉜다. Talket은 옵션 정원 하나와 주문 줄 합이다.

## 구성

| | Talket | Saleor |
|--|--------|--------|
| 그릇 | `Product` + 카테고리 문자열 | `ProductType` → `Product` → 카테고리 트리 |
| 파는 단위 | `ProductOption` | `ProductVariant`. 체크아웃 라인은 항상 variant |
| 변형 축 | 이름 칸. 속성 조합 없음 | `AssignedVariantAttributeValue` (사이즈, 색) |
| 가격 | 옵션에 KRW 금액 두 개 (명목, 판매) | `ProductVariantChannelListing`. 채널·통화별 |
| 재고 장소 | 없음 | `Stock` = 창고 × variant |
| 고객 한도 | 상품 `maxOrderLimit`, 옵션 `maxOrderLimit` | `quantity_limit_per_customer` |
| 판매 기간 | `saleOpenedAt`, `saleClosedAt` | 채널 리스팅의 공개 |

Talket `Product`는 Saleor의 Product와 ChannelListing 일부를 한 행에 둔다. 채널이 없어서 가격·공개가 상품·옵션에 붙어 있다.

## 재고

```
Saleor available = quantity - quantity_allocated - 미만료 reservation
Talket 남은 수  = totalCount - VERIFIED/PAID/부분취소 수량
```

| 시점 | Talket | Saleor |
|------|--------|--------|
| 체크아웃 | 카트는 홀드 없음. 바로구매 ID 풀만 선택적 선점 | `Reservation` TTL. 체크아웃 라인에 묶임 |
| 주문 | 결제 완료 때 합산이 통과하면 `PAID` | `Allocation` 생성, `quantity_allocated` 증가 |
| 출고 | 배송 상태 변경. 정원 컬럼은 그대로 | 할당 해제 + `quantity` 감소 |
| 추적 끄기 | 정원 숫자만 있음. 무제한 플래그 없음 | `track_inventory = false`면 할당을 건너뜀 |

Saleor는 체크아웃 예약과 주문 할당을 다른 테이블에 둔다. Talket의 `VERIFIED`가 할당에 가깝고, 카트 예약에 해당하는 전역 홀드는 없다. ID 풀은 구매자 단위 선점이라 Saleor reservation과는 범위가 다르다.

## 주문

Saleor `OrderLine`은 variant, 단가, 통화를 스냅샷한다. Talket `OrderLine`은 옵션 id, 상품명, 옵션명, 한도를 스냅샷하고, 수량은 자식 `OrderItem` 개수다.

Saleor 결제는 결제 앱과 `TransactionItem`이다. Talket은 주문에 `t_order_payment`를 붙이고 PG 웹훅이 `CompleteOrderPayment`를 부른다. 금액 불일치는 제출 전에 `PriceCalculator`로 거절한다.

## 환불

Saleor는 `OrderGrantedRefund` 후 결제 앱이 돈을 돌리고, 반품 fulfillment에서 할당 해제와 수량 증가가 난다.

Talket은 클레임 수락 → 환불 행 → 소유 잔액 회수다. 정원 복원은 줄 수량이 합산에서 빠지는 것이다. 창고 수량을 올리는 단계가 없다.

## 락

Saleor는 `select_for_update`를 stock pk 순서로 잡고 할당 트랜잭션 안에서 가용량을 다시 계산한다. Talket은 옵션 id 락 하나 안에서 주문 줄을 합산한다. 잠그는 행이 창고 재고가 아니라 판매 칸이다.

## 이 비교에서 남는 것

- 채널별 가격과 창고별 수량은 Talket 구성에 없다. 가격과 정원은 옵션 하나다.
- “주문 줄에 이름·단가를 복사한다”는 같다.
- 체크아웃 TTL 예약이 필요하면 Saleor `Reservation`이 그 자리다. Talket 카트는 그 행을 만들지 않는다.
