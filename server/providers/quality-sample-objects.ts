import type { DatabaseManager } from '@nocobase/db';

import {
  renderSampleFile,
  SAMPLE_FILES,
  type SampleFile,
} from '../../database/main/seeds/202609190006_seed_quality_sample_files_and_reviews.js';

/**
 * Puts the seeded sample attachment bytes onto the drive the running
 * application configures.
 *
 * A seed cannot do this: it only receives a database connection, while the
 * objects live on whichever disk the runtime points `local` at — and the
 * factory runtime deliberately points it outside the workspace. The sample
 * content is defined once in the seed that owns the data set; this module
 * imports that definition and writes any object that is missing, so a seeded
 * photo, report or note previews and downloads exactly like a real upload.
 *
 * Importing the seed module is safe: it only defines its content at load time.
 */

/** Byte access needed to reconcile sample objects; the provider binds the drive. */
export interface QualitySampleObjectStorage {
  exists(disk: string, key: string): Promise<boolean>;
  put(
    disk: string,
    key: string,
    contents: Buffer,
    contentType: string,
  ): Promise<void>;
}

const SAMPLE_FILES_BY_ID = new Map<string, SampleFile>(
  SAMPLE_FILES.map((file) => [file.id, file]),
);

/**
 * Writes every seeded sample object the configured drive is missing and
 * reconciles each row's `size`, which the content route sends as
 * `Content-Length`. Existing objects are never overwritten, so a user who
 * replaces one keeps their version. Returns how many objects were written.
 */
export async function ensureQualitySampleObjects(options: {
  readonly database: DatabaseManager;
  readonly storage: QualitySampleObjectStorage;
}): Promise<number> {
  const { database, storage } = options;
  const rows = await database
    .query()
    .selectFrom('qualityAttachments')
    .select(['id', 'disk', 'key', 'size'])
    .where(
      'id',
      'in',
      SAMPLE_FILES.map((file) => file.id),
    )
    .execute<{ id: string; disk: string; key: string; size: unknown }>();

  let written = 0;
  for (const row of rows) {
    const file = SAMPLE_FILES_BY_ID.get(row.id);
    if (!file) continue;
    const bytes = await materializeFile(file, storage, row.disk, row.key);
    if (bytes === undefined) continue;
    written += 1;
    if (Number(row.size) !== bytes.length) {
      await database
        .query()
        .updateTable('qualityAttachments')
        .set({ size: bytes.length })
        .where('id', '=', row.id)
        .execute();
    }
  }
  return written;
}

/**
 * Writes the object when it is missing. Returns its bytes so the caller can
 * reconcile the row size, or `undefined` when the object already existed.
 */
async function materializeFile(
  file: SampleFile,
  storage: QualitySampleObjectStorage,
  disk: string,
  key: string,
): Promise<Buffer | undefined> {
  if (await storage.exists(disk, key)) return undefined;
  const bytes = renderSampleFile(file);
  await storage.put(disk, key, bytes, file.mimeType);
  return bytes;
}
