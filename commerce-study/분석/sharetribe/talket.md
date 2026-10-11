# Talket × Sharetribe

원문: [Talket](../talket/README.md), [Sharetribe](README.md)

Sharetribe 재고는 리스팅 하나의 정수와, 그 증감을 고칠 수 없는 adjustment다. 좌석은 다른 기능이다. Talket도 정수는 옵션에 두고, 지정석 행은 재고가 아니다.

## 구성

| | Talket | Sharetribe |
|--|--------|------------|
| 판매물 | `ProductOption` | listing. `currentStock` |
| 수량 기록 | 주문 줄이 원장. `totalSalesCount`는 표시용 재기록 | stock adjustment. 양수 입고, 음수 판매. 생성 후 수정 불가 |
| 선점 | 카트는 수량만. ID 풀은 선택 | stock reservation. 거래당 최대 하나 |
| 좌석 | `seatMetaUrl`. 정원은 여전히 `totalCount` | 좌석 시간표는 리스팅 수량과 다른 기능 |
| 거래 | `Order` 상태 기계 | transaction process. 전이의 액션이 재고를 바꿈 |

## 재고

Sharetribe `pending` 예약은 만드는 즉시 음수 adjustment라 가용에 잡힌다. `proposed`는 수량을 검사만 한다. `declined`면 pending이었던 음수를 양수로 되돌린다.

Talket `SUBMITTED`/`PENDING`은 Sharetribe `proposed`에 가깝다. 합산에 안 들어간다. `VERIFIED`/`PAID`가 `pending`/`accepted`처럼 가용을 잡는다. 되돌리기는 역분개 행이 아니라 줄 상태와 `currentQuantity`다.

`compare and set`의 `oldTotal` 조건은 Talket에 없다. 정원은 결제 시점 합으로 맞춘다.

## 주문

Sharetribe는 거래 프로세스 액션만 재고를 바꾼다. Talket은 결제 완료 프로세서가 옵션 락 안에서 합산하고, 통과하면 발행 명령을 보낸다. 프로세스 정의 언어로 액션을 끼우는 자리는 없다.

## 이 비교에서 남는 것

- 정수 재고와 좌석을 한 카운터에 넣지 않는 점은 같다. Talket 지정석도 메타 URL이고 정원은 옵션 숫자다.
- 판매 차감을 불변 adjustment로 남기는 원장은 Talket에 없다. 주문 줄이 그 역할을 겸한다.
- 제안(`proposed`)과 선점(`pending`)을 거래 상태로 고르는 유연함은 Talket에 없다. 선점 시점은 결제 완료로 고정이다.
