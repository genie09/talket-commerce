# 커머스 프로젝트 학습 가이드

이 폴더는 워크스페이스의 8개 프로젝트를 학습용으로 정리한 노트다.

- 이 파일과 아래 표의 문서: **상품 정의, 재고, 환불, 주문 흐름, DB, 락**
- [아키텍처/00-한-커머스로-모으기.md](아키텍처/00-한-커머스로-모으기.md): 여러 상품군을 **한 주문**에 넣으려면 무엇을 공통으로 두고 무엇을 전략으로 빼는지
- `아키텍처/*.md`: 레포별 부팅, 디렉터리, 요청이 지나가는 파일, 테이블 관계, 확장 지점, 읽을 순서
- [학습-목록.md](학습-목록.md): 이 8개 다음에 볼 것. 상세 노트는 `외부/`

| 문서 | 프로젝트 | 도메인 | 재고의 실체 |
|------|----------|--------|-------------|
| [medusa.md](medusa.md) | Medusa 2.20 | 헤드리스 커머스 | 위치별 수량 + 예약(reservation) |
| [saleor.md](saleor.md) | Saleor 3.24 | 헤드리스 커머스 | 창고 수량 + 주문 할당 + 체크아웃 예약 |
| [spree.md](spree.md) | Spree 6.0 alpha | 모놀리식 커머스 | 선반 수량 + 할당 수량 + 재고 이동 원장 |
| [pretix.md](pretix.md) | pretix 2026.8 | 이벤트 티켓 | 쿼터 용량을 주문·카트·바우처로 계산 |
| [alfio.md](alfio.md) | alf.io 2.0-M6 | 이벤트 티켓 | 좌석 1개 = `ticket` 행 1개 |
| [qloapps.md](qloapps.md) | QloApps 1.7 | 호텔 | 물리 객실 × 날짜 겹침 |
| [easyappointments.md](easyappointments.md) | Easy!Appointments 1.6 | 예약 스케줄 | 제공자 시간 + 동시 인원 |
| [librebooking.md](librebooking.md) | LibreBooking 5.3 | 자원 예약 | 자원의 시간 배타 |

아키텍처·소스 구조·DB 관계는 따로 있다.

| 문서 | 이 레포에서 구조적으로 볼 것 |
|------|------------------------------|
| [아키텍처/00-한-커머스로-모으기.md](아키텍처/00-한-커머스로-모으기.md) | 여섯 겹과 가용성 전략 네 개. 설계를 시작할 때 |
| [아키텍처/medusa.md](아키텍처/medusa.md) | 모듈 경계, 링크, 워크플로 보상 |
| [아키텍처/saleor.md](아키텍처/saleor.md) | 얇은 GraphQL, 채널, 앱이 돈을 소유 |
| [아키텍처/spree.md](아키텍처/spree.md) | 카트/주문 분리, `external_step`, 재고 원장 |
| [아키텍처/pretix.md](아키텍처/pretix.md) | 시그널 플러그인, 합산 쿼터, 이질적 라인 |
| [아키텍처/alfio.md](아키텍처/alfio.md) | SQL 리포지토리, SKIP LOCKED, 커밋 후 확정 |
| [아키텍처/qloapps.md](아키텍처/qloapps.md) | 기존 주문에 날짜 자원을 붙인 비용 |
| [아키텍처/easyappointments.md](아키텍처/easyappointments.md) | 주문 없이 슬롯만 있을 때 빠지는 층 |
| [아키텍처/librebooking.md](아키텍처/librebooking.md) | 규칙 파이프라인, series/instance, 크레딧 원장 |

---

## 1. 상품은 세 층으로 나뉜다

커머스 세 프로젝트(Medusa, Saleor, Spree)는 이름이 달라도 같은 뼈대다.

1. **타입/템플릿** — 배송 여부, 속성 스키마, 기프트카드 같은 행동
2. **상품(Product)** — 카탈로그에 보이는 이름·설명·카테고리
3. **변형(Variant)** — 실제로 사고파는 SKU. 가격과 재고는 여기에 붙는다

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

## 2. 재고를 지키는 다섯 가지 방식

같은 “품절”이라도 구현이 완전히 다르다. 이 차이가 이 저장소에서 가장 배울 점이다.

### A. 수량 카운터 (Medusa, Saleor, Spree)

선반에 숫자가 있다. 팔릴 수 있는 수는 대략 아래다.

```
팔 수 있는 수 = 물리 수량 - 이미 약속한 수량 - (있으면) 체크아웃 예약
```

| | 물리 수량 | 약속(할당) | 체크아웃 홀드 | 실제 차감 시점 |
|--|-----------|------------|----------------|----------------|
| Medusa | `inventory_level.stocked_quantity` | `reserved_quantity` + `reservation_item` | 카트는 검사만, 주문 확정 때 예약 | 출고(fulfillment) 때 `stocked` 감소 |
| Saleor | `warehouse_stock.quantity` | `allocation` + `quantity_allocated` | `reservation` (TTL) | 출고 때 할당 해제 + `quantity` 감소 |
| Spree 6 | `stock_level.count_on_hand` | `allocated_count` + movement `allocated` | `stock_reservation` (TTL, 기본 10분) | 출고 때 movement `shipped` |

세 프로젝트 모두 **주문 넣는 순간 선반 숫자를 깎지 않는다.** 먼저 “이 수량은 내 것이다”를 기록하고, 물건을 보낼 때 선반에서 뺀다. 반품하면 선반으로 되돌린다.

### B. 계산된 용량 (pretix)

`quota.size`만 저장하고, 팔린 수는 컬럼으로 두지 않는다. 매번 센다.

```
남은 수 = size
        - 결제대기·결제완료 주문
        - 미만료 카트
        - 쿼터를 묶어 둔 바우처
        - (설정 시) 대기자
```

장점은 상태가 어긋날 카운터가 없다는 점이다. 단점은 쓸 때마다 집계하고, 그 집계를 락으로 감싸야 한다는 점이다.

### C. 행 = 재고 1개 (alf.io)

티켓 100장이면 `ticket` 행이 100개다. 상태는 `FREE → PENDING → ACQUIRED → CHECKED_IN`처럼 행이 이동한다. 수량을 `UPDATE qty = qty - 1` 하지 않는다. **빈 행을 집어 가는 것**이 판매다.

### D. 날짜·시간 점유 (QloApps, Easy!Appointments, LibreBooking)

- QloApps: 객실 101호는 3/1–3/3에 예약이 있으면 그 구간에서 빠진다. `stock_available`은 999999999 같은 더미다.
- Easy!Appointments: 제공자 근무시간에서 기존 예약·휴식·휴무를 빼고 슬롯을 만든다. `attendants_number`가 1보다 크면 같은 슬롯에 여러 명을 받는다.
- LibreBooking: 자원의 기존 예약·블랙아웃과 시간이 겹치면 거절한다. 악세서리만 수량(`accessory_quantity`)이 있다.

### E. 오버부킹을 허용하는 안전판 (QloApps)

QloApps는 막지 못하면 `htl_booking_detail.is_back_order = 1`로 남기고 관리자가 방을 바꾼다. 강한 락 대신 **사후 조정**을 택한 경우다.

---

## 3. 락은 “누가 마지막 1개를 가져가나”를 정한다

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

- **비관적 행 락**: `SELECT FOR UPDATE`, Rails `with_lock`. 읽는 순간 다른 트랜잭션이 그 행을 못 고친다.
- **advisory lock**: 행이 없어도 되는 자물쇠. pretix 쿼터, Medusa 재고 키처럼 “이 숫자 묶음”을 잠글 때 쓴다.
- **SKIP LOCKED**: 잠긴 행을 기다리지 않고 다음 행으로. 좌석 풀에서 많이 쓴다.
- **상태 조건 UPDATE**: `UPDATE … WHERE status = 'ACQUIRED'`. 0행이면 이미 누군가 바꿨다는 뜻이다.
- **낙관적 버전**: Spree `lock_version`은 API가 직접 비교하고 409를 낸다. Rails 자동 낙관적 락은 꺼 두었다.
- **검사 후 삽입**: 락이 없으면 검사와 삽입 사이에 다른 요청이 끼어든다.

Saleor와 Spree는 여러 행을 잠글 때 **pk 순서**를 고정한다. 순서가 다르면 교착(deadlock)이 난다.

---

## 4. 환불은 “돈”과 “재고 원복”이 따로다

환불 한 건은 보통 두 단계다.

1. **물건/자리 반환** — 할당 해제, 선반 증가, 티켓 `RELEASED`, 객실 상태를 취소로
2. **돈 반환** — 결제사 API, 스토어 크레딧, 크레딧 노트, 전액 포기(취소 수수료)

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
