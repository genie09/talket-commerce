# Talket × Odoo stock

원문: [Talket](../talket/README.md), [Odoo](README.md)

Odoo에서 재고는 장소에서 장소로 옮기는 전표다. Talket에서 재고는 옵션 정원과 주문 줄이다. 장소 이동이 없다.

## 구성

| | Talket | Odoo |
|--|--------|------|
| 그릇 | `Product` | `product.template`. 변형 합계를 보여 줌 |
| 파는 단위 | `ProductOption` | `product.product`. 속성이 없으면 템플릿당 하나 |
| 변형 생성 | 옵션을 행으로 추가 | 색 4 × 사이즈 5면 variant 20 |
| 재고를 타는 것 | 모든 옵션의 `totalCount` | 보관(storable)만 `stock.quant`. 소모품·서비스는 예약 생략 |
| 수량 위치 | 주문 줄 합 | `stock.quant`. 키는 product, location, lot, package, owner |

Talket 굿즈와 티켓은 둘 다 같은 정원 합산을 탄다. Odoo는 제품 유형이 quant를 탈지 가른다. Talket 티켓은 Odoo 서비스에 가깝게 선반이 없지만, 정원 숫자 검사는 한다.

## 재고

Odoo `stock.move`는 출발 로케이션 → 도착 로케이션이다. 수요 수량과 실제로 집은 `stock.move.line`(로트, 패키지)이 나뉜다. 판매 주문 확인이 `sale_stock`으로 배송 picking을 만든다. 견적 단계의 선점유는 코어가 아니다.

Talket 주문 확정은 picking을 만들지 않는다. `PAID`가 수요를 확정하고, 배송은 `t_delivery` 상태다. 로트·패키지·소유자별 quant는 없다. 소유는 `ProductItem` 잔액이다.

## 주문

Odoo 주문 줄은 variant다. 확인 뒤 고객 로케이션으로의 move가 재고를 예약한다. Talket 주문 줄은 옵션이고, 예약은 줄 상태 `VERIFIED`/`PAID`다. 고객 지갑으로의 이동 전표 대신 발행 명령이 소유 잔액 1을 만든다.

## 환불

Odoo 반품은 고객 로케이션에서 재고 로케이션으로의 move다. Talket 반품은 소유 회수와 줄 수량 감소다. 창고 수량이 늘어나는 전표는 없다.

## 락

Odoo는 quant 행을 잠그며 예약한다. Talket은 옵션 id 락 아래 주문 줄을 합산한다. 잠그는 대상이 실물 조각이 아니라 판매 칸이다.

## 이 비교에서 남는 것

- template / variant 두 층은 Product / ProductOption과 같다.
- 장소·로트·이동 전표는 Talket 구성에 없다.
- 서비스는 예약을 건너뛰는 Odoo와, 티켓도 정원을 검사하는 Talket은 디지털 상품의 재고 정책이 다르다.
