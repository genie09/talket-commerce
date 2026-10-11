# Talket × Shopify

원문: [Talket](../talket/README.md), [Shopify](README.md)

Shopify 재고는 장소마다 상태 버킷이다. Talket 재고는 옵션 정원에서 주문 줄 합을 뺀 값이다.

## 구성

| | Talket | Shopify |
|--|--------|---------|
| 진열 | `Product` | Product. 옵션 정의(Color, Size) |
| 파는 단위 | `ProductOption`. 이름 칸 | ProductVariant. 옵션 값 조합. 개수 상한 있음 |
| 재고 추적 | 항상 `totalCount` | InventoryItem의 추적 여부 |
| 장소 | 없음 | InventoryLevel = 아이템 × Location |
| 구독·프리오더 | 없음 | selling plan. 상품 타입 필드가 아님 |
| 번들 | 생성 묶음 명령뿐 | 구성품 번들. selling plan과 같이 못 팜 |

Talket이 티켓과 굿즈를 카테고리로 나누는 자리는 Shopify에서 배송 필요 여부와 selling plan이다. 주문 줄의 부모는 둘 다 Variant(옵션)다.

## 재고

Shopify `available`은 주문에 안 묶인 수량이다. `committed`는 미출고 주문·드래프트가 잡고, 플랫폼만 증감한다. `on_hand`는 물리 합이다.

Talket에는 버킷이 없다.

| Shopify | Talket |
|---------|--------|
| `available` | `totalCount` − 확정 줄 합. 별도 컬럼 없음 |
| `committed` | `VERIFIED`·`PAID`·부분취소 줄 |
| `on_hand` | 없음. 출고해도 정원이 줄지 않음 |
| `incoming`, `damaged`, `safety_stock` | 없음 |

Shopify는 주문 생성이 `committed`를 올린다. Talket은 결제 완료의 `PAID`가 그 역할이고, 그 전에 제출된 주문은 합에 없다.

## 주문

Shopify 환불은 돈과 `restock` 타입을 따로 고른다. 재입고할 버킷을 라인마다 정한다.

Talket 환불은 돈을 `OrderRefund`로, 물건을 소유 회수로 처리한다. 재입고 타입은 없고, 취소 수량이 다음 정원 합에서 빠지면 다시 팔린다. 망가진 재고 버킷으로 돌리는 선택은 없다.

## 이 비교에서 남는 것

- 옵션 조합이 Variant가 되고 부모 Product는 담지 못하는 점은 같다. Talket은 조합 생성이 아니라 칸을 직접 만든다.
- 장소별 버킷과 “플랫폼만 만지는 committed”는 Talket에 없다.
- 출고가 물리 수량을 줄이는 Shopify와, 출고가 배송 상태만 바꾸는 Talket은 굿즈에서 갈린다.
