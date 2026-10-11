# Talket × Stripe Product / Price

원문: [Talket](../talket/README.md), [Stripe](README.md)

Stripe에서 파는 것은 Product가 아니라 Price다. Talket에서 파는 것은 Product가 아니라 ProductOption이고, 그 옵션에 금액이 붙어 있다. 재고 엔진은 Stripe에 없다.

## 구성

| | Talket | Stripe |
|--|--------|--------|
| 이름·설명 | `Product`, `ProductContent` | Product. 세금 코드, 명세서 표기. id를 SKU로 지정 가능 |
| 금액 | 옵션의 `nominalPrice`, `price`. 통화를 바꾸면 옵션을 고침 | Price. `unit_amount`는 센트 정수. 금액 변경은 새 Price |
| 같은 상품의 다른 가격 | 옵션 행을 추가. 정원도 따라 갈라짐 | 한 Product의 Price 여러 개. 월간/연간, 통화 |
| 다른 상품 | Product를 나눔 | 가격표의 다른 행이면 Product를 나눔 |
| 구독 | 없음 | Price `recurring`. 구독 타입 필드가 아님 |
| 견적 금액 | 제출 금액이 `PriceCalculator`와 다르면 거절 | `price_data` 일회성 Price. 카탈로그 밖 |

Talket이 명목가와 판매가를 옵션에 같이 두는 것은 Stripe의 “금액은 Price, 이름은 Product”와 한 행 차이로 붙어 있다. 과거 주문의 단가는 주문 아이템에 복사되므로, 옵션 가격을 나중에 고쳐도 옛 주문은 유지된다. Stripe는 그 불변을 Price를 새로 만드는 쪽으로 지킨다.

## 재고·주문

Stripe Checkout 라인은 `price` id를 받고, 세션이 합계를 내며 Product로 이름·이미지를 그린다. Talket 주문 줄은 옵션 id와 함께 상품명·옵션명·단가를 복사한다. 스냅샷의 두 출처(이름, 금액)가 둘 다 있다.

재고 수량은 Stripe에 없다. Talket은 그 위에 옵션 `totalCount`와 결제 확정 합산을 올린다.

환불은 Stripe `Refund`가 결제 한도 안에서 돈을 돌린다. Talket `OrderRefund`도 현금 금액을 나누고, 그와 별도로 소유와 줄 수량을 돌린다. Stripe만으로는 티켓 정원이 안 돌아온다.

## 이 비교에서 남는 것

- 진열 이름과 청구 금액을 객체로 나누면, Talket 옵션 하나가 Price 역할까지 한다.
- 가격을 고칠 때 옛 금액을 남기는 방식은 Talket이 주문 스냅샷, Stripe가 새 Price다.
- 통화·청구 주기마다 Price를 두는 모델은 Talket의 KRW 단일 금액에 없다.
