# Talket × commercetools

원문: [Talket](../talket/README.md), [commercetools](README.md)

commercetools에서 상품 타입은 속성 스키마이고, 재고 모드는 카트 기본값이며 라인마다 바꿀 수 있다. Talket 타입은 카테고리 문자열이고, 재고 방식은 옵션 정원 합산 하나다.

## 구성

| | Talket | commercetools |
|--|--------|----------------|
| 스키마 | 콘텐츠 `goods.v1` / `ticket.v1` | Product Type. 상품군마다 속성 정의 |
| 그릇 | `Product`. 그 자체도 진열·정책의 단위 | Product. 타입을 하나 가진다. 그 자체는 못 팜 |
| 파는 단위 | `ProductOption` | Product Variant. SKU. 최소 1개, 상한 100 |
| 묶음 | `ProductGroup`은 진열 | Category는 검색 묶음. 재고 없음 |
| 가격 | 옵션에 KRW 두 필드 | Price가 통화, 국가, 고객 그룹, 채널, 기간을 가짐 |

Talket 옵션은 Variant와 같다. Product Type으로 티켓 필드와 굿즈 필드를 나누는 자리는 Talket에서 콘텐츠 스키마와 카테고리다. 주문 엔진이 그 스키마로 재고를 가르지는 않는다.

## 재고

commercetools `InventoryMode`는 라인마다 `None`, `TrackOnly`, `ReserveOnOrder`, `ReserveOnCart`다.

Talket은 전 라인이 `ReserveOnOrder`에 가깝다. 카트는 예약하지 않고, 결제 완료 때 가용을 보고 모자라면 실패한다. `ReserveOnCart`에 해당하는 전역 홀드는 없다. ID 풀은 일부 바로구매만 선점한다. `TrackOnly`처럼 음수 재고를 허용하지 않는다. `None`처럼 검사를 끄는 플래그도 없다.

가용 숫자의 반영은 commercetools가 eventual(문서상 최대 약 10초)이다. Talket 합산은 결제 확정 트랜잭션에서 주문 줄을 직접 센다.

## 주문

commercetools는 카트에서 주문으로 넘길 때 모드에 따라 재고를 줄이거나 예약을 넘긴다. 같은 SKU를 창고 둘에서 보내면 라인을 두 개 만들고 `supplyChannel`을 단다.

Talket 줄은 옵션 하나당 하나다. 창고 채널이 없어 라인을 장소로 쪼개지 않는다. 수량은 자식 아이템 개수다.

## 환불

commercetools 반품은 재고를 되돌리는 경로와 결제 환불이 문서에서 갈라진다. Talket도 소유 회수와 `OrderRefund`가 갈라지고, 정원은 줄 상태가 합에서 빠지며 돌아온다.

## 이 비교에서 남는 것

- 같은 주문에 재고 방식을 라인마다 바꾸는 모드는 Talket에 없다. 티켓 옵션과 굿즈 옵션이 한 합산 규칙을 쓴다.
- “Product는 못 팔고 Variant를 판다”는 Talket의 “상품 정책과 옵션 판매 칸”과 같다.
- 채널·고객 그룹·기간이 붙은 가격 선택과 창고 `supplyChannel`은 Talket 옵션 금액에 없다.
