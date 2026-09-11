/**
 * Error helpers for the file extension's repository calls.
 */

type ErrorLike = {
  readonly code?: unknown;
  readonly status?: unknown;
  readonly message?: unknown;
};

const asRecord = (value: unknown): ErrorLike | undefined =>
  value !== null && typeof value === 'object' ? value : undefined;

/**
 * True when the failure means the target record is already gone — a delete
 * that raced with a previous one, or a row removed by another request.
 *
 * Deleting something that does not exist is the outcome the user already
 * asked for, so callers treat these errors as success: the selection is kept
 * in sync instead of surfacing a raw repository error. Matching is tolerant of
 * the transport shape (NocoBaseHttpError exposes `code`/`status`/`message`,
 * a bare server message may arrive as `message` alone).
 */
export function isRecordNotFoundError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;
  const code = typeof record.code === 'string' ? record.code : '';
  const status = typeof record.status === 'number' ? record.status : undefined;
  const message =
    typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return (
    /record_not_found|not_found/.test(code) ||
    status === 404 ||
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('不存在')
  );
}
