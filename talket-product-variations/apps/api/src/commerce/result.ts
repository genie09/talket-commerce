export type CommandResult<T> =
  | { ok: true; value: T; replay: boolean }
  | { ok: false; reason: string; conflict: boolean };

export function fail(reason: string, conflict = false): CommandResult<never> {
  return { ok: false, reason, conflict };
}

export function succeed<T>(value: T, replay = false): CommandResult<T> {
  return { ok: true, value, replay };
}
