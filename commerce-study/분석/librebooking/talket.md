# Talket × LibreBooking

원문: [Talket](../talket/README.md), [LibreBooking](README.md)

LibreBooking은 회의실·장비의 시간을 예약한다. SKU가 없다. Talket은 SKU에 가까운 옵션 정원과 주문이 있다. 시간 배타는 없다.

## 구성

| | Talket | LibreBooking |
|--|--------|--------------|
| 대상 | `Product` / `ProductOption` | `BookableResource`. 스케줄, 최소·최대 시간, 버퍼, 승인 |
| 한 건 | `Order` + 아이템 N개 | `ReservationSeries` + 발생 `Reservation` |
| 반복 | 없음. 회차는 상품·옵션을 나눔 | 시리즈 1개 + 인스턴스 N개 |
| 부가 수량 | 옵션마다 정원 | `Accessory.accessory_quantity`. NULL이면 무제한 |
| 참가자 | 없음 | 자원 참가자 상한, 스케줄 동시 예약 수 |
| 승인 | 상품 검수 제출은 판매 전 | `requires_approval`은 예약 후 |
| 체크인 | `ProductUsage` | `enable_check_in`, `auto_release_minutes` |

Talket 주문 줄은 옵션 스냅샷이다. LibreBooking 인스턴스는 시작·끝이 있는 시간 조각이다.

## 재고

LibreBooking 충돌은 기간 안의 활성 예약과 블랙아웃이 겹치면 거절이다. 끝과 시작이 같으면 겹치지 않는다. 버퍼가 있으면 간격을 벌려 비교한다. 기본 동시 예약은 1이고 `MaxConcurrentReservations`로 늘린다.

Talket은 구간 겹침을 보지 않는다. 같은 옵션을 몇 개 샀는지만 `totalCount`와 비교한다.

악세서리 수량만 LibreBooking에서 Talket 정원과 같은 정수다. 자원 자체는 시간이 재고다.

## 주문

LibreBooking `ReservationHandler`는 규칙 파이프라인 뒤 INSERT다. DB는 문장마다 autocommit에 가깝다. 결제가 없고, 내부 크레딧을 쓴다.

Talket은 주문·PG·결제 확정 합산이 있다. 크레딧 원장 대신 현금 `t_order_payment`와 포인트 금액 칸이 있다. 제출 시점 포인트는 0으로 두고 현금 금액에 총액을 넣는다.

## 환불

LibreBooking 취소는 `status_id = 2`라 겹침 쿼리에서 빠진다. 크레딧은 미사용분을 복원하고, 카드 환불은 크레딧 구매분에 한정된다.

Talket 취소는 줄 상태가 합산에서 빠지는 것과 같다. 돈은 클레임 환불이다. 시간 버퍼나 자동 해제 분은 없다.

## 락

LibreBooking은 겹침을 PHP에서 보고, 둘 다 통과하면 같은 자원·시간이 두 건이다. Talket은 옵션 락 안에서 수량을 다시 센다. 시간 범위 락이나 exclusion constraint는 어느 쪽에도 없다.

## 이 비교에서 남는 것

- 시리즈와 발생을 나누는 반복 예약은 Talket 주문에 없다.
- 유한 수량이 자원이 아니라 악세서리에만 있는 점은, Talket이 모든 판매 칸에 정원을 두는 것과 반대 배치다.
- 승인·버퍼·체크인 자동 해제는 자원 규칙이다. Talket 확정 시각은 구매 확정(`confirmPeriod`)과 사용 기간이다.
