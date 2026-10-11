# Talket × pretix

원문: [Talket](../talket/README.md), [pretix](README.md)

둘 다 이벤트 티켓이고, 팔린 수를 컬럼으로 믿지 않고 주문을 센다. pretix는 쿼터·카트·바우처를 같이 센다. Talket은 결제 확정된 주문 줄만 센다.

## 구성

| | Talket | pretix |
|--|--------|--------|
| 행사/상품 | `Product`. 카테고리 `TICKET` 등 | `Event` 안의 `Item`. `admission`이면 입장권 |
| 파는 칸 | `ProductOption`. 칸마다 가격·`totalCount` | `ItemVariation`. 정원은 변형이 아니라 `Quota` |
| 정원 범위 | 옵션 하나 = 정원 하나 | 쿼터가 아이템·변형·회차(`SubEvent`)에 연결. 여러 칸이 한 풀 |
| 애드온 | 사용(`ProductUsage`)은 소유 후 혜택 | `ItemAddOn`, `ItemBundle`. 줄에 `is_bundled` |
| 지정석 | 카테고리 `RESERVED_SEAT_TICKET`, `seatMetaUrl` | `Seat`. 주문·미만료 카트·바우처가 점유 |
| 질문 | 구매자 정보 폼 제출 | `Question` |
| 회차 | 상품을 복제하거나 옵션을 나눔 | `SubEvent` |
| 권리 1개 | 결제 후 `ProductItem` | `OrderPosition`. 카트 줄과 주문 줄이 `AbstractPosition` |

Talket 옵션은 pretix에서 “변형 + 그 변형만의 쿼터”를 한 행에 붙인 형태다. 여러 옵션이 정원 하나를 나누는 쿼터, 본품에 붙는 애드온 줄은 Talket에 없다.

## 재고

```
pretix 남은 수 = quota.size
              - pending·paid 주문
              - 미만료 카트
              - block_quota 바우처
              - (설정 시) 대기자

Talket 남은 수 = totalCount
              - VERIFIED·PAID·부분취소 줄
```

pretix `CartPosition.expires`가 홀드다. Talket 카트는 만료가 없고 합산에 안 들어간다. Talket이 결제 전에 잡는 것은 옵션 `maxOrderLimit`이 있고 ID 풀이 켜진 바로구매뿐이다. 그 풀은 주문 줄 합과 따로 논다. 취소분은 DB 합에서 빠지고 풀에는 안 돌아온다.

pretix `totalSalesCount`에 해당하는 컬럼은 없다. Talket `totalSalesCount`는 같은 합을 결제 뒤에 다시 쓰는 표시 값이다.

## 주문

pretix 체크아웃은 고객 → 애드온 → 질문 → 결제 → 확인이고, 확인 스텝에서 `Order` pending이 된다. 카트 만료가 120초 안이면 락을 다시 잡고, 멀면 카트 홀드를 신뢰한다.

Talket은 제출 때 주문 행을 만들고(또는 Redis 임시 캐시), PG 웹훅 뒤 옵션 락으로 `PAID`가 된다. 만료는 주문 기준 2일이다. 그 사이 `SUBMITTED`/`PENDING`은 정원을 안 잡는다. pretix pending은 정원을 잡는다.

포지션 1개 = 티켓 1개인 점은 `OrderItem` 1개 = `ProductItem` 1개와 같다. pretix는 카트에 담을 때 포지션이 생기고, Talket은 주문 제출 때 아이템 id가 생기고 행 자체는 결제 후다.

## 환불

pretix `OrderRefund`는 결제 건에 나눠 실행하고, 취소 수수료(`OrderFee`)를 남길 수 있다. 주문이 `canceled`면 다음 쿼터 계산에서 빠진다.

Talket 취소도 다음 합에서 빠진다. 수수료 행은 없고, 환불 정책은 상품의 `GENERAL` / `NO_REFUND`와 클레임 마감 시각이다. 돈은 `OrderRefund`의 현금·포인트·배송비다.

## 락

pretix는 쿼터 id `pg_advisory_xact_lock`이다. 락을 가진 쪽만 가용 수를 갱신한다. Talket은 옵션 id Redis 락 또는 `GET_LOCK`이다. 잠그는 대상이 둘 다 “이 판매 칸의 합산”인 점이 같다. pretix는 카트에 담을 때도 락을 잡고, Talket은 결제 완료 때 잡는다.

## 이 비교에서 남는 것

- 용량을 카운터 증감으로 두지 않고 주문을 합산하는 점이 같다.
- pretix는 그 합에 미만료 카트와 바우처를 넣는다. Talket 합에는 결제 확정 줄만 있다.
- 지정석 행, 애드온, 번들 구성품, 회차(`SubEvent`)는 pretix 구성이고 Talket 옵션 모델 밖에 있다.
