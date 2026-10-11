# Talket × QloApps

원문: [Talket](../talket/README.md), [QloApps](README.md)

QloApps는 PrestaShop 주문에 호텔 날짜를 붙인다. Talket은 같은 주문에 티켓과 굿즈를 넣되, 재고는 날짜가 아니라 옵션 정원이다.

## 구성

| | Talket | QloApps |
|--|--------|---------|
| 파는 것 | `Product` + `ProductOption` | 객실 타입 = PrestaShop `Product` (`booking_product = 1`) |
| 물리 단위 | 결제 후 `ProductItem` | `HotelRoomInformation`. 호수, 층, 상태 |
| 부가 상품 | `ProductUsage`, 카테고리 `GOODS` | `booking_product = 0` 서비스. 객실/호텔/단독 |
| 가격 | 옵션 고정 금액 | 기본가 + 기간·요일 feature pricing |
| 인원 | 없음 | adults, children, max_guests, 최소·최대 숙박 |
| 배송 | 상품 배송 정책, 도서산간 | 호텔 체크인. 선결제 정액/정률 |

Talket `RESERVED_SEAT_TICKET`은 좌석 메타 URL이다. QloApps 물리 방은 재고 행이다. 날짜가 겹치면 그 방이 빠진다.

## 재고

QloApps `stock_available`은 999999999 같은 더미다. 가용은 활성 방에서 겹치는 `htl_booking_detail`, 중지 구간, 최소 숙박, 이 카트의 방을 뺀 결과다.

Talket `totalCount`는 더미가 아니다. 날짜 축이 없고, 팔린 수는 주문 줄 합이다.

| 시점 | Talket | QloApps |
|------|--------|---------|
| 카트 | 전역 선점 없음 | `htl_cart_booking_data`는 그 손님 장부. 다른 손님 검색에서는 안 뺌 |
| 결제 | 옵션 락 후 합산. 실패하면 주문 `FAILED` | 방이 없으면 다른 방으로 바꾸거나 `is_back_order = 1` |
| 오버부킹 | 합이 넘으면 거절 | 한도 안에서 주문을 남기고 관리자가 방을 바꿈 |

## 주문

QloApps 카트 수량은 `방 수 × 박 수`다. 진실은 날짜 행이다. Talket 줄 수량은 옵션 개수이고, 날짜 구간을 줄에 복사하지 않는다.

결제는 둘 다 기존 주문 흐름에 탄다. QloApps는 `PaymentModule::validateOrder` 안에 예약 삽입이 있다. Talket은 주문 저장과 결제 확정 합산이 SQS로 나뉜다.

## 환불

QloApps는 체크인 N일 전 규칙으로 환불액이 줄고, 규칙에 없으면 0이다. 환불 완료 예약은 가용 조회에서 빠진다.

Talket 환불 가능 여부는 `GENERAL` / `NO_REFUND`와 클레임 마감(기간과 고정 시각 중 이른 쪽)이다. 취소된 줄은 정원 합에서 빠진다. 날짜별 공제 테이블은 없다.

## 락

QloApps는 담을 때와 결제 때 다시 조회하고, 둘 다 성공하면 한 쪽이 오버부킹이다. Talket은 결제 완료의 옵션 락으로 그 간격을 줄인다. 제출 시점 검사는 여전히 락 밖이다.

## 이 비교에서 남는 것

- 상품 플래그로 숙박과 서비스를 나누는 방식은 Talket 카테고리(`TICKET`, `GOODS`, `SHIPPING`)와 같은 자리다.
- 날짜로 자원을 점유하는 재고는 Talket 옵션 정원과 다른 전략이다.
- 오버부킹을 남기고 사후에 방을 바꾸는 운영은 Talket이 쓰지 않는다. 정원 초과는 결제 확정 실패다.
