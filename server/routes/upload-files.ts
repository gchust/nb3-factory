import { BusinessError } from '../providers/inspection-service.js';

/** One upload may carry at most this many files. */
export const MAX_UPLOAD_FILES = 5;
/** Each uploaded file may be at most 5 MB. */
export const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;

/** Minimal contract of Hono's request parser, kept narrow for testing. */
export interface MultipartRequestLike {
  parseBody(options?: { all?: boolean }): Promise<Record<string, unknown>>;
}

/**
 * Collect the files from a multipart request.
 *
 * `parseBody` keeps only the last value for a repeated key unless `all` is set,
 * so a batch of files sent under one field name would silently collapse to a
 * single file. Passing `all: true` keeps every part of the batch.
 */
export async function parseUploadedFiles(
  request: MultipartRequestLike,
  options: { maxFiles: number },
): Promise<File[]> {
  const body = await request.parseBody({ all: true });
  const collected: File[] = [];
  for (const value of Object.values(body)) {
    const values: unknown[] = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === 'string' || item === null || item === undefined) {
        continue;
      }
      collected.push(item as File);
    }
  }
  if (collected.length === 0) {
    throw new BusinessError('VALIDATION', '请选择要上传的文件。', 400);
  }
  if (collected.length > options.maxFiles) {
    throw new BusinessError(
      'VALIDATION',
      `一次最多上传 ${options.maxFiles} 个文件。`,
      400,
    );
  }
  for (const file of collected) {
    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      throw new BusinessError('VALIDATION', '单个文件不能超过 5 MB。', 400);
    }
  }
  return collected;
}
