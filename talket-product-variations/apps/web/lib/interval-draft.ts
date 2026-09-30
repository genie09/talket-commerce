import type { BlockedRange } from "./catalog";
import { addHours, closeHour, hourCount, nightCount, openHour, rangesOverlap } from "./ranges";

export type IntervalDraft = {
  ok: boolean;
  reason: string | null;
  units: number | null;
  label: string;
  range: { start: string; end: string } | null;
};

export function nightDraft(start: string, end: string, blocked: BlockedRange[]): IntervalDraft {
  const nights = nightCount(start, end);
  if (nights === null) return { ok: false, reason: "종료일은 시작일보다 뒤여야 합니다", units: null, label: "", range: null };
  const clash = blocked.find((range) => rangesOverlap(start, end, range.start, range.end));
  if (clash) return { ok: false, reason: `${clash.label}과 겹칩니다`, units: nights, label: `${start}–${end}`, range: null };
  return { ok: true, reason: null, units: nights, label: `${start}–${end} · ${nights}박`, range: { start, end } };
}

export function hourDraft(date: string, hour: number, duration: number, blocked: BlockedRange[]): IntervalDraft {
  if (!Number.isInteger(hour) || !Number.isInteger(duration) || duration < 1) {
    return { ok: false, reason: "시작 시각과 시간을 확인해 주세요", units: null, label: "", range: null };
  }
  if (hour < openHour || hour + duration > closeHour) {
    return {
      ok: false,
      reason: `${openHour}:00부터 ${closeHour}:00 전까지만 점유할 수 있습니다`,
      units: null,
      label: "",
      range: null,
    };
  }
  const range = addHours(date, hour, duration);
  if (!range) return { ok: false, reason: "날짜를 확인해 주세요", units: null, label: "", range: null };
  const hours = hourCount(range.start, range.end);
  if (hours === null) return { ok: false, reason: "시간을 확인해 주세요", units: null, label: "", range: null };
  const clash = blocked.find((item) => rangesOverlap(range.start, range.end, item.start, item.end));
  const label = `${date} ${String(hour).padStart(2, "0")}:00–${String(hour + duration).padStart(2, "0")}:00`;
  if (clash) return { ok: false, reason: `${clash.label}과 겹칩니다`, units: hours, label, range: null };
  return { ok: true, reason: null, units: hours, label: `${label} · ${hours}시간`, range };
}
