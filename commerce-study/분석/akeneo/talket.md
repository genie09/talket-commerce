# Talket × Akeneo

원문: [Talket](../talket/README.md), [Akeneo](README.md)

Akeneo는 팔기 전의 카탈로그다. 주문, 결제, 재고 락, 환불이 없다. Talket은 그 반대편에 가깝다. 판매 칸과 주문이 있고, 속성 가계도는 없다.

## 구성

| | Talket | Akeneo |
|--|--------|--------|
| 상품군 | 카테고리 문자열 | Family. 속성 묶음, 라벨, 대표 이미지 |
| 공통 값 | `Product` 제목, 콘텐츠, 정책 | Product model. SKU 없음. 2단이면 색 모델 |
| 판매 단위 | `ProductOption` | Product. identifier. 부모가 있으면 변형 |
| 변형 축 | 없음. 옵션 이름이 칸 | Family variant. 단마다 축. 예: 1단 색, 2단 사이즈 |
| 값의 좌표 | 상품·옵션에 붙은 단일 값 | 채널 × 로케일 |
| 주문 | `Order` / `OrderLine` | 내보내는 SKU. 판매는 커머스 쪽 |

Akeneo 2단(모델 / 색 / SKU)을 Talket에 올리면 색 공통 사진이 옵션마다 복사된다. Talket 썸네일은 상품에 있고 옵션은 가격·정원·이름이다. 색 공통 층을 둘 자리가 `Product` 하나다.

## 재고·주문

Akeneo는 재고를 세지 않는다. PIM이 부모이고 쇼핑몰 SKU가 자식이라는 연결만 있다.

Talket 옵션 id가 그 SKU 자리다. 별도 PIM에서 받아 오는 식별자 층은 없고, 옵션 id를 주문 줄에 그대로 복사한다. 채널·로케일별로 이름과 설명이 갈라지지 않는다.

## 이 비교에서 남는 것

- 판매 단위와 공통 설명을 나누는 점은 ProductOption / Product와 같다.
- 변형 축을 단으로 나누고 속성을 단에 배치하는 family variant는 Talket에 없다.
- 주문 줄이 카탈로그를 나중에 고쳐도 안 바뀌게 이름을 복사하는 Talket 동작은, Akeneo가 값을 채널에 두고 커머스가 SKU를 가져가는 흐름의 수신 쪽에 해당한다.
