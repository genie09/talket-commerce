# Talket × VoxelBooking

원문: [Talket](../talket/README.md), [VoxelBooking](README.md)

VoxelBooking은 사업장마다 패턴을 하나 고르고, 네 패턴이 `bookings` 한 테이블을 쓴다. Talket은 상품 카테고리가 여러 개여도 주문·정원 규칙은 하나다.

## 구성

| Voxel 패턴 | 가용 | Talket에서 가까운 자리 |
|------------|------|------------------------|
| timeslot | 서비스 × 직원, 슬롯, 버퍼, 근무 | 없음. 콘텐츠의 시각은 전시 |
| resource | 객실 1개 × 박, 체크인 요일 | 없음. 날짜 점유 없음 |
| capacity | `max_capacity` − 그 시각 `party_size` 합 | 옵션 `totalCount` − 확정 줄 수량. 시각 축 없음 |
| event | 회차 자리, 대기, 예약당 상한 | 옵션 정원 + `maxOrderLimit`. 대기열 없음 |

capacity 패턴이 Talket과 가장 가깝다. 남은 수가 컬럼이 아니라 `confirmed`·`rescheduled` 예약 합이다. Talket도 `totalSalesCount`가 기준이 아니라 `VERIFIED`·`PAID`·부분취소 합이 기준이다.

다른 점: Voxel 합은 슬롯 시각에 묶이고, Talket 합은 옵션 id에 묶인다. 파티 크기 최소·최대는 Talket에 없다.

## 주문·취소

Voxel 취소는 `status = cancelled`라 다음 합에서 빠진다. Talket `PAID_CANCELED`와 같다. 행을 지우지 않는 점도 같다.

일정 변경은 트랜잭션에서 옛 행을 잠시 취소로 만들어 자기 자리를 합에 도로 넣은 뒤, 목표 시각을 다시 확인하고 새 행을 넣는다. 락은 패턴마다 그날·그 자원·그 시각·그 회차다.

Talket에는 일정 변경이 줄의 대상을 바꾸는 흐름이 없다. 환불 후 재구매다. 락은 옵션 id 하나다.

공개 생성의 용량 검사는 합계 재조회이고, 행 락이 드러나는 곳은 일정 변경이다. Talket은 반대로 제출 검사가 락 밖이고, 결제 확정이 락 안이다.

## 이 비교에서 남는 것

- 한 예약 테이블을 여러 패턴이 쓰는 점은, Talket이 티켓·굿즈를 한 주문으로 쓰는 것과 같은 방향이다.
- Voxel은 패턴이 사업장에 하나라 한 주문에 슬롯과 객실이 섞이지 않는다. Talket 카트는 상품 여러 개를 한 주문에 넣는다. 재고 전략은 그래도 옵션 합산 하나다.
- 회차 대기열은 Voxel event에만 있다.
