export function rangesOverlap(start: string, end: string, blockedStart: string, blockedEnd: string): boolean {
  return start < blockedEnd && end > blockedStart;
}

export function nightCount(start: string, end: string): number | null {
  const from = utcDay(start);
  const to = utcDay(end);
  if (from === null || to === null || to <= from) return null;
  return Math.round((to - from) / 86_400_000);
}

export function hourCount(start: string, end: string): number | null {
  const from = utcMinute(start);
  const to = utcMinute(end);
  if (from === null || to === null || to <= from) return null;
  const hours = (to - from) / 3_600_000;
  return Number.isInteger(hours) ? hours : null;
}

export const openHour = 10;
export const closeHour = 19;

export function addDays(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function nightIds(start: string, end: string): string[] {
  const ids: string[] = [];
  let cursor = start;
  while (cursor < end) {
    ids.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return ids;
}

export function hourIds(start: string, end: string): string[] {
  const ids: string[] = [];
  let cursor = start;
  while (cursor < end) {
    ids.push(cursor);
    cursor = nextHour(cursor);
  }
  return ids;
}

export function rangesFromNightIds(ids: string[]): { start: string; end: string; label: string }[] {
  return groupIds([...ids].sort(), (id) => addDays(id, 1), (start, end) => `${start}–${end}`);
}

export function rangesFromHourIds(ids: string[]): { start: string; end: string; label: string }[] {
  return groupIds([...ids].sort(), nextHour, (start, end) => {
    const date = start.slice(0, 10);
    return `${date} ${start.slice(11, 16)}–${end.slice(11, 16)}`;
  });
}

export function occupiedHours(ranges: { start: string; end: string }[], date: string): number[] {
  const hours: number[] = [];
  for (const range of ranges) {
    if (!range.start.startsWith(`${date}T`)) continue;
    for (const id of hourIds(range.start, range.end)) hours.push(Number(id.slice(11, 13)));
  }
  return hours;
}

export function occupiedNights(ranges: { start: string; end: string }[]): Set<string> {
  const nights = new Set<string>();
  for (const range of ranges) {
    if (range.start.includes("T")) continue;
    for (const id of nightIds(range.start, range.end)) nights.add(id);
  }
  return nights;
}

function nextHour(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[2]) + 1;
  return `${match[1]}T${String(hour).padStart(2, "0")}:${match[3]}`;
}

function groupIds(
  sorted: string[],
  next: (id: string) => string,
  labelFor: (start: string, end: string) => string,
): { start: string; end: string; label: string }[] {
  const ranges: { start: string; end: string; label: string }[] = [];
  if (sorted.length === 0) return ranges;
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current && next(previous) === current) {
      previous = current;
      continue;
    }
    const end = next(previous);
    ranges.push({ start, end, label: labelFor(start, end) });
    start = current;
    previous = current;
  }
  return ranges;
}

export function addHours(date: string, hour: number, duration: number): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const startHour = String(hour).padStart(2, "0");
  const endHour = String(hour + duration).padStart(2, "0");
  return { start: `${date}T${startHour}:00`, end: `${date}T${endHour}:00` };
}

function utcDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function utcMinute(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}
