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

export interface UploadRepository {
  uploadMany(input: { readonly files: readonly File[] }): Promise<UploadResult>;
}

/** An error the server answered with, as opposed to a transport failure. */
export function isHttpError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

export async function uploadFiles(
  repository: UploadRepository,
  files: readonly File[],
  attempts: number = 2,
): Promise<UploadResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await repository.uploadMany({ files });
    } catch (error) {
      lastError = error;
      if (isHttpError(error)) throw error;
    }
  }
  throw lastError;
}
