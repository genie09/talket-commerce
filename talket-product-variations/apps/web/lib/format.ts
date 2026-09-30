export function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function koreanDay(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
