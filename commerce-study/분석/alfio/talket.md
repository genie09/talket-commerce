# Talket × alf.io

원문: [Talket](../talket/README.md), [alf.io](README.md)

둘 다 티켓 1장 = 행 1개로 끝난다. alf.io는 그 행을 판매 전에 만들어 두고 집어 간다. Talket은 결제된 뒤에 행을 만든다.

## 구성

| | Talket | alf.io |
|--|--------|--------|
| 행사 | `Product` | `Event`. 상태 `DRAFT/PUBLIC/DISABLED` |
| 권종 | `ProductOption` | `TicketCategory`. bounded / unbounded, 판매 창 |
| 1장 | `ProductItem`. 결제 후 생성. id는 주문 때 예약 | `Ticket`. 이벤트 생성 시 bulk insert. 상태가 재고 |
| 주문 헤더 | `Order`. 만료 2일 | `TicketReservation`. `validity` |
| 추가 옵션 | `ProductUsage` (소유 후 사용) | `AdditionalService`. 티켓과 같은 상태 전이 |
| 초대 | 옵션 `allowedPartnerId` | `SpecialPrice` 1코드 = 티켓 1장 |
| 지정석 | 메타 URL. 좌석 행 없음 | 티켓 행이 자리. `SKIP LOCKED`로 빈 행 |

alf.io bounded는 권종마다 `max_tickets`개의 `FREE` 행이다. Talket 옵션 `totalCount`는 그 개수의 숫자만 있고, 행은 `PAID` 이후에만 `t_product_item`에 있다.

unbounded는 공용 풀에서 행을 꺼내 권종을 붙인다. Talket 옵션은 풀을 공유하지 않는다. 옵션마다 정원이 있다.

## 재고

alf.io 판매는 `UPDATE qty = qty - 1`이 아니다. `FREE` 행을 `FOR UPDATE SKIP LOCKED`로 집어 `PENDING`으로 바꾼다. 잠근 행 수가 모자라면 예외다.

Talket 판매는 주문 줄 합이 `totalCount`를 넘지 않는지 옵션 락 안에서 본다. 행을 집어 가지 않는다. 아이템 id는 UUID다. ID 풀이 켜져 있으면 Redis 리스트에서 UUID를 `LPOP`한다. 그 UUID는 아직 `t_product_item` 행이 아니다.

| 상태 | Talket에 대응 |
|------|----------------|
| `FREE` | 아직 행이 없는 남은 정원 |
| `PENDING` | `SUBMITTED` 주문. 합산에는 안 들어감. ID 풀을 썼으면 그 id만 빠짐 |
| `ACQUIRED` | `PAID` + `ProductItem` 발행, 소유 잔액 1 |
| `CHECKED_IN` | `ProductUsage` 사용 (`ONCE` / `DAILY`) |
| `RELEASED` | 클레임 회수. 소유 잔액 감소. 행은 남음 |

## 주문

alf.io는 예약 트랜잭션 안에서 티켓을 집고, 결제 확정은 커밋 후 `ReservationFinalizer`다. Talket은 주문 행을 먼저 쓰고, 결제 웹훅 뒤 합산을 통과하면 아이템을 발행한다. 결제가 실패하면 alf.io는 행을 `FREE`로 돌리고, Talket은 주문 `FAILED`와 ID 풀에 새 UUID를 넣는 것으로 끝난다. 없던 아이템 행을 지울 필요가 없다.

대기열은 alf.io `waiting_queue`다. Talket에는 매진 후 대기 줄이 없다.

## 환불

alf.io는 게이트웨이 환불과 크레딧 노트, 티켓 `RELEASED`다. unbounded면 `category_id`를 null로 돌려 풀에 넣는다.

Talket 회수는 소유 이력 `CLAIM_RETRIEVED`다. 정원은 줄이 `PAID_CANCELED`가 되며 합에서 빠진다. 아이템 행을 `FREE`로 재활용하지 않는다. 다음 구매는 새 id다.

## 락

alf.io는 잠긴 티켓 행을 건너뛰고 다음 빈 행을 집는다. Talket은 옵션 하나를 잠그고 합을 다시 센다. 마지막 1장에서 alf.io는 서로 기다리지 않고, Talket은 옵션 락 순서를 기다린다.

## 이 비교에서 남는 것

- 1장 = 1행은 결제 이후의 Talket `ProductItem`과 같다.
- 판매 전 행이 곧 재고인 모델은 Talket이 아니다. Talket 재고는 숫자 합이다.
- 체크인 상태 컬럼 대신 Talket은 사용 이력(`ONCE`/`DAILY`)으로 소진을 남긴다.
