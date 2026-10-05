import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Required installation data for the project-materials feature.
 *
 * It installs two isolated demonstration accounts and two fictional materials
 * with three sample attachments, so the feature can be exercised without
 * uploading anything first:
 *
 * - `materials.owner` is the 资料员 (documentation specialist) who owns both
 *   materials.
 * - `materials.viewer` is the colleague with no access to them.
 *
 * Both share the password documented in the application README. It is a
 * demonstration credential on purpose; there is nothing here that has to stay
 * secret, and no secret is written to the log.
 *
 * The run is idempotent at two levels. The Seed history records a run once, and
 * `run` itself looks up each record by a stable natural key before inserting,
 * so invoking it twice adds nothing and never overwrites a title the user
 * changed. The file bytes are written to the configured `local` disk under the
 * object key the File Repository itself would choose; if that disk is not the
 * local filesystem, the attachments are skipped with a warning and the
 * accounts and materials are still installed.
 */

const DEMO_PASSWORD = 'Materials#2026';

interface DemoAccount {
  readonly username: string;
  readonly email: string;
  readonly name: string;
}

const OWNER: DemoAccount = {
  username: 'materials.owner',
  email: 'materials.owner@example.com',
  name: '资料员甲',
};

const VIEWER: DemoAccount = {
  username: 'materials.viewer',
  email: 'materials.viewer@example.com',
  name: '同事乙',
};

interface DemoMaterial {
  readonly seedKey: string;
  readonly title: string;
}

const MATERIALS: readonly DemoMaterial[] = [
  { seedKey: 'DEMO-MATERIAL-001', title: '1 号地块地下室结构现场资料' },
  { seedKey: 'DEMO-MATERIAL-002', title: '地下室结构施工技术交底' },
];

// A small, valid 64×64 PNG: a sky/ground scene with a house and a sun.
const SITE_PHOTO_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAg0lEQVR42u3WsQmAMBCG0QwmDuAMTuIwTuIUFpYWjmFlK1bhMODhg2+A/zWXlHHeU1cAAAAAAAAA/g441+5eJsBjeoBRvrm+3gDQbH2lAQAgK8AV8pA1NfjMAQC8Cji2JRAAAAAAAAAAAAAAAEBjwDD1qQMAAAAAAAAAAAAAAAAACHYBh7QlnyQoQmEAAAAASUVORK5CYII=';

// A PNG that announces its signature and then stops: a real-world stand-in for
// a truncated upload. The extension and MIME type still say PNG, so the preview
// has to notice the decode failure rather than show a filename and call it done.
const CORRUPTED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACA=';

// A minimal but valid Word document produced by a word processor's own writer.
const TECHNICAL_REPORT_DOCX =
  'UEsDBAoAAAAIAMSzRF3XeYTq8QAAALgBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE730Ky9cqccoBIZSkB36OwKE8wMreJFb9J69b2rdn00KREOVozXwz62nXB+/EHjPZGDq5qhspMOhobBg7+b55ru6koALBgIsBO3lEkut+0W6OCUkwHKiTUynpXinSE3qgOiYMrAwxeyj8zKNKoLcworppmlulYygYSlXmDNkvhGgfcYCdK+LpwMr5loyOpHg4e+e6TkJKzmoorKt9ML+Kqq+SmsmThyabaMkGqa6VzOL1jh/0lSfK1qB4g1xewLNRfcRslIl65xmu/0/649o4DFbjhZ/TUo4aiXh77+qL4sGG71+06jR8/wlQSwMECgAAAAAAxLNEXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgAxLNEXSAbhuqyAAAALgEAAAsAAABfcmVscy8ucmVsc43Puw6CMBQG4J2naM4uBQdjDIXFmLAafICmPZRGeklbL7y9HRzEODie23fyN93TzOSOIWpnGdRlBQStcFJbxeAynDZ7IDFxK/nsLDJYMELXFs0ZZ57yTZy0jyQjNjKYUvIHSqOY0PBYOo82T0YXDE+5DIp6Lq5cId1W1Y6GTwPagpAVS3rJIPSyBjIsHv/h3ThqgUcnbgZt+vHlayPLPChMDB4uSCrf7TKzQHNKuorZvgBQSwMECgAAAAAAxLNEXQAAAAAAAAAAAAAAAAUAAAB3b3JkL1BLAwQKAAAACADEs0RdK8zyefoBAAA0AwAAEQAAAHdvcmQvZG9jdW1lbnQueG1sjVLNbtpAEL7nKSzfgyGVqgqBc6tyrNT2AVzsJkjYRrYbys2tSAjF/LVAk/BTSIgatcJEVRLAxuJhYHbtU16ha9xUqtSDpdXsjHbm++abncTuezFDHQqKmpalJB2LRGlKkFIyn5b2k/TrV8+3n9GUqnESz2VkSUjSeUGld9mtRC7Oy6l3oiBpFEGQ1HguSR9oWjbOMGrqQBA5NSJnBYm8vZUVkdNIqOwzOVnhs4qcElSVEIgZZicafcqIXFqi2S2KIqhvZD7vu5sgy/rmhbK5Xmr5jEDl4odcJknvCZzfYoxm2ATzN2djNBa1HZheoU866k7W1gislmvegNPyM7VNvhJU/Uv0p9obznHHfFicxyioTaF7A72vxK5nZTBH2P6C+gWCjq/L4eCCBuD4CMw5AQ1XFItQ6HqIekswS+7lEZQqYDVhVEGDmevcYmu50j+gQdH7ebqeVb2LAm6dods+1C7XTgU75kr/GI5nJ0J5ny/wuIztBipVwTTQSR3qVW9oY7uGOw1cP/Z+GKh5D/UTNFig9hxqE3RXxOMGmk6h2IPut9BsT4iqx6IAg6hyl31sj91lxx0aDwsD5vfIKLnfC2CeE1VEjDtpkR8ITRLMe21ZZNjuXQG1z6Bxipu/VrpODqpeETHBa7AmuDbGduG/2L4T7KPvPe47+xtQSwECFAAKAAAACADEs0Rd13mE6vEAAAC4AQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAMSzRF0AAAAAAAAAAAAAAAAGAAAAAAAAAAAAEAAAACIBAABfcmVscy9QSwECFAAKAAAACADEs0RdIBuG6rIAAAAuAQAACwAAAAAAAAAAAAAAAABGAQAAX3JlbHMvLnJlbHNQSwECFAAKAAAAAADEs0RdAAAAAAAAAAAAAAAABQAAAAAAAAAAABAAAAAhAgAAd29yZC9QSwECFAAKAAAACADEs0RdK8zyefoBAAA0AwAAEQAAAAAAAAAAAAAAAABEAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQAgAQAAbQQAAAAA';

interface DemoAttachment {
  /** Deterministic id, so a re-run writes the same object key. */
  readonly id: string;
  readonly materialIndex: number;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly base64: string;
}

const ATTACHMENTS: readonly DemoAttachment[] = [
  {
    id: '3d9c1f2a-51b0-4e6c-9a11-000000000001',
    materialIndex: 0,
    filename: 'site-photo.png',
    ext: 'png',
    mimeType: 'image/png',
    base64: SITE_PHOTO_PNG,
  },
  {
    id: '3d9c1f2a-51b0-4e6c-9a11-000000000002',
    materialIndex: 0,
    filename: 'corrupted-photo.png',
    ext: 'png',
    mimeType: 'image/png',
    base64: CORRUPTED_PNG,
  },
  {
    id: '3d9c1f2a-51b0-4e6c-9a11-000000000003',
    materialIndex: 1,
    filename: 'technical-report.docx',
    ext: 'docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: TECHNICAL_REPORT_DOCX,
  },
];

interface MaterialRow {
  id: number;
  seedKey: string | null;
  title: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdById: string;
  materialId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const seed: SeedDefinition = defineSeed({
  name: '202610200002_materials_demo_data',
  async run(context) {
    const ownerId = await ensureAccount(context, OWNER);
    await ensureAccount(context, VIEWER);

    const materials = context.repository<MaterialRow>('project_materials');
    const materialIds: number[] = [];
    for (const material of MATERIALS) {
      materialIds.push(await ensureMaterial(materials, material, ownerId));
    }

    const location = readLocalDiskLocation(context);
    if (!location) {
      console.warn(
        '[materials] No local filesystem disk is configured for "local"; ' +
          'the demonstration attachments were not installed.',
      );
      return;
    }

    const files = context.repository<FileRow>('project_material_files');
    await mkdir(path.join(location, 'objects'), { recursive: true });
    for (const attachment of ATTACHMENTS) {
      const materialId = materialIds[attachment.materialIndex];
      const existing = await files.findOne({
        filter: { materialId, filename: attachment.filename },
      });
      if (existing) continue;

      const buffer = Buffer.from(attachment.base64, 'base64');
      await writeFile(
        path.join(location, 'objects', `${attachment.id}.${attachment.ext}`),
        buffer,
      );

      const now = new Date();
      await files.createOne({
        values: {
          id: attachment.id,
          disk: 'local',
          key: `objects/${attachment.id}.${attachment.ext}`,
          filename: attachment.filename,
          ext: attachment.ext,
          mimeType: attachment.mimeType,
          size: buffer.byteLength,
          createdById: ownerId,
          materialId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

/** Reads the configured location of the `local` filesystem disk, if there is one. */
function readLocalDiskLocation(context: SeedContext): string | undefined {
  const driver = context.config.get<string>('drive.disks.local.driver');
  const location = context.config.get<string>('drive.disks.local.location');
  if (driver !== 'fs' || typeof location !== 'string' || !location) {
    return undefined;
  }
  return location;
}

/**
 * Creates the account only when its username is free, and returns the existing
 * id otherwise. Authentication owns these tables; this mirrors the plugin's own
 * installation seed rather than reaching for the administration service, which
 * a database task may not resolve.
 */
async function ensureAccount(
  context: SeedContext,
  account: DemoAccount,
): Promise<string> {
  const existing = await context.query
    .selectFrom('user')
    .select(['id'])
    .where('username', '=', account.username)
    .executeTakeFirst();
  if (existing) return String(existing.id);

  const id = crypto.randomUUID();
  const now = new Date();
  const password = await hashPassword(DEMO_PASSWORD);
  await context.query
    .insertInto('user')
    .values({
      id,
      name: account.name,
      username: account.username,
      email: account.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await context.query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return id;
}

/** Installs the material once, keyed on `seedKey`, and returns its id. */
async function ensureMaterial(
  materials: {
    findOne(options: {
      filter: Record<string, unknown>;
    }): Promise<MaterialRow | undefined>;
    createOne(options: {
      values: Partial<MaterialRow>;
    }): Promise<{ record: MaterialRow }>;
  },
  material: DemoMaterial,
  ownerId: string,
): Promise<number> {
  const existing = await materials.findOne({
    filter: { seedKey: material.seedKey },
  });
  if (existing) return Number(existing.id);

  const now = new Date();
  const { record } = await materials.createOne({
    values: {
      seedKey: material.seedKey,
      title: material.title,
      createdById: ownerId,
      createdAt: now,
      updatedAt: now,
    },
  });
  return Number(record.id);
}

export default seed;
