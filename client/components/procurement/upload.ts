/**
 * Uploading through a reused keep-alive connection can fail at the transport
 * layer (`TypeError: Failed to fetch`) even though the server never saw the
 * request — the server closes an idle connection after a few seconds, and a
 * non-idempotent POST cannot be replayed by the browser the way a GET is.
 *
 * A single retry opens a fresh connection and turns that transient failure into
 * a success. An HTTP error is a definite answer from the server, so it is
 * re-thrown untouched: re-sending could duplicate work the server already did.
 */

export interface UploadedFileRecord {
  readonly id: string;
}

export interface UploadResult {
  readonly records: readonly UploadedFileRecord[];
}

export interface UploadOptions {
  readonly signal?: AbortSignal;
}

export interface UploadRepository {
  uploadMany(
    input: { readonly files: readonly File[] },
    options?: UploadOptions,
  ): Promise<UploadResult>;
}

/** An error the server answered with, as opposed to a transport failure. */
export function isHttpError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

/** `fetch` rejects an aborted request with a DOMException named AbortError. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function abortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The upload was cancelled.', 'AbortError');
  }
  const error = new Error('The upload was cancelled.');
  error.name = 'AbortError';
  return error;
}

export async function uploadFiles(
  repository: UploadRepository,
  files: readonly File[],
  options: UploadOptions = {},
  attempts: number = 2,
): Promise<UploadResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // A cancelled upload is not a transient failure: retrying it would restart
    // work the caller deliberately stopped.
    if (options.signal?.aborted) throw abortError();
    try {
      return await repository.uploadMany(
        { files },
        options.signal ? { signal: options.signal } : undefined,
      );
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || options.signal?.aborted) throw error;
      if (isHttpError(error)) throw error;
    }
  }
  throw lastError;
}
