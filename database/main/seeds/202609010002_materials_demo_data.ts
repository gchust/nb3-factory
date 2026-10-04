import { type QueryAdapter, defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Two fictional materials for two fictional people, so the feature can be seen
 * working without anyone typing it in first.
 *
 * A seed records the structure the application needs; this one also prepares the
 * demonstration content the task calls for — two isolated accounts, two
 * materials, and three small files (a valid PNG, a valid DOCX and a PNG whose
 * bytes are deliberately not an image, so the "this file cannot be shown"
 * explanation can be exercised). Every row and byte is fixed, and every write
 * is per-record idempotent, so re-applying it changes nothing.
 *
 * The file bytes live here as base64 rather than as binary assets next to the
 * seed: the seed then carries everything it needs through a build or an archive
 * that copies only source.
 */

/** 资料员甲 — owns both demonstration materials. */
const CLERK = {
  id: 'demo-user-materials-clerk',
  name: 'Materials Clerk Jia',
  username: 'clerk.jia',
  email: 'clerk.jia@example.com',
  password: 'Materials123!',
};

/** 同事乙 — has an account, but no materials of their own. */
const COLLEAGUE = {
  id: 'demo-user-colleague-yi',
  name: 'Colleague Yi',
  username: 'colleague.yi',
  email: 'colleague.yi@example.com',
  password: 'Materials123!',
};

const MATERIAL_A_ID = '0f8f0e6a-1a1c-4a2e-8f4b-2b7c9d5e0a01';
const MATERIAL_B_ID = '0f8f0e6a-1a1c-4a2e-8f4b-2b7c9d5e0a02';

const CREATED_AT = new Date('2026-09-01T08:00:00.000Z');
const UPDATED_AT = new Date('2026-09-01T08:30:00.000Z');

const PNG_MIME = 'image/png';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Base64 of a 64x48 PNG. */
const SITE_PHOTO_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQ0lEQVR42u3PQQkAAAgEsCtjMuNbwgp+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQErhasnmUAumnCFwAAAABJRU5ErkJggg==';
/** Base64 of a small, structurally valid DOCX. */
const SITE_NOTES_DOCX =
  'UEsDBBQAAAgAAAAAIVjJTxqwrgEAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFR5cGVzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L2NvbnRlbnQtdHlwZXMiPjxEZWZhdWx0IEV4dGVuc2lvbj0icmVscyIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1wYWNrYWdlLnJlbGF0aW9uc2hpcHMreG1sIi8+PERlZmF1bHQgRXh0ZW5zaW9uPSJ4bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi94bWwiLz48T3ZlcnJpZGUgUGFydE5hbWU9Ii93b3JkL2RvY3VtZW50LnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50Lm1haW4reG1sIi8+PC9UeXBlcz5QSwMEFAAACAAAAAAhWLmBRHEqAQAAKgEAAAsAAABfcmVscy8ucmVsczw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFJlbGF0aW9uc2hpcHMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwcyI+PFJlbGF0aW9uc2hpcCBJZD0icklkMSIgVHlwZT0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9vZmZpY2VEb2N1bWVudCIgVGFyZ2V0PSJ3b3JkL2RvY3VtZW50LnhtbCIvPjwvUmVsYXRpb25zaGlwcz5QSwMEFAAACAAAAAAhWGwMDbdjAQAAYwEAABEAAAB3b3JkL2RvY3VtZW50LnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPHc6ZG9jdW1lbnQgeG1sbnM6dz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3dvcmRwcm9jZXNzaW5nbWwvMjAwNi9tYWluIj48dzpib2R5Pjx3OnA+PHc6cj48dzp0PlByb2plY3QgTWF0ZXJpYWxzIC0gU2l0ZSBBY2NlcHRhbmNlIE5vdGVzPC93OnQ+PC93OnI+PC93OnA+PHc6cD48dzpyPjx3OnQ+VGhpcyBkb2N1bWVudCByZWNvcmRzIHRoZSBzaXRlIGFjY2VwdGFuY2UgY2hlY2tzIGZvciB0aGUgZGVtb25zdHJhdGlvbiBwcm9qZWN0Ljwvdzp0PjwvdzpyPjwvdzpwPjwvdzpib2R5Pjwvdzpkb2N1bWVudD5QSwECFAAUAAAIAAAAACFYyU8asK4BAACuAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAgAAAAAIVi5gURxKgEAACoBAAALAAAAAAAAAAAAAAAAAN8BAABfcmVscy8ucmVsc1BLAQIUABQAAAgAAAAAIVhsDA23YwEAAGMBAAARAAAAAAAAAAAAAAAAADIDAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADEBAAAAAA=';
/** The bytes of a file that claims to be a PNG but is plain text. */
const CORRUPTED_PNG = Buffer.from(
  'VGhpcyBpcyBub3QgYSB2YWxpZCBQTkcgaW1hZ2UuIFRoZSB1cGxvYWQgd2FzIGludGVycnVwdGVkLg==',
  'base64',
);

interface DemoFile {
  readonly id: string;
  readonly materialId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
}

const DEMO_FILES: readonly DemoFile[] = [
  {
    id: '3c1d0a92-9c33-4e2b-9b0e-7d1f4a6c8b01',
    materialId: MATERIAL_A_ID,
    filename: 'site-photo.png',
    ext: 'png',
    mimeType: PNG_MIME,
    bytes: Buffer.from(SITE_PHOTO_PNG, 'base64'),
  },
  {
    id: '3c1d0a92-9c33-4e2b-9b0e-7d1f4a6c8b02',
    materialId: MATERIAL_B_ID,
    filename: 'site-notes.docx',
    ext: 'docx',
    mimeType: DOCX_MIME,
    bytes: Buffer.from(SITE_NOTES_DOCX, 'base64'),
  },
  {
    id: '3c1d0a92-9c33-4e2b-9b0e-7d1f4a6c8b03',
    materialId: MATERIAL_B_ID,
    filename: 'damaged-site-photo.png',
    ext: 'png',
    mimeType: PNG_MIME,
    bytes: CORRUPTED_PNG,
  },
];

/** Where the `local` disk keeps its objects, resolved the way the running server resolves it. */
function storageRoot(config: {
  get<T = unknown>(key: string): T | undefined;
}): string {
  const configured = config.get('drive.disks.local.location');
  if (typeof configured === 'string' && configured.trim()) {
    return configured;
  }
  // The seed normally runs with the application's configuration. This fallback
  // keeps it working from a compiled `dist/database/main/seeds` tree as well.
  return path.resolve(import.meta.dirname, '../../..', 'storage');
}

export default defineSeed({
  name: '202609010002_materials_demo_data',
  async run(context) {
    const storage = storageRoot(context.config);

    await ensureUser(context.query, CLERK);
    await ensureUser(context.query, COLLEAGUE);

    await context.repository('materials').upsertOne({
      filter: { id: MATERIAL_A_ID },
      create: {
        id: MATERIAL_A_ID,
        title: 'Site acceptance photos',
        ownerId: CLERK.id,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      },
      update: {
        title: 'Site acceptance photos',
        ownerId: CLERK.id,
        updatedAt: UPDATED_AT,
      },
    });
    await context.repository('materials').upsertOne({
      filter: { id: MATERIAL_B_ID },
      create: {
        id: MATERIAL_B_ID,
        title: 'Site acceptance notes',
        ownerId: CLERK.id,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      },
      update: {
        title: 'Site acceptance notes',
        ownerId: CLERK.id,
        updatedAt: UPDATED_AT,
      },
    });

    const objects = path.join(storage, 'objects');
    await mkdir(objects, { recursive: true });
    for (const file of DEMO_FILES) {
      const key = `objects/${file.id}.${file.ext}`;
      await writeFile(path.join(storage, key), file.bytes);
      await context.repository('material_files').upsertOne({
        filter: { id: file.id },
        create: {
          id: file.id,
          disk: 'local',
          key,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: file.bytes.byteLength,
          ownerId: CLERK.id,
          materialId: file.materialId,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        },
        update: {
          disk: 'local',
          key,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: file.bytes.byteLength,
          ownerId: CLERK.id,
          materialId: file.materialId,
          updatedAt: UPDATED_AT,
        },
      });
    }
  },
});

/** Creates a credential user once, hashing the password the way the sign-in path expects. */
async function ensureUser(
  query: QueryAdapter,
  user: {
    readonly id: string;
    readonly name: string;
    readonly username: string;
    readonly email: string;
    readonly password: string;
  },
): Promise<void> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .executeTakeFirst();
  if (existing) {
    return;
  }
  const now = new Date();
  const passwordHash = await hashPassword(user.password);
  await query
    .insertInto('user')
    .values({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: `${user.id}-credential`,
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}
