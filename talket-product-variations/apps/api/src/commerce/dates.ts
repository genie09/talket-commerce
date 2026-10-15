export function parseDateTime(value: string): string | null {
  const trimmed = value.trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/;
  const hour = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/;
  const full = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})$/;
  if (dateOnly.test(trimmed)) return `${trimmed} 00:00:00`;
  const hourMatch = hour.exec(trimmed);
  if (hourMatch) return `${hourMatch[1]} ${hourMatch[2]}:00`;
  const fullMatch = full.exec(trimmed);
  if (fullMatch) return `${fullMatch[1]} ${fullMatch[2]}`;
  return null;
}

export function instantMillis(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = parseDateTime(String(value));
  if (!parsed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(parsed);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).getTime();
}

export function rangesOverlap(
  start: Date | string,
  end: Date | string,
  otherStart: Date | string,
  otherEnd: Date | string,
): boolean {
  const startMs = instantMillis(start);
  const endMs = instantMillis(end);
  const otherStartMs = instantMillis(otherStart);
  const otherEndMs = instantMillis(otherEnd);
  if (startMs === null || endMs === null || otherStartMs === null || otherEndMs === null) return true;
  return startMs < otherEndMs && endMs > otherStartMs;
}
