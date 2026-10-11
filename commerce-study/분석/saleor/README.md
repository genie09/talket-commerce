# Saleor 3.24 — 창고 할당이 분명한 헤드리스 커머스

**경로:** `saleor/`  
**버전:** 3.24.0-a.0 (`pyproject.toml`)  
**스택:** Python 3.12, Django 5.2, Graphene GraphQL, Celery, PostgreSQL

도메인 앱이 모델과 절차를 갖고, `saleor/graphql/`은 API 껍질이다. 결제의 최신 경로는 플러그인 직접 호출보다 **결제 앱 + TransactionItem** 쪽이다.

```
saleor/product      카탈로그
saleor/warehouse    재고·할당·예약
saleor/checkout     체크아웃 → 주문
saleor/order        주문·출고·환불 허가
saleor/payment      Payment(레거시), TransactionItem(현재)
saleor/giftcard
```

---

## 상품은 무엇인가

```
ProductType          kind = normal | gift_card, 배송 필요 여부, 세금
  └── Product        이름, slug, 카테고리(MPTT), 컬렉션
        └── ProductVariant     SKU. 체크아웃 라인은 항상 variant
              ├── ProductVariantChannelListing   채널별 가격
              └── Stock (창고별)
```

채널(`Channel`)이 통화, 창고 배분 전략, “미결제 주문 허용”, “결제 완료 시 자동 주문”을 정한다. 가격·공개 여부는 상품 자체가 아니라 **채널 리스팅**에 있다.

| 축 | 필드 |
|----|------|
| 기프트카드 | `ProductType.kind == gift_card`. 별도 상품 클래스가 아님 |
| 재고 추적 끄기 | `ProductVariant.track_inventory = false` 이면 할당·예약·가용 검사를 건너뜀 |
| 선주문 | `is_preorder`, `preorder_global_threshold`. 3.24에서 API는 빠지고 필드는 남음 |
| 디지털 파일 | `DigitalContent`는 3.24 상태에서 제거. 배송 필요 여부로 구분 |
| 고객당 한도 | `quantity_limit_per_customer` |
| 변형을 가르는 값 | `AssignedVariantAttributeValue` (사이즈, 색) |

`saleor/product/models.py`, `saleor/channel/models.py`, `saleor/attribute/models/`

---

## 재고

| 모델 | 테이블 | 의미 |
|------|--------|------|
| Stock | `warehouse_stock` | 창고 × variant. `quantity`, 비정규화 `quantity_allocated`. unique `(warehouse, product_variant)` |
| Allocation | `warehouse_allocation` | **주문 라인**이 가져간 수량. unique `(order_line, stock)` |
| Reservation | `warehouse_reservation` | **체크아웃 라인**의 TTL 홀드. unique `(checkout_line, stock)` |
| Warehouse | `warehouse_warehouse` | 채널·배송구역에 연결 |

```
available = max(quantity - quantity_allocated - 미만료 reservation, 0)
```

| 함수 | 파일 | 하는 일 |
|------|------|---------|
| `reserve_stocks` | `warehouse/reservations.py` | 체크아웃 라인 변경 시 소프트 홀드 |
| `allocate_stocks` | `warehouse/management.py` | 주문 생성 시 Allocation 생성, `quantity_allocated` 증가 |
| `decrease_stock` | 같은 파일 | 출고: 할당 해제 + `quantity` 감소 |
| `increase_stock` | 같은 파일 | 반품 입고 |
| `deallocate_stock` | 같은 파일 | 취소·반품 시 할당만 되돌림 |

예약 길이는 로그인 사용자 / 비로그인 설정이 다르다. 주문 생성 시 `check_reservations=True`로 **자기 체크아웃 예약은 가용 계산에서 빼지 않고**, 다른 사람의 예약은 뺀다. 체크아웃을 지우면 예약은 cascade로 사라진다.

`quantity_allocated`는 할당 합과 어긋날 수 있어 Celery `update_stocks_quantity_allocated_task`가 맞춘다. DB CheckConstraint로 `quantity >= allocated`를 강제하지는 않는다.

---

## 환불

두 갈래다.

### 현재: TransactionItem + OrderGrantedRefund

1. 스태프가 `OrderGrantRefundCreate`로 **환불해도 되는 금액**을 기록한다. 라인 수량, 배송비 포함 여부를 적을 수 있다.
2. `TransactionRequestRefundForGrantedRefund`가 결제 앱에 `TRANSACTION_REFUND_REQUESTED` 웹훅을 보낸다.
3. 앱이 `REFUND_SUCCESS` / `REFUND_FAILURE` 이벤트를 돌려준다.
4. `OrderGrantedRefund.status`: `NONE → PENDING → SUCCESS | FAILURE`.

금액은 `transaction.charged_value`를 넘지 못한다. 주문 `charge_status`는 `총액 - 허가된 환불`로 다시 계산된다.

### 레거시: Payment.charge_status

`NOT_CHARGED → PARTIALLY_CHARGED → FULLY_CHARGED → PARTIALLY_REFUNDED → FULLY_REFUNDED`

반품은 `create_fulfillments_for_returned_products` (`order/actions.py`). 돈 환불과 재고 복원을 같이 하고, fulfillment 상태가 `RETURNED`, `REFUNDED`, `REFUNDED_AND_RETURNED`, `REPLACED`로 갈린다. `replace=True`면 교체용 draft 주문을 만든다.

### 주문 상태 (출고 기준)

```
DRAFT → UNCONFIRMED → UNFULFILLED → PARTIALLY_FULFILLED → FULFILLED
                    → PARTIALLY_RETURNED → RETURNED
                    → CANCELED / EXPIRED
```

`authorize_status`, `charge_status`는 출고 상태와 별도 축이다. `saleor/order/models.py`, `saleor/payment/models.py`

---

## 주문 흐름

```mermaid
sequenceDiagram
  participant CH as Checkout
  participant RS as reserve_stocks
  participant CO as create_order_from_checkout
  participant AS as allocate_stocks
  CH->>RS: 라인 변경 시 TTL 예약
  Note over RS: SELECT FOR UPDATE stock ORDER BY pk
  CO->>CO: SELECT FOR UPDATE checkout
  CO->>CO: Order + OrderLine 생성
  CO->>AS: 가용 = quantity - 할당 - 남의 예약
  AS->>AS: Allocation INSERT, quantity_allocated += n
  CO->>CH: checkout 삭제, 예약 cascade
```

`complete_checkout`은 결제 방식에 따라 갈린다. 트랜잭션(앱) 흐름, 전액 승인, 미결제 허용이면 주문부터 만들고, 레거시 결제는 캡처 후 주문을 만든다.

출고 `create_fulfillments`는 주문 라인을 잠근 뒤 `decrease_stock`으로 물리 수량을 줄인다. 기프트카드 variant는 이때 카드가 발급된다.

---

## 락

`saleor/warehouse/lock_objects.py`

```python
qs.order_by("pk").select_for_update(of=["self"])
# 할당+재고를 같이 잠글 때
Allocation.objects.select_for_update(of=("self", "stock")).order_by("stock__pk")
```

| 지점 | 잠그는 것 |
|------|-----------|
| 할당·예약·차감 | Stock 행, pk 오름차순 |
| 체크아웃 완료 | `Checkout` 행 (`complete_checkout.py`) |
| 출고 | 주문 라인 |
| 환불 실행 | 주문 + TransactionItem (`payment/lock_objects.py`) |
| 카테고리 트리 | `pg_advisory_xact_lock` — **재고에는 안 씀** |

잠금 순서를 pk로 고정해 교착을 피한다. 예약 TTL을 끄면, 두 체크아웃이 할당 전까지는 둘 다 가용 검사를 통과할 수 있다. 할당 트랜잭션의 행 락이 마지막 관문이다.

`@traced_atomic_transaction()` = `transaction.atomic()` + 트레이싱. 재고 변경은 이 데코레이터 안에서 일어난다.

---

## 이 코드에서 가져갈 것

- **Reservation(체크아웃)과 Allocation(주문)을 테이블로 분리**한 것이 가장 교과서적이다.
- 채널이 가격·창고·정책의 경계다. 상품 테이블에 가격을 넣지 않는다.
- 비정규화 컬럼(`quantity_allocated`)은 편하지만 드리프트가 나서 배치로 맞춘다.
- 환불 “허가”와 환불 “실행”을 나눈다. 실행은 결제 앱이 한다.

---

## 질문

### Checkout과 Reservation은 어떻게 다른가

Checkout은 주문이 되기 전의 구매 세션이다. 상품을 담을 때 생기고, 주소·배송·결제가 그 객체에 쌓인 뒤, 완료되면 Order가 생기고 Checkout은 삭제된다. 장바구니 테이블은 따로 없다.

Reservation은 `warehouse_reservation` 한 줄이다. Checkout 라인이 바뀔 때 `reserve_stocks`가 만들고, `reserved_until`까지 그 `Stock` 칸의 수량을 다른 사람이 사지 못하게 잡는다. 주문이 되면 이 줄은 Checkout 삭제와 함께 사라지고, 같은 수량은 주문 라인의 Allocation이 된다. 주문 생성 때는 자기 Checkout의 예약만 가용 계산에서 빼지 않아서, 자기가 잡아 둔 수량을 자기가 확정한다.

모델은 Django 클래스다. `db_table`은 없다.

| 클래스 | 파일 | 테이블 |
|--------|------|--------|
| `Checkout` | `saleor/checkout/models.py` | `checkout_checkout` |
| `CheckoutLine` | 같은 파일 | `checkout_checkoutline` |
| `Reservation` | `saleor/warehouse/models.py` | `warehouse_reservation` |
| `Stock` | 같은 파일 | `warehouse_stock` |
| `Allocation` | 같은 파일 | `warehouse_allocation` |

`Reservation` 필드는 `checkout_line`, `stock`, `quantity_reserved`, `reserved_until`이다. `(checkout_line, stock)`이 유일하다. `objects.not_expired()`는 `reserved_until`이 현재보다 큰 행만 남긴다.

### Attribute와 Variant는 어떻게 다른가

Attribute는 속성의 이름과 고를 수 있는 값이다. 사이즈, 색, 그리고 S·M·빨강. 가격과 재고는 없다. Variant는 그 값으로 갈라진 SKU다. 체크아웃 라인, 채널 가격, 창고 재고가 variant에 붙는다.

한 variant에 속성은 여러 개 붙는다. 상품 타입에 “색과 사이즈를 쓴다”는 `AttributeVariant`는 타입당 한 번만 있다. variant마다 `AssignedVariantAttribute`가 속성 수만큼, `AssignedVariantAttributeValue`가 고른 값 수만큼 생긴다. 빨강·M 하나면 연결 2행, 값 2행이다. 소재처럼 상품 전체 설명은 `AttributeProduct`라 variant를 늘리지 않는다.

만드는 순서는 Attribute → AttributeValue → ProductType → AttributeVariant까지가 타입 정의이고, 그다음 Product → ProductVariant를 만든 뒤 `associate_attribute_values_to_instance`가 연결 행과 값 행을 넣는다.

### 상품을 정의하는 테이블은 몇 개인가

상품 정의, 가격, 재고, 채널을 겹침 없이 세면 19개다. 카테고리·컬렉션·이미지·번역까지 넣으면 29개이고, 상품에 붙는 세금 클래스 2개(`tax_taxclass`, `tax_taxclasscountryrate`)를 더하면 31개다.

가격 전용 테이블은 없다. 판매가는 `product_productvariantchannellisting`의 `price_amount` 등이고, 규칙별 할인액은 `product_variantchannellistingpromotionrule`이다. 재고는 `warehouse_warehouse`, `warehouse_stock`, `warehouse_allocation`, `warehouse_reservation`이다. 채널은 `channel_channel`, 상품 리스팅, variant 리스팅, `warehouse_channelwarehouse`다. variant 리스팅은 가격이면서 채널이라 한 번만 센다.

`warehouse_allocation`과 `warehouse_reservation`은 상품을 정의할 때 만드는 행이 아니다. 체크아웃과 주문이 생길 때 생긴다. 선주문 두 테이블은 3.24 제거 예정이다.

### Variant, 채널, Stock은 어떻게 연결되는가

채널은 나라와 1:1이 아니다. 같은 가게의 판매처이고, 통화·가격·공개·쓰는 창고가 채널마다 다를 수 있다. `default_country`에 유일 제약은 없다.

```text
Channel ── ChannelWarehouse ── Warehouse ── Stock ── ProductVariant
   └──── ProductVariantChannelListing ──── ProductVariant
```

가격 줄은 variant 수 × 채널 수다. 셔츠 M 하나, 채널 둘이면 가격 줄은 2개다. 창고 수는 가격 줄에 들어가지 않는다.

Stock은 variant를 직접 가리킨다. `(warehouse, product_variant)`가 유일해서, 창고가 둘이면 Stock도 둘이다. 채널 컬럼은 없다. 채널은 `ChannelWarehouse`로 창고를 고르고, 그 창고의 Stock만 후보가 된다.

어느 창고에서 뺄지는 `allocate_stocks`가 정한다. 채널에 연결된 창고 중 배송이면 고객 나라의 배송 구역에 속한 창고만 남긴다. 기본 전략 `prioritize-sorting-order`는 `ChannelWarehouse.sort_order`다. `prioritize-high-stock`은 남은 수량이 많은 창고부터다. 한 창고가 모자라면 다음 창고로 나눈다. 이때 줄어드는 것은 `quantity`가 아니라 Allocation과 `quantity_allocated`다.

### 할인은 어디에 붙는가

카탈로그 프로모션만 variant의 채널 가격을 바꾼다. 맞는 규칙이 여러 개면 할인액이 가장 큰 하나다. `price_amount`는 원래 판매가, `discounted_price_amount`는 할인가다. 체크아웃에 담기면 그 액이 `CheckoutLineDiscount`로 복사된다.

주문 프로모션과 바우처는 가격 줄을 바꾸지 않는다. `CheckoutDiscount`·`OrderDiscount` 또는 바우처 할인 줄로 남는다.

### Reservation과 Allocation, 그리고 출고

`Stock`은 창고 × variant 한 칸이다. `quantity`는 그 칸의 물리 수량이다. `CheckoutLine.quantity`는 고객이 담은 개수라 다른 숫자다.

Reservation은 체크아웃 줄이 바뀔 때 생긴다. 예약 시간이 설정에 꺼져 있으면 생기지 않고, 주문의 Allocation이 첫 선점이다. `Stock.quantity`는 건드리지 않는다. `(checkout_line, stock)`이 유일해서 창고를 나눠 잡으면 줄이 여러 개다. 다시 담으면 기존 예약을 지우고 새로 넣는다. 만료된 줄은 합산에서 빠지고, Checkout이 지워지면 같이 지워진다.

Allocation은 주문 생성 때 생긴다. `(order_line, stock)`이 유일하고, 합만큼 `Stock.quantity_allocated`가 오른다. 물리 수량은 그대로다.

선점·주문 때의 판매 가능 수는 그 채널이 쓸 수 있는 Stock만 합친다.

```text
팔 수 있는 수 = max(quantity 합 - 할당 합 - 다른 사람의 미만료 예약 합, 0)
```

자기 Checkout의 예약은 빼지 않는다. 수량을 고칠 때 자기 몫을 두 번 빼지 않기 위해서다.

출고의 `decrease_stock`은 한 트랜잭션에서 할당을 먼저 지우고, 그다음 `quantity`를 줄인다. 할당은 “아직 창고에 있지만 이 주문 몫”이라는 표시이고, `quantity`는 실제로 있는 장수다. 표시를 남긴 채 물리 수량만 줄이면 이미 보낸 수량이 가용 수에서 한 번 더 빠진다.

창고 테이블은 `warehouse_warehouse`, `warehouse_channelwarehouse`, Django가 만든 `warehouse_warehouse_shipping_zones`, `warehouse_stock`, `warehouse_reservation`, `warehouse_allocation`이다. 선주문 둘은 Stock이 아니라 variant 채널 리스팅을 가리키고, 제거 예정이다.
