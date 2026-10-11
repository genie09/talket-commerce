# Talket × FastBooking

원문: [Talket](../talket/README.md), [FastBooking](README.md)

FastBooking은 테넌트 모듈마다 잠그는 재고 행이 다르다. 예약 줄 `Booking`은 공유한다. Talket도 주문 줄은 공유하고, 잠그는 행은 옵션 하나로 고정이다.

## 구성

| FastBooking 모듈 | 잠그는 행 | Talket |
|------------------|-----------|--------|
| events | `TicketType` `FOR UPDATE`. `reserved + quantity <= capacity` | 옵션 락 + `totalCount` 합산. `reserved` 컬럼은 없음 |
| hotel | 밤별 `HotelNightInventory` | 없음 |
| restaurant | 빈 `table`을 `SKIP LOCKED` | 없음. 지정석 행 없음 |
| recreation 시설 | `Resource` 행. 겹치는 allocation 합 | 없음 |
| recreation 프로그램 | `enrolled` 카운터 | 사용 횟수는 구매 후 `ProductUsage` |
| clinic | 외부 HTTP. 409면 그 시각 없음 | 없음 |

이벤트 모듈이 Talket 옵션과 같다. 권종에 정원이 있고, 예약이 `reserved`를 올린다. Talket은 `reserved`를 저장하지 않고 결제 확정 줄을 센다. 세는 상태가 FastBooking은 `pending`·`confirmed`, Talket은 `VERIFIED`·`PAID`·부분취소다. Talket `SUBMITTED`는 정원에 안 들어간다.

## 주문

공통 줄은 FastBooking `Booking`과 `BookingAllocation`(자리·테이블·시설)이다. Talket 공통 줄은 `OrderLine`이고, 자리 할당 테이블은 없다. 수량만큼 `OrderItem` id만 있다.

호텔 요금은 밤마다 rate를 합해 `subtotal`이 된다. Talket 금액은 옵션 단가 × 수량이고, 배송비는 정책·도서산간으로 `PriceCalculator`가 더한다. 박 수 합은 없다.

취소는 FastBooking이 같은 행을 다시 잠그고 `reserved`를 줄인다. Talket은 클레임으로 줄 수량을 줄여 다음 합에서 빠지게 한다. 0 밑으로 내리지 않으려는 가드는 `currentQuantity`가 취소 개수만큼만 주는 쪽으로 있다.

## 이 비교에서 남는 것

- 예약 줄은 하나이고 가용성 구현이 모듈로 갈라는 점이 FastBooking의 골격이다.
- Talket은 그 갈림이 없다. 티켓·굿즈·멤버십이 같은 옵션 합산과 같은 옵션 락을 쓴다.
- 테이블을 `SKIP LOCKED`로 집거나 밤 행을 잠그는 전략을 넣으려면 FastBooking처럼 잠그는 행을 모듈마다 바꿔야 한다. 지금 락 대상은 옵션 id다.
