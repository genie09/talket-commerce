# Talket × Easy!Appointments

원문: [Talket](../talket/README.md), [Easy!Appointments](README.md)

Easy!Appointments는 서비스 시간 슬롯만 있다. 주문, 결제, SKU가 없다. Talket은 수량 정원과 주문이 있고, 시간 슬롯 재고는 없다.

## 구성

| | Talket | Easy!Appointments |
|--|--------|-------------------|
| 파는 것 | `ProductOption` | `services`. `duration`, 표시용 `price` |
| 제공자 | `partnerId`, 옵션의 허용 파트너 | `users` 역할 provider. 요일 근무 JSON |
| 고객 한도 | 상품·옵션 `maxOrderLimit` | 같은 고객의 같은 슬롯 중복만 거부 |
| 동시 인원 | 옵션 `totalCount` (기간 무관) | `attendants_number`. 그 슬롯의 같은 서비스 |
| 예약 결과 | `Order` + `ProductItem` | `appointments` 행. `start_datetime`, `end_datetime` |
| 휴무 | 판매 중지 `salePausedAt` | `blocked_periods`, `is_unavailability`, 근무 예외 |

Talket `ProductUsage`의 `ONCE` / `DAILY`는 이미 산 아이템을 쓰는 규칙이다. Easy의 슬롯은 사기 전에 시간을 점유한다.

## 재고

Easy 가용은 근무시간에서 기존 예약·휴식·휴무를 빼고, `slot_interval`로 시작 시각을 걷는 결과다. 다른 서비스와 시간이 겹치면 거절한다.

Talket 가용은 옵션 정수다. 시작·끝 시각은 콘텐츠(`ticket.v1`의 `TimeSpec`)에 적히고 재고 계산에는 안 들어간다.

## 주문

Easy `Booking::register`는 슬롯을 다시 보고 `appointments`를 INSERT한다. 트랜잭션이 없다. 공개 API는 가용 검사 없이 저장할 수 있다.

Talket은 주문 행을 만든 뒤 결제 완료 때 옵션 락으로 정원을 다시 센다. 결제 없이 확정되는 경로가 없다. 0원 결제는 현금 액수가 0이면 바로 `CompleteOrderPayment`로 간다.

## 환불

Easy 취소는 `appointments` 행 DELETE다. 다음 슬롯 계산에서 그 시간이 다시 빈다. 환불 금액은 없다.

Talket 취소는 줄을 `PAID_CANCELED`로 남기고 소유를 회수한다. 행을 지우지 않는다. 돈이 있으면 `OrderRefund`다.

## 락

Easy는 검사와 INSERT 사이에 같은 슬롯이 두 건 생길 수 있다. 관리자 화면은 `force_save`로 겹침을 통과시킨다. Talket 결제 확정은 옵션 락으로 합산을 직렬화한다.

## 이 비교에서 남는 것

- 시간 격자, 제공자 근무, 동시 인원, 버퍼는 Talket 상품 구성에 없다.
- Talket이 가진 주문·결제·정원 합산은 Easy에 없다. 표시 가격만 있다.
- 이미 구매한 뒤의 사용 횟수(`DAILY`)와, 구매 전에 시간을 잠그는 슬롯은 다른 층이다.
