# QloApps 1.7 — 객실 × 날짜가 재고인 호텔 커머스

**경로:** `QloApps/`  
**기반:** PrestaShop 1.6.1.23 포크. QloApps 릴리스 v1.7.0, 호텔 모듈 `hotelreservationsystem` 1.7.1  
**스택:** PHP 8.1+, MySQL, Smarty, ObjectModel

호텔 로직은 override 폴더가 아니라 코어 `Product`, `Cart`, `Order`, `PaymentModule`과 모듈이 같이 갖고 있다.

```
modules/hotelreservationsystem/classes/     도메인 모델, DDL
modules/wkroomsearchblock/                  날짜·인원 검색
classes/PaymentModule.php                   결제 시 예약 확정
classes/Product.php                         booking_product 플래그
```

---

## 상품은 무엇인가

PrestaShop 상품을 두 종류로 쓴다.

| `product.booking_product` | 정체 |
|---------------------------|------|
| 1 | 객실 타입. 검색·예약의 상품 |
| 0 | 조식, 픽업 같은 서비스 상품. `selling_preference_type`으로 객실/호텔/단독 판매 |

```
HotelBranchInformation (htl_branch_info)     호텔. 체크인 시각, active_refund
  └── Category                               호텔 = 카테고리 노드
  └── HotelRoomType (htl_room_type)          객실 타입 = Product
        ├── 정원: adults, children, max_guests
        ├── LOS: min_los, max_los (+ 날짜 구간 제한)
        └── HotelRoomInformation             물리 방. room_num, floor, id_status
```

물리 방 상태: `ACTIVE(1) | INACTIVE(2) | TEMPORARY_INACTIVE(3)`  
임시 중지는 `htl_room_disable_dates` 구간.

요금은 상품 기본가 + `htl_room_type_feature_pricing`(기간·요일 impact).  
선결제는 `htl_advance_payment`가 객실 타입마다 정액/정률.

**`stock_available`은 객실 타입에 999999999 같은 값을 넣어 둔다.** 가용 수량이 아니다.

`modules/hotelreservationsystem/classes/HotelRoomType.php`  
`classes/Product.php`

---

## 재고 = 날짜가 겹치는 방

확정 예약 `htl_booking_detail.id_status`:

| 값 | 의미 |
|----|------|
| 1 ASSIGNED | 확정, 미도착 |
| 2 CHECKED_IN | 투숙 |
| 3 CHECKED_OUT | 퇴실. 겹침은 `check_out` 기준 |
| 4 NO_SHOW | 노쇼 |
| 5 CANCELLED | 취소 |

`HotelBookingDetail::getSearchAvailableRooms`는 `htl_room_information`의 활성 방에서 아래를 뺀다.

1. 날짜가 겹치는 `htl_booking_detail` (환불 완료 id는 서브쿼리로 제외, `is_back_order = 0`만)
2. `htl_room_disable_dates`
3. 최소/최대 숙박 위반
4. **이 카트**가 이미 잡은 방

다른 손님의 `htl_cart_booking_data`는 검색에서 빼지 않는다. 카트 홀드는 그 손님의 장부일 뿐, 전역 선점이 아니다.

카트 행(`htl_cart_booking_data`): 방 1개 × 기간. `quantity`는 박 수. `id_order = 0`인 동안 카트.  
상품 카트 수량은 `방 수 × 박 수`로 `Cart::updateQty`에 들어간다.

결제 `PaymentModule::validateOrder`:

1. 배정된 방이 아직 비었으면 정상 확정
2. 아니면 다른 빈 방으로 교체
3. 그것도 없으면 `is_back_order = 1`

오버부킹은 `PS_OVERBOOKING_ORDER_ACTION`, `PS_MAX_OVERBOOKING_PER_HOTEL_PER_DAY`로 주문 상태를 바꾸거나 취소할 수 있다.

`modules/hotelreservationsystem/classes/HotelBookingDetail.php`  
`modules/hotelreservationsystem/classes/HotelCartBookingData.php`

---

## 환불

호텔 규칙 테이블 `htl_order_refund_rules`.

| 컬럼 | 의미 |
|------|------|
| `days` | 체크인까지 남은 일수 하한. 크거나 같은 첫 규칙 적용 |
| `payment_type` | 1 정액, 2 정률 |
| `deduction_value_full_pay` | 완납 주문의 공제 |
| `deduction_value_adv_pay` | 선결제 주문의 공제 |

`getBookingCancellationDetails`:

```
daysBeforeCancel = 요청일 ~ 체크인
맞는 규칙이 있으면 공제 = 정률이면 총액 * 비율, 정액이면 그 금액
맞는 규칙이 없으면 공제 100% (환불 0)
```

총액 = 객실 세금 포함가 + 붙은 서비스.  
호텔은 `htl_branch_info.active_refund`와 `htl_branch_refund_rules`로 규칙을 켠다.

PrestaShop 환불 테이블을 호텔 id로 확장했다.

| 테이블 | 호텔에서의 역할 |
|--------|-----------------|
| `order_return` | 요청 헤더. `event_type` = 취소(1) / 노쇼(2) / 환불(3) |
| `order_return_detail` | `id_htl_booking`으로 예약 행 연결. 수량은 박 수 |
| `order_slip` | 크레딧 전표 |

미결제 취소는 `processRefundInBookingTables`를 바로 호출한다.  
결제된 건은 관리자 승인(`AdminOrderRefundRequestsController`)에서 금액을 넣고, 필요하면 `OrderSlip::create`.  
환불 완료 상태는 `OrderReturn::getRefundedBookingIdsSubquery`에 들어가 다음 가용 검색에서 빠진다. 예전 `is_refunded` 플래그를 대체한다.

주문에는 `is_advance_payment`, `advance_paid_amount`가 있다.

`modules/hotelreservationsystem/classes/HotelOrderRefundRules.php`

---

## 예약 흐름

```mermaid
flowchart TD
  A[날짜·호텔·인원 검색] --> B[getBookingData]
  B --> C[객실 타입 선택 + 서비스]
  C --> D[num_avail 검사 후 htl_cart_booking_data INSERT]
  D --> E[체크아웃 validateCartBookings]
  E --> F[validateOrder]
  F --> G{그 방이 아직 비었나}
  G -->|예| H[htl_booking_detail ASSIGNED]
  G -->|다른 방| H
  G -->|없음| I[is_back_order = 1]
  H --> J[Assigned → Checked-in → Checked-out]
  I --> K[오버부킹 주문 상태 / 취소]
```

검색 모드: `PS_FRONT_SEARCH_TYPE`이 인원 기준(OWS) 또는 방 개수.  
운영 전이는 `HotelBookingStatus::getAllowedTransitions`, 이력은 `htl_booking_status_history`.

---

## DB (접두사 보통 `ps_`)

DDL: `modules/hotelreservationsystem/classes/HotelReservationSystemDb.php`

```
htl_branch_info ──< htl_room_type ──< htl_room_information
                         │ id_product
                         ▼
                      product (booking_product=1)
htl_cart_booking_data ── cart ── orders ── order_detail
         │
         └── htl_booking_detail ── order_return_detail.id_htl_booking
```

| 테이블 | 핵심 |
|--------|------|
| `htl_room_information` | 물리 방. `id_product`, `room_num`, `id_status` |
| `htl_cart_booking_data` | `id_cart`, `id_room`, `date_from/to`, `id_order` |
| `htl_booking_detail` | `id_order`, `id_room`, 날짜, 가격 스냅샷, `id_status`, `is_back_order` |
| `htl_room_disable_dates` | 방/타입 중지 구간 |
| `htl_order_refund_rules` | 일수별 공제 |
| `orders` | `is_advance_payment`, `advance_paid_amount` |
| `order_detail` | `is_booking_product`, 수량 = 방·박 |

날짜별 수량 테이블은 없다. 방 목록에서 겹치는 예약을 빼서 센다.

---

## 락

애플리케이션 코드에 호텔 재고용 `GET_LOCK`, `SELECT FOR UPDATE`, 카트·예약 INSERT를 감싼 트랜잭션이 없다.

세 번 다시 조회한다. 담을 때, 체크아웃 `validateCartBookings`, 결제 `validateOrder`.  
두 요청이 동시에 같은 방의 `num_avail`을 통과하면 둘 다 `htl_cart_booking_data`에 들어간다. 결제에서 한 쪽은 방 교체 또는 `is_back_order=1`이 된다.

오버부킹은 버그 처리가 아니라 **설계된 퇴로**다.

`controllers/front/CartController.php` (담기 검사)  
`classes/PaymentModule.php` (`validateOrder` 근처)

---

## 이 코드에서 가져갈 것

- 날짜 상품은 수량 컬럼 대신 **자원 × 구간 겹침**이다. 기존 커머스 재고 테이블을 억지로 쓰지 않고 더미 수량으로 껍데기만 유지한 점이 그렇다.
- 강한 락이 없으면 결제 시점의 재검증과 오버부킹 플래그가 운영 안전판이 된다.
- 환불액은 정책 테이블(체크인 N일 전, 선결제/완납 별도 공제)에서 나오고, 규칙 미매칭은 전액 공제다.
- 환불 완료 집합을 서브쿼리로 정의해, 예약 행의 bool 플래그와 어긋나지 않게 했다.

---

## 질문

### 정원과 최소 숙박은 variant인가

객실 타입 `htl_room_type`이 PrestaShop `Product`다. `adults`, `children`, `max_adults`, `max_children`, `max_guests`, `min_los`, `max_los`는 그 행의 컬럼이다. 정원이나 숙박일 규칙이 다르면 객실 타입을 새로 만든다. 디럭스와 패밀리는 상품 두 개다.

같은 상품의 특정 기간만 숙박일을 바꾸려면 `htl_room_type_restriction_date_range`에 기간과 min/max를 추가한다. combination(`product_attribute`)은 만들지 않는다.

`modules/hotelreservationsystem/classes/HotelRoomType.php`

### 주문 껍데기는 같은가

카트와 주문은 PrestaShop `Cart`, `Order`, `order_detail`이다. 달라진 축은 두 가지다. 손님은 옵션 SKU 대신 객실 타입과 날짜를 고르고, 재고는 `stock_available`이 아니라 물리 방과 날짜 겹침이다. `stock_available`은 999999999 같은 더미다.

### 방 상태를 실시간으로 저장하나

`htl_room_information.id_status`는 그 방을 판매 목록에 둘지다. `ACTIVE`, `INACTIVE`, `TEMPORARY_INACTIVE`. 임시 중지는 `htl_room_disable_dates`다.

누가 묵는지는 `htl_booking_detail`이다. 방, `date_from`, `date_to`, `id_status`(ASSIGNED, CHECKED_IN, CHECKED_OUT, NO_SHOW, CANCELLED)가 예약마다 한 줄이다. 101호가 오늘 비었는지는 오늘과 날짜가 겹치고 취소·환불되지 않은 줄을 찾는 것이다. 날짜별 재고 칸은 없다.

검색 `getSearchAvailableRooms`는 그 호텔의 활성 방에서 겹치는 확정 예약, 중지 구간, 숙박일 위반, 이 카트가 잡은 방을 뺀다. 다른 손님의 `htl_cart_booking_data`는 빼지 않는다. 결제에서 그 방이 이미 배정돼 있으면 다른 방으로 바꾸거나 `is_back_order = 1`이다.

`check_in`은 주문 확정 때 비어 있다. 프론트에서 체크인할 때 채워지고, 퇴실 뒤 겹침은 `date_to` 대신 `check_out`을 본다.

### 검색마다 빈 방을 찾으면 느린가

호텔 하나, 날짜 한 구간은 SQL 한 번이다. `getSearchAvailableRooms`가 그 호텔의 활성 방을 읽고, 빼야 할 방 id를 `NOT IN`으로 붙인다. 결과 행 수는 물리 방 수다. 인원 맞추기(OWS)는 그 목록 위에서 PHP로 한다.

비용은 과거 예약을 같이 읽는 데 있다. `htl_booking_detail`, `htl_room_information`, `htl_cart_booking_data`는 기본 키만 있다 (`HotelReservationSystemDb.php`). 겹침은 `date_from`/`date_to` 범위가 OR 네 갈래다. 체크아웃·취소 줄도 남는다. 환불 완료 id는 `order_return_detail`을 조인한 `OrderReturn::getRefundedBookingIdsSubquery`로 같은 문장 안에서 뺀다. 가용 결과 캐시는 없다.

방 수십~수백 개, 예약 수만 줄인 호텔 하나면 검색 한 번은 보통 견딘다. 예약이 수십만 줄이거나 호텔을 여러 곳 동시에 검색하면, 빈 방을 세는 양보다 테이블을 읽는 양이 커진다.

### 주문에 날짜가 같이 들어가나

장바구니 `htl_cart_booking_data`에 `date_from`, `date_to`, `id_room`이 있다. `PaymentModule::validateOrder`가 그 값을 `htl_booking_detail`로 복사하고 `id_order`, `id_status = 1`(ASSIGNED)을 붙인다. 다음 검색은 이 날짜가 겹치는 줄을 빼서 그 방을 제외한다.

`order_detail`은 객실 타입과 수량(방 수 × 박 수)이다. 어느 방의 어느 날짜인지는 `htl_booking_detail`에 있다.

### 물리 방은 무엇이고, variant인가

물리 방은 `htl_room_information` 한 줄이다. 방 번호(`room_num`)와 층이 있고, `id_product`가 객실 타입을 가리킨다. 디럭스 아래에 101·102·103이 있으면 줄은 세 개다. 손님은 디럭스를 사고, 시스템은 그중 한 칸을 배정한다. 101이 3월 1–3일에 잡히면 그 기간의 101만 빠지고 102·103은 남는다.

점유 한도는 룸타입당 1개가 아니다. 룸타입의 남은 수량은 그 날짜에 비어 있는 물리 방의 개수다. 방 하나의 겹치는 날짜만 예약 1줄이라, 그 방의 그날은 비었거나 잡혔거나 둘 중 하나다.

이 칸은 variant가 아니다. 가격·정원·숙박일은 룸타입에 있고, 결제 때 102로 바뀌어도 상품은 디럭스다. `HotelRoomInformation`은 `product_attribute`와 연결되어 있지 않다. pretix로 보면 상품은 Item이고 물리 방은 Seat이다.

지정좌석과 다른 점은 회차마다 좌석 줄을 만들지 않는다는 것이다. pretix A-12는 회차마다 줄이 하나이고 그 회차에 한 번 팔린다. 101호는 줄이 하나이고 예약마다 날짜 구간이 붙는다. 구간이 겹칠 때만 막힌다.

배정도 시스템이 한다. `HotelCartBookingData::addCartBookingData`가 그 기간의 빈 방 목록에서 필요한 수만큼 앞에서 넣어 두고, 기본 `booking_type`은 `ALLOTMENT_AUTO`다. 디럭스 2실이면 101, 102가 카트에 각각 한 줄이다. `id_room`을 넘기면 그 방이 목록에 있을 때만 그 번호를 쓴다. 결제에서 그 번호가 이미 다른 주문이면 다른 빈 방으로 바꾸거나 `is_back_order = 1`이 된다.
