# Talket × Magento

원문: [Talket](../talket/README.md), [Magento](README.md)

Magento는 `type_id`가 클래스다. Talket은 카테고리와 배송 정책으로 행동을 나누고, 타입 클래스마다 가격·재고 모델이 갈라지지는 않는다.

## 구성

| Magento `type_id` | Talket에서 가까운 자리 |
|-------------------|------------------------|
| `simple` | 옵션 하나인 상품. 그 옵션이 SKU이자 정원 |
| `virtual` | 배송 정책 없는 티켓·멤버십. 결제는 있고 출고는 소유 |
| `downloadable` | 콘텐츠·파일. 구매 후 링크 재고는 없음. 아이템 행은 생김 |
| `configurable` | 부모 `Product` + 자식처럼 보이는 `ProductOption`. 부모를 직접 담지 않음 |
| `grouped` | `ProductGroup`. 진열 묶음. 재고는 멤버 각자 |
| `bundle` | 없음. `CreateProductBundle`은 상품·옵션·사용·콘텐츠를 한 번에 만드는 명령 |

Magento configurable의 자식은 카탈로그에서도 독립 simple이다. Talket 옵션은 `t_product_option` 행이고 부모 상품 없이 단독 진열되지 않는다. 색×사이즈를 슈퍼 속성으로 펼치는 단계가 없다. 옵션 이름이 곧 칸이다.

custom option(SKU가 안 갈라지는 각인)에 해당하는 필드도 Talket 옵션에는 없다. 구매자 정보 폼은 주문 줄에 붙는 질문이다.

## 재고

Magento MSI는 Source(창고)의 수량과, 그 합에 reservation을 더해 만든 판매 가능 수량을 나눈다. 예약은 불변 로그에 가깝다.

Talket은 창고 Source가 없고, 판매 가능 수량이 주문 줄 합이다. reservation 로그 테이블이 없다. `VERIFIED` 줄이 예약 역할이다.

## 주문

Magento 주문 줄은 simple SKU다. configurable 부모는 표시용으로 남고 자식이 재고를 깎는다. bundle은 선택지가 자식 줄이 된다.

Talket 주문 줄은 옵션 id다. 자식은 재고 SKU가 아니라 수량만큼의 `OrderItem`이다. 구성품 출고가 없다.

## 환불

Magento 환불은 크레딧 메모와 재고 반환 여부다. Talket은 클레임 타입과 소유 회수, 줄 수량 감소다. 창고 source item으로 되돌리지 않는다.

## 이 비교에서 남는 것

- 부모를 보여주고 자식 칸을 파는 구조는 configurable과 같다.
- 타입마다 다른 가격 모델·재고 인덱서를 등록하는 `product_types.xml` 자리는 Talket에 없다. 카테고리가 달라도 주문 합산은 하나다.
- 번들 구성품이 각자 재고를 갖는 모델은 Talket `ProductUsage`나 그룹과 다른 층이다.
