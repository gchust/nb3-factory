export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type AttachmentSelectionError =
  | { readonly reason: 'tooMany'; readonly limit: number }
  | {
      readonly reason: 'tooLarge';
      readonly name: string;
      readonly limit: number;
    };

/**
 * The upload limits, checked before anything is sent so an oversized selection
 * fails with a reason instead of a generic request error.
 *
 * Kept out of the component module so Fast Refresh keeps working there.
 */
export function validateAttachmentSelection(
  files: readonly { readonly name: string; readonly size: number }[],
  maxFiles: number = MAX_FILES_PER_UPLOAD,
  maxBytes: number = MAX_FILE_BYTES,
): AttachmentSelectionError | null {
  if (files.length > maxFiles) {
    return { reason: 'tooMany', limit: maxFiles };
  }
  const oversize = files.find((file) => file.size > maxBytes);
  if (oversize) {
    return { reason: 'tooLarge', name: oversize.name, limit: maxBytes };
  }
  return null;
}
