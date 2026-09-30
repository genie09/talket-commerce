export function refundCopy(consumed: boolean, returned: boolean): string {
  if (returned) return "고른 점유를 되돌렸습니다. 수수료는 0입니다.";
  if (consumed) return "이미 사용하거나 출고한 뒤라 점유는 그대로 둡니다. 수수료는 0이고, 돈은 이 화면 기록에만 남습니다.";
  return "환불할 대상을 고르세요.";
}
