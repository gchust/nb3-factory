import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';

/**
 * The upload field's client-side gate: PNG/JPEG photos and the document types
 * the previewers understand. It is a UI hint — the server decides what it
 * accepts — but it keeps an unsupported file from being sent at all.
 */
export const MATERIAL_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.md',
] as const;

/** Matches the server's upload limit for one file. */
export const MATERIAL_MAX_SIZE = 5 * 1024 * 1024;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((value, index) => bytes[index] === value);
}

function startsAt(
  bytes: Uint8Array,
  offset: number,
  prefix: readonly number[],
): boolean {
  return startsWith(bytes.subarray(offset), prefix);
}

/**
 * Whether the leading bytes match the format the browser inferred from the file
 * extension. A `.png` whose bytes are not a PNG is what a truncation or a
 * renamed text file looks like; the browser would otherwise let it upload and
 * the preview would fail silently, showing a filename as if it had worked.
 */
async function hasImageSignature(
  file: File,
  mimeType: string,
): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  switch (mimeType) {
    case 'image/png':
      return startsWith(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    case 'image/bmp':
      return startsWith(bytes, [0x42, 0x4d]);
    case 'image/webp':
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
      );
    case 'image/tiff':
      return (
        startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
        startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
      );
    case 'image/avif':
    case 'image/heic':
    case 'image/heif':
      return startsAt(bytes, 4, [0x66, 0x74, 0x79, 0x70]);
    // An image subtype this check does not know is left to the previewer.
    default:
      return true;
  }
}

/**
 * True when an image file's own bytes agree with its declared type. Non-image
 * files and image subtypes without a known signature pass, so this only ever
 * rejects a file that is certainly damaged.
 */
export async function isReadableImageFile(file: File): Promise<boolean> {
  const mimeType = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
    return true;
  }
  return hasImageSignature(file, mimeType);
}

/**
 * The materials attachment repository, with one addition: an image whose bytes
 * are damaged is refused before it is uploaded, so the upload field reports a
 * failure instead of leaving a file that can only ever show a filename.
 *
 * The manager returns a plain object, so wrapping it by spreading copies every
 * remote method unchanged and replaces only `uploadOne`.
 */
export function useMaterialFileRepository(): ClientFileRepository {
  const manager = useService(clientFileRepositoryManagerToken);
  const { t } = useTranslation();
  return useMemo(() => {
    const repository = manager.repository('materialFiles');
    const uploadOne = repository.uploadOne.bind(repository);
    return {
      ...repository,
      uploadOne: async (input, options) => {
        if (!(await isReadableImageFile(input.file))) {
          throw new Error(t('materials.errors.corruptImage'));
        }
        return uploadOne(input, options);
      },
    };
  }, [manager, t]);
}
