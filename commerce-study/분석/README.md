# 커머스 프로젝트 학습 가이드

이 폴더는 워크스페이스의 8개 프로젝트를 학습용으로 정리한 노트다.

- 이 파일과 아래 표의 문서: **상품 정의, 재고, 환불, 주문 흐름, DB, 락**
- [용어.md](용어.md): 같은 영어가 프로젝트마다 가리키는 층. 영어·한국어와 로컬 이름
- [직접입력-옵션.md](직접입력-옵션.md): 등번호처럼 구매자가 텍스트를 넣는 칸. 재고를 안 보고, 구매폼·판매 옵션과 어디가 다른지
- [통합재고.md](통합재고.md): 재고가 variant에 붙는 경우와, 여러 판매 단위가 수량 하나를 같이 쓰는 경우
- [여행.md](여행.md): 노랑풍선처럼 출발일·잔여석이 있는 여행상품에 가까운 오픈소스
- [한-커머스로-모으기.md](한-커머스로-모으기.md): 여러 상품군을 **한 주문**에 넣으려면 무엇을 공통으로 두고 무엇을 전략으로 빼는지
- [한-커머스로-모으기-v2.md](한-커머스로-모으기-v2.md): 여행·푸드·팬덤·축제·오프라인 콘서트·온라인 콘서트를 그 뼈대에 올릴 때 판매 단위와 전략을 어떻게 두는지
- [한-커머스로-모으기-v3.md](한-커머스로-모으기-v3.md): 지금 톡켓 테이블과 결제 확정에서 그 커널로 올리는 순서
- [정산/README.md](정산/README.md): 플랫폼별 정산 구조와, 톡켓에서 캡처 하나를 줄마다 나누는 원장
- 각 프로젝트 폴더의 `아키텍처.md`: 레포별 부팅, 디렉터리, 요청이 지나가는 파일, 테이블 관계, 확장 지점, 읽을 순서
- [추가-학습.md](추가-학습.md): 이 8개 다음에 볼 것. 상세 노트는 각 프로젝트 폴더

| 문서 | 프로젝트 | 도메인 | 재고의 실체 |
|------|----------|--------|-------------|
| [medusa/README.md](medusa/README.md) | Medusa 2.20 | 헤드리스 커머스 | 위치별 수량 + 예약(reservation) |
| [saleor/README.md](saleor/README.md) | Saleor 3.24 | 헤드리스 커머스 | 창고 수량 + 주문 할당 + 체크아웃 예약 |
| [spree/README.md](spree/README.md) | Spree 6.0 alpha | 모놀리식 커머스 | 선반 수량 + 할당 수량 + 재고 이동 원장 |
| [pretix/README.md](pretix/README.md) | pretix 2026.8 | 이벤트 티켓 | 쿼터 용량을 주문·카트·바우처로 계산 |
| [alfio/README.md](alfio/README.md) | alf.io 2.0-M6 | 이벤트 티켓 | 좌석 1개 = `ticket` 행 1개 |
| [qloapps/README.md](qloapps/README.md) | QloApps 1.7 | 호텔 | 물리 객실 × 날짜 겹침 |
| [easyappointments/README.md](easyappointments/README.md) | Easy!Appointments 1.6 | 예약 스케줄 | 제공자 시간 + 동시 인원 |
| [librebooking/README.md](librebooking/README.md) | LibreBooking 5.3 | 자원 예약 | 자원의 시간 배타 |
| [talket/README.md](talket/README.md) | Talket (`camellia-main-server`) | 티켓·굿즈 | 옵션 정원을 결제 확정 때 주문 줄로 합산 |

위 8개는 이 워크스페이스에 클론된 학습 레포다. Talket은 그 바깥의 운영 서버를 같은 축으로 적은 것이다. 프로젝트별 구성 비교는 [talket/비교.md](talket/비교.md)다.

아키텍처·소스 구조·DB 관계는 따로 있다.

| 문서 | 이 레포에서 구조적으로 볼 것 |
|------|------------------------------|
| [한-커머스로-모으기.md](한-커머스로-모으기.md) | 여섯 겹과 가용성 전략 네 개. 설계를 시작할 때 |
| [한-커머스로-모으기-v3.md](한-커머스로-모으기-v3.md) | 톡켓 결제 확정을 포트로 빼는 이전 순서 |
| [medusa/아키텍처.md](medusa/아키텍처.md) | 모듈 경계, 링크, 워크플로 보상 |
| [saleor/아키텍처.md](saleor/아키텍처.md) | 얇은 GraphQL, 채널, 앱이 돈을 소유 |
| [spree/아키텍처.md](spree/아키텍처.md) | 카트/주문 분리, `external_step`, 재고 원장 |
| [pretix/아키텍처.md](pretix/아키텍처.md) | 시그널 플러그인, 합산 쿼터, 이질적 라인 |
| [alfio/아키텍처.md](alfio/아키텍처.md) | SQL 리포지토리, SKIP LOCKED, 커밋 후 확정 |
| [qloapps/아키텍처.md](qloapps/아키텍처.md) | 기존 주문에 날짜 자원을 붙인 비용 |
| [easyappointments/아키텍처.md](easyappointments/아키텍처.md) | 주문 없이 슬롯만 있을 때 빠지는 층 |
| [librebooking/아키텍처.md](librebooking/아키텍처.md) | 규칙 파이프라인, series/instance, 크레딧 원장 |

---

## 1. 상품(product)은 세 층(layer)으로 나뉜다

커머스 세 프로젝트(Medusa, Saleor, Spree)는 이름이 달라도 같은 뼈대다.

1. **타입/템플릿(type/template)** — 배송(shipping) 여부, 속성 스키마(attribute schema), 기프트카드(gift card) 같은 행동
2. **상품(product)** — 카탈로그(catalog)에 보이는 이름·설명·카테고리(category)
3. **변형(variant)** — 실제로 사고파는 SKU. 가격(price)과 재고(stock)는 여기에 붙는다

“빨간 셔츠 M”과 “빨간 셔츠 L”은 상품 2개가 아니라 **상품 1개 + 변형 2개**다.

티켓·예약 쪽은 SKU가 없다.

| 프로젝트 | 파는 단위 | 서로 다른 상품을 나누는 축 |
|----------|-----------|------------------------------|
| pretix | `Item` (+ `ItemVariation`) | 입장권 / 애드온 / 번들, 그리고 쿼터 |
| alf.io | `TicketCategory` 안의 `Ticket` 행 | bounded(자리 선점) / unbounded(공용 풀), 판매 기간 |
| QloApps | 객실 타입 = PrestaShop `Product` | 호텔, 인원, 최소/최대 숙박, 날짜별 요금 |
| Easy!Appointments | `Service` | 시간(분), 표시 가격, 동시 예약 인원 |
| LibreBooking | `BookableResource` | 최소/최대 시간, 승인, 버퍼, 크레딧 |

---

## 2. 재고(stock)를 지키는 다섯 가지 방식

같은 “품절”이라도 구현이 완전히 다르다. 이 차이가 이 저장소에서 가장 배울 점이다.

### A. 수량 카운터(quantity counter) (Medusa, Saleor, Spree)

선반에 숫자가 있다. 팔릴 수 있는 수는 대략 아래다.

```
팔 수 있는 수 = 물리 수량(on-hand) - 이미 약속한 수량(allocated) - (있으면) 체크아웃 예약(checkout reservation)
```

| | 물리 수량(on-hand) | 약속(allocation) | 체크아웃 홀드(hold) | 실제 차감 시점 |
|--|-----------|------------|----------------|----------------|
| Medusa | `inventory_level.stocked_quantity` | `reserved_quantity` + `reservation_item` | 카트는 검사만, 주문 확정 때 예약 | 출고(fulfillment) 때 `stocked` 감소 |
| Saleor | `warehouse_stock.quantity` | `allocation` + `quantity_allocated` | `reservation` (TTL) | 출고 때 할당 해제 + `quantity` 감소 |
| Spree 6 | `stock_level.count_on_hand` | `allocated_count` + movement `allocated` | `stock_reservation` (TTL, 기본 10분) | 출고 때 movement `shipped` |

세 프로젝트 모두 **주문 넣는 순간 선반(on-hand) 숫자를 깎지 않는다.** 먼저 “이 수량은 내 것이다”를 기록하고, 물건을 보낼 때 선반에서 뺀다. 반품(return)하면 선반으로 되돌린다.

Medusa만 그 숫자가 variant에 직접 있지 않다. `product_variant_inventory_item`이 variant와 inventory item을 N:N으로 잇고, 수량은 inventory item × 창고인 `inventory_level`에 있다. 한 inventory item에 variant를 여러 개 걸면 재고를 같이 쓰고, variant 하나에 inventory item을 여러 개 걸면 키트다. 키트의 개수는 링크의 `required_quantity`다. 자세한 표는 [medusa/README.md](medusa/README.md)의 variant와 재고 항목 연결을 본다.

### B. 계산된 용량(calculated capacity) (pretix)

`quota.size`만 저장하고, 팔린 수는 컬럼으로 두지 않는다. 매번 센다.

```
남은 수 = size
        - 결제대기·결제완료 주문
        - 미만료 카트
        - 쿼터를 묶어 둔 바우처
        - (설정 시) 대기자
```

장점은 상태가 어긋날 카운터가 없다는 점이다. 단점은 쓸 때마다 집계하고, 그 집계를 락으로 감싸야 한다는 점이다.

### C. 행 = 재고 1개(row per unit) (alf.io)

티켓 100장이면 `ticket` 행이 100개다. 상태는 `FREE → PENDING → ACQUIRED → CHECKED_IN`처럼 행이 이동한다. 수량을 `UPDATE qty = qty - 1` 하지 않는다. **빈 행을 집어 가는 것**이 판매다.

권종은 `ticket_category`이고, 일반과 VIP는 행이 처음부터 갈라져 있다. 안 팔린 VIP 행이 일반으로 넘어가지 않는다. pretix 쿼터는 그 반대로, 주문 줄 하나가 객석 풀과 VIP 상한에 같이 집계될 수 있다. 표는 [alfio/README.md](alfio/README.md)의 pretix 비교를 본다.

### D. 날짜·시간 점유(interval occupancy) (QloApps, Easy!Appointments, LibreBooking)

- QloApps: 객실 101호는 3/1–3/3에 예약이 있으면 그 구간에서 빠진다. `stock_available`은 999999999 같은 더미다.
- Easy!Appointments: 제공자 근무시간에서 기존 예약·휴식·휴무를 빼고 슬롯을 만든다. `attendants_number`가 1보다 크면 같은 슬롯에 여러 명을 받는다.
- LibreBooking: 자원의 기존 예약·블랙아웃과 시간이 겹치면 거절한다. 악세서리만 수량(`accessory_quantity`)이 있다.

QloApps의 룸타입은 상품이고, 물리 방(`htl_room_information`의 방 번호)은 variant가 아니다. 같은 방이 겹치지 않는 날짜에 다시 팔리고, 담을 때 빈 방 목록에서 자동 배정한다. 그날 비었는지는 방 상태 컬럼이 아니라 겹치는 `htl_booking_detail`을 빼서 구한다. 그 조회는 호텔당 SQL 한 번이지만 예약 테이블에 호텔·날짜 인덱스가 없고 가용 캐시도 없다. 표는 [qloapps/README.md](qloapps/README.md)의 질문을 본다.

### E. 오버부킹(overbooking)을 허용하는 안전판 (QloApps)

QloApps는 막지 못하면 `htl_booking_detail.is_back_order = 1`로 남기고 관리자가 방을 바꾼다. 강한 락 대신 **사후 조정**을 택한 경우다.

---

## 3. 락(lock)은 “누가 마지막 1개를 가져가나”를 정한다

| 강도 | 프로젝트 | 기법 | 마지막 1개 |
|------|----------|------|------------|
| 강함 | alf.io | `SELECT … FOR UPDATE SKIP LOCKED` 후 상태 변경 | 잠긴 행은 건너뛰고, 빈 행이 부족하면 예외 |
| 강함 | Saleor | `select_for_update`를 stock pk 순서로 | 할당 트랜잭션 안에서 가용 수 재계산 |
| 강함 | pretix | 트랜잭션 advisory lock (`pg_advisory_xact_lock`) | 쿼터 락을 잡은 쪽에서만 가용 수 갱신 |
| 강함 | Medusa | `pg_advisory_xact_lock` 또는 Redis lock, 환불은 `FOR UPDATE` | 재고 아이템 키로 예약 생성을 직렬화 |
| 강함 | Spree 6 | `stock_level.with_lock`, 주문·환불도 행 락 | 선반 가감과 환불 금액 검증을 행 락 안에서 |
| 약함 | QloApps | 락 없음. 담을 때·결제 때 다시 조회 | 둘 다 성공하면 한 쪽은 오버부킹 |
| 약함 | Easy!Appointments | 트랜잭션 없음. 슬롯 재확인 후 INSERT | 둘 다 통과하면 같은 시간에 두 예약 |
| 약함 | LibreBooking | 문장마다 autocommit. 겹침은 PHP에서 검사 | 둘 다 통과하면 같은 자원·시간이 두 건 |

읽을 때 패턴 이름만 기억하면 된다.

- **비관적 행 락(pessimistic row lock)**: `SELECT FOR UPDATE`, Rails `with_lock`. 읽는 순간 다른 트랜잭션(transaction)이 그 행을 못 고친다.
- **advisory lock**: 행이 없어도 되는 자물쇠. pretix 쿼터(quota), Medusa 재고 키처럼 “이 숫자 묶음”을 잠글 때 쓴다.
- **SKIP LOCKED**: 잠긴 행을 기다리지 않고 다음 행으로. 좌석 풀(seat pool)에서 많이 쓴다.
- **상태 조건 UPDATE(conditional update)**: `UPDATE … WHERE status = 'ACQUIRED'`. 0행이면 이미 누군가 바꿨다는 뜻이다.
- **낙관적 버전(optimistic version)**: Spree `lock_version`은 API가 직접 비교하고 409를 낸다. Rails 자동 낙관적 락은 꺼 두었다.
- **검사 후 삽입(check-then-insert)**: 락이 없으면 검사와 삽입 사이에 다른 요청이 끼어든다.

Saleor와 Spree는 여러 행을 잠글 때 **pk 순서**를 고정한다. 순서가 다르면 교착(deadlock)이 난다.

---

## 4. 환불(refund)은 “돈(payment)”과 “재고 원복(restock)”이 따로다

환불 한 건은 보통 두 단계다.

1. **물건/자리 반환(release)** — 할당 해제(deallocate), 선반 증가, 티켓 `RELEASED`, 객실 상태를 취소로
2. **돈 반환(refund)** — 결제사 API, 스토어 크레딧(store credit), 크레딧 노트(credit note), 전액 포기(취소 수수료(cancellation fee))

| 프로젝트 | 환불 모델 | 부분 환불 | 재고는 언제 돌아오나 |
|----------|-----------|-----------|----------------------|
| Medusa | `Refund` + Return / Claim / Exchange | 캡처 금액 이하로 금액 지정 | 반품 수령 때 `stocked_quantity` 증가 |
| Saleor | `OrderGrantedRefund` → 결제 앱 웹훅, 또는 레거시 `Payment` | 라인 수량·금액 지정 | 반품 fulfillment에서 deallocate + increase |
| Spree 6 | `Return` 하나 (`requested → approved → received → refunded`) | 여러 번에 나눠 환불 | 재판매 가능 수량을 `received` 이동으로 |
| pretix | `OrderRefund` 상태 머신 + 취소 수수료 | 결제 건별로 자동 분할, 기프트카드 환불 | 주문이 `canceled`면 다음 쿼터 계산에서 빠짐 |
| alf.io | 게이트웨이 환불 + 크레딧 노트 | 티켓 단위 금액 | 티켓 `RELEASED`, unbounded면 `category_id`를 다시 null |
| QloApps | `order_return` + 체크인 N일 전 규칙 | 라인별 금액, 크레딧 슬립 | 환불 완료된 예약은 가용 조회에서 제외 |
| Easy!Appointments | 결제 없음 | 없음 | 예약 행을 DELETE |
| LibreBooking | 내부 크레딧 복원. 카드 환불은 크레딧 구매분만 | 크레딧은 미사용분 | `status_id = 2`로 소프트 삭제되어 겹침 검사에서 빠짐 |

pretix·QloApps는 **취소 수수료**가 있다. 전액 환불이 기본이 아니다. QloApps는 규칙에 안 걸리면 환불액 0(전액 공제)이다.

---

## 5. 어떤 파일을 먼저 열면 되나

재고·락만 따라가려면 아래만 열어도 된다.

| 보고 싶은 것 | 파일 |
|--------------|------|
| Medusa 예약 생성 | `medusa/packages/modules/inventory/src/services/inventory-module.ts` |
| Medusa 주문 확정 | `medusa/packages/core/core-flows/src/cart/workflows/complete-cart.ts` |
| Saleor 할당 | `saleor/saleor/warehouse/management.py` |
| Saleor 락 순서 | `saleor/saleor/warehouse/lock_objects.py` |
| Spree 선반 락 | `spree/spree/core/app/models/spree/stock_level.rb` |
| Spree 주문 완료 할당 | `spree/spree/core/app/workflows/spree/orders/complete.rb` |
| pretix 쿼터 수학 | `pretix/src/pretix/base/services/quotas.py` |
| pretix advisory lock | `pretix/src/pretix/base/services/locking.py` |
| alf.io 좌석 집기 | `alf.io/src/main/java/alfio/repository/TicketRepository.java` |
| QloApps 날짜 가용 | `QloApps/modules/hotelreservationsystem/classes/HotelBookingDetail.php` |
| QloApps 취소 수수료 | `QloApps/modules/hotelreservationsystem/classes/HotelOrderRefundRules.php` |
| 예약 슬롯 | `easyappointments/application/libraries/Availability.php` |
| 자원 겹침 | `librebooking/lib/Application/Reservation/ReservationConflictIdentifier.php` |

---

## 6. 학습 순서 제안

1. **Saleor**로 “수량 − 할당 − 예약”과 `SELECT FOR UPDATE`를 익힌다. 표가 깔끔하다.
2. **Medusa**로 같은 모델을 모듈·워크플로로 쪼갠 모습을 비교한다. 카트는 검사만 하고 주문에서 예약한다는 차이가 있다.
3. **Spree 6**으로 재고 이동 원장(`stock_movement`)과 카트/주문 분리, 반품을 하나의 `Return`으로 접은 설계를 본다.
4. **pretix**로 카운터 없이 집계하는 쿼터와 advisory lock을 본다.
5. **alf.io**로 “행 하나가 재고 하나”와 `SKIP LOCKED`를 본다. pretix와 정반대 모델링이다.
6. **QloApps → LibreBooking → Easy!Appointments** 순으로 시간 점유를 본다. 락이 약해지는 순서이기도 하다.
