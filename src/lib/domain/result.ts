export type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: true; currentRevision: number | null }
  | { ok: false; rateLimited: true; limit: number }
  | { ok: false; itemOpen: true; itemId: string }
  | { ok: false; error: string };

export function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
