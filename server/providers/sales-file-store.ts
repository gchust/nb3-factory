import type {
  FileRecord,
  FileStore,
  NewFileRecord,
} from '@nocobase/app-plugin-file';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { DatabaseManager } from '@nocobase/db';
import type { Context } from 'hono';

const FILE_COLUMNS = [
  'id',
  'disk',
  'key',
  'filename',
  'mimeType',
  'size',
  'public',
  'createdAt',
  'updatedAt',
] as const;

/**
 * File store for business-license attachments with replace semantics.
 *
 * The file plugin's database store performs a plain INSERT, which collides
 * with the one-to-one `business_license_files.customer_profile_id` UNIQUE
 * constraint on a second upload. This store deletes the profile's previous
 * file (database row and drive object) inside the same transaction before
 * inserting the new one, so re-uploading a business license replaces the old
 * file instead of failing.
 */
export function createBusinessLicenseStore(
  database: DatabaseManager,
  drive: NocoBaseDriveManager,
): FileStore {
  return {
    async list(context) {
      const profileId = profileIdOf(context);
      const rows = await database
        .query()
        .selectFrom('businessLicenseFiles')
        .select(FILE_COLUMNS)
        .where('customerProfileId', '=', profileId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(toFileRecord);
    },
    async find(id, context) {
      const profileId = profileIdOf(context);
      const row = await database
        .query()
        .selectFrom('businessLicenseFiles')
        .select(FILE_COLUMNS)
        .where('id', '=', id)
        .where('customerProfileId', '=', profileId)
        .executeTakeFirst();
      return row ? toFileRecord(row) : null;
    },
    async create(input: NewFileRecord, context) {
      const profileId = profileIdOf(context);
      return database.transaction(async (connection) => {
        const existing = await connection.query
          .selectFrom('businessLicenseFiles')
          .select(FILE_COLUMNS)
          .where('customerProfileId', '=', profileId)
          .executeTakeFirst();
        if (existing) {
          await connection.query
            .deleteFrom('businessLicenseFiles')
            .where('id', '=', existing.id)
            .execute();
          await removeDriveObject(drive, {
            disk: String(existing.disk),
            key: String(existing.key),
          });
        }
        const now = new Date();
        await connection.query
          .insertInto('businessLicenseFiles')
          .values({
            ...input,
            customerProfileId: profileId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        const row = await connection.query
          .selectFrom('businessLicenseFiles')
          .select(FILE_COLUMNS)
          .where('id', '=', input.id)
          .executeTakeFirst();
        if (!row) {
          throw new Error(
            `Created file record "${input.id}" could not be read.`,
          );
        }
        return toFileRecord(row);
      });
    },
    async remove(id, context) {
      const profileId = profileIdOf(context);
      return database.transaction(async (connection) => {
        const row = await connection.query
          .selectFrom('businessLicenseFiles')
          .select(FILE_COLUMNS)
          .where('id', '=', id)
          .where('customerProfileId', '=', profileId)
          .executeTakeFirst();
        if (!row) {
          return null;
        }
        await connection.query
          .deleteFrom('businessLicenseFiles')
          .where('id', '=', id)
          .execute();
        return toFileRecord(row);
      });
    },
  };
}

function profileIdOf(context: Context): number {
  const profileId = Number(context.req.param('profileId'));
  if (!Number.isInteger(profileId)) {
    throw new TypeError('Invalid customer profile id.');
  }
  return profileId;
}

function toFileRecord(row: Record<string, unknown>): FileRecord {
  return {
    id: String(row.id),
    disk: String(row.disk),
    key: String(row.key),
    filename: String(row.filename),
    mimeType: String(row.mimeType),
    size: Number(row.size),
    public: Boolean(row.public),
    createdAt: row.createdAt as Date | string,
    updatedAt: row.updatedAt as Date | string,
  };
}

async function removeDriveObject(
  drive: NocoBaseDriveManager,
  record: { disk: string; key: string },
): Promise<void> {
  try {
    await drive.use(record.disk).delete(record.key);
  } catch (error) {
    // The database row is already gone; a leftover drive object is a storage
    // leak, not a correctness failure, so log and continue.
    console.error('Business-license file object cleanup failed.', error);
  }
}
