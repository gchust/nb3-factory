/**
 * A non-sensitive sample file that ships with the application.
 *
 * `base64` holds the exact bytes; `key` is the storage key the sample-file provider writes them to.
 */
export interface RepairSampleFile {
  readonly id: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  /** Byte length of `base64`, stated so callers that cannot decode it still know the size. */
  readonly size: number;
  readonly base64: string;
}

/** Decode a sample file's bytes for storage. */
export function decodeRepairSampleFile(file: RepairSampleFile): Uint8Array {
  return new Uint8Array(Buffer.from(file.base64, 'base64'));
}
