import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Fictional installation data for the project-materials feature: two isolated
// test accounts and two materials owned by the first one, with real attachment
// bytes on the local disk. It exists so a reviewer can sign in and exercise the
// feature without preparing files by hand.
//
// Everything here uses fixed identifiers and existence checks, so re-running it
// (after a database reset, for example) edits nothing and overwrites no object
// the application did not put there.
//
// Accounts (both are ordinary users; the application's initial admin is created
// by the Authentication plugin's own seed):
//
//   资料员甲  username `materials.owner`     password `OwnerPass123!`
//   同事乙    username `materials.colleague`  password `ColleaguePass123!`

const OWNER_ID = 'a0000000-0000-4000-8000-000000000001';
const COLLEAGUE_ID = 'a0000000-0000-4000-8000-000000000002';

const MATERIAL_PHOTO_ID = 'b0000000-0000-4000-8000-000000000001';
const MATERIAL_REPORT_ID = 'b0000000-0000-4000-8000-000000000002';

// 4x4 red PNG. Small, valid, and a real photo stand-in.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mO4o6HxHxkzkC4AAJiYIrF+8HwVAAAAAElFTkSuQmCC';

// A minimal but valid WordprocessingML package that office viewers can open.
const DOCX_BASE64 =
  'UEsDBBQAAAAIADe6QV3XeYTq8QAAALgBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE730Ky9cqccoBIZSkB36OwKE8wMreJFb9J69b2rdn00KREOVozXwz62nXB+/EHjPZGDq5qhspMOhobBg7+b55ru6koALBgIsBO3lEkut+0W6OCUkwHKiTUynpXinSE3qgOiYMrAwxeyj8zKNKoLcworppmlulYygYSlXmDNkvhGgfcYCdK+LpwMr5loyOpHg4e+e6TkJKzmoorKt9ML+Kqq+SmsmThyabaMkGqa6VzOL1jh/0lSfK1qB4g1xewLNRfcRslIl65xmu/0/649o4DFbjhZ/TUo4aiXh77+qL4sGG71+06jR8/wlQSwMEFAAAAAgAN7pBXSAbhuqyAAAALgEAAAsAAABfcmVscy8ucmVsc43Puw6CMBQG4J2naM4uBQdjDIXFmLAafICmPZRGeklbL7y9HRzEODie23fyN93TzOSOIWpnGdRlBQStcFJbxeAynDZ7IDFxK/nsLDJYMELXFs0ZZ57yTZy0jyQjNjKYUvIHSqOY0PBYOo82T0YXDE+5DIp6Lq5cId1W1Y6GTwPagpAVS3rJIPSyBjIsHv/h3ThqgUcnbgZt+vHlayPLPChMDB4uSCrf7TKzQHNKuorZvgBQSwMEFAAAAAgAN7pBXfWGSF1oAQAAcwIAABEAAAB3b3JkL2RvY3VtZW50LnhtbI2RwW7bMAyG730KQuctdrYiyILYPWwYtkOxAumAXlmbttXKoiAx8bynH+UmLXYZdpFI6Rd/6uP+5tfo4EQxWfaVWa9KA+Qbbq3vK/Pz/uv7rYEk6Ft07KkyMyVzU1/tp13LzXEkL6AVfNpNlRlEwq4oUjPQiGnFgbzedRxHFE1jX0wc2xC5oZTUYHTFh7LcFCNab+orAK36yO2cwyUJdV7u4rIdZHYE0+6ErjLfCHOLa1PU++JVsyxS30V+okbgFoWiRZfggGNwlJWy6OPLq7+Nzq/vB5vgy4/PD6A7QmcbUTboIC1FAEWwGZafHxO1IJz52W6GEOlkaQKlBS1P3jG2q/8z/d7BzEdo0EPUr4HkJgJG7COG4Z3mBK/ALz4qUaDPyuEfLklJnAn2h9/KTwe1Xn8qN0bjQePN9uM2Y8yCW4x6Khz0/Pq6zJJo+0He0kcW4fEtd9Rdbl9GcfbL0ywu48zRpfv6D1BLAQIUAxQAAAAIADe6QV3XeYTq8QAAALgBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAN7pBXSAbhuqyAAAALgEAAAsAAAAAAAAAAAAAAIABIgEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAN7pBXfWGSF1oAQAAcwIAABEAAAAAAAAAAAAAAIAB/QEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAAJQDAAAAAA==';

// A PNG header followed by arbitrary bytes: a real file that a viewer will
// reject. It is here so the failure explanation can be seen, not described.
const CORRUPTED_PNG_BASE64 =
  'iVBORw0KGgoAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYn';

interface ProjectMaterialRecord {
  id: string;
  title: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MaterialFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdById: string | null;
  materialId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SampleUser {
  id: string;
  name: string;
  username: string;
  email: string;
  password: string;
}

interface SampleFile {
  id: string;
  materialId: string;
  filename: string;
  ext: string;
  mimeType: string;
  base64: string;
}

const SAMPLE_USERS: readonly SampleUser[] = [
  {
    id: OWNER_ID,
    name: '资料员甲',
    username: 'materials.owner',
    email: 'materials.owner@example.com',
    password: 'OwnerPass123!',
  },
  {
    id: COLLEAGUE_ID,
    name: '同事乙',
    username: 'materials.colleague',
    email: 'materials.colleague@example.com',
    password: 'ColleaguePass123!',
  },
];

const SAMPLE_MATERIALS: readonly { id: string; title: string }[] = [
  { id: MATERIAL_PHOTO_ID, title: '产品发布会现场照片' },
  { id: MATERIAL_REPORT_ID, title: '项目验收报告' },
];

const SAMPLE_FILES: readonly SampleFile[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    materialId: MATERIAL_PHOTO_ID,
    filename: 'sample-photo.png',
    ext: 'png',
    mimeType: 'image/png',
    base64: PNG_BASE64,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    materialId: MATERIAL_REPORT_ID,
    filename: 'sample-report.docx',
    ext: 'docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: DOCX_BASE64,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    materialId: MATERIAL_REPORT_ID,
    filename: 'corrupted-photo.png',
    ext: 'png',
    mimeType: 'image/png',
    base64: CORRUPTED_PNG_BASE64,
  },
];

/** Resolves the local disk directory the file plugin writes objects into. */
function resolveStorageLocation(config: {
  get<T = unknown>(key: string): T | undefined;
}): string {
  const configured = config.get<string>('drive.disks.local.location');
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured;
  }
  // The Drive config derives the location from the application's storage path;
  // this fallback keeps a standalone seed run from failing on an configuration
  // that has not resolved it yet, and matches where the runtime will look.
  return path.join(process.cwd(), 'storage');
}

/** Creates one of the sample accounts if its username is not taken yet. */
async function ensureUser(
  context: Parameters<SeedDefinition['run']>[0],
  user: SampleUser,
): Promise<string> {
  const existing = await context.query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .limit(1)
    .executeTakeFirst();
  if (existing) {
    return String(existing.id);
  }

  const now = new Date();
  const passwordHash = await hashPassword(user.password);
  await context.query
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
  await context.query
    .insertInto('account')
    .values({
      id: randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return user.id;
}

/** Writes one object to the local disk and returns its metadata. */
async function writeSampleObject(
  location: string,
  file: SampleFile,
): Promise<{ key: string; size: number }> {
  const key = `objects/${file.id}.${file.ext}`;
  const bytes = Buffer.from(file.base64, 'base64');
  await mkdir(path.join(location, path.dirname(key)), { recursive: true });
  await writeFile(path.join(location, key), bytes);
  return { key, size: bytes.byteLength };
}

const seed: SeedDefinition = defineSeed({
  name: '202610010001_project_materials_samples',
  async run(context) {
    const { config, repository } = context;
    const ownerId = await ensureUser(context, SAMPLE_USERS[0]!);
    await ensureUser(context, SAMPLE_USERS[1]!);

    const existingMaterials = await repository<ProjectMaterialRecord>(
      'projectMaterials',
    )
      .findMany()
      .then((records) => new Set(records.map((record) => record.id)));

    const now = new Date();
    for (const sample of SAMPLE_MATERIALS) {
      if (existingMaterials.has(sample.id)) {
        continue;
      }
      await repository<ProjectMaterialRecord>('projectMaterials').createOne({
        values: {
          id: sample.id,
          title: sample.title,
          createdById: ownerId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const existingFileIds = await repository<MaterialFileRecord>('materialFiles')
      .findMany()
      .then((records) => new Set(records.map((record) => record.id)));

    const location = resolveStorageLocation(config);
    for (const file of SAMPLE_FILES) {
      if (existingFileIds.has(file.id)) {
        continue;
      }
      const { key, size } = await writeSampleObject(location, file);
      await repository<MaterialFileRecord>('materialFiles').createOne({
        values: {
          id: file.id,
          disk: 'local',
          key,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size,
          createdById: ownerId,
          materialId: file.materialId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;