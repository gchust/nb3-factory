import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two isolated test accounts and two fictional materials with real attachments.
 *
 * The bytes are embedded as base64 rather than read from files beside this seed:
 * the build compiles the seed to JavaScript and does not carry sibling assets, so
 * a seed that read a `.png` at run time would work in development and fail in a
 * deployment. Every id is fixed so the seed is deterministic and safe to run
 * twice, and so a screenshot or a link written in a report keeps pointing at the
 * same row.
 */

const ACCOUNTS = [
  {
    id: 'a1b2c3d4-0001-4000-8000-000000000001',
    username: 'jia',
    email: 'jia@example.com',
    displayName: '资料员甲',
    password: 'jia123456',
  },
  {
    id: 'a1b2c3d4-0002-4000-8000-000000000002',
    username: 'tongshi',
    email: 'tongshi@example.com',
    displayName: '普通同事乙',
    password: 'tongshi123456',
  },
] as const;

/** A 96x96 solid blue PNG: a small, valid image that renders in any browser. */
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAjklEQVR42u3QMQ0AAAgDsJlBGfIxgQNOriZV0FQPhygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkCBBggQJQpAgQYIECRIkCEGCBAkSJEiQIEEIEiRIkCBBggQhSJCgPwuCZi8NLeY2SQAAAABJRU5ErkJggg==';

/**
 * The same PNG with its IHDR data and CRC overwritten. The file still carries a
 * `.png` extension and an `image/png` type, so it uploads as an image, and every
 * decoder rejects it — which is what the preview has to explain instead of
 * showing a broken image.
 */
const CORRUPT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGB0aGlzLWlzLW5vdC1hLWRlY29kYWJsZS1wbmdUeNrt0DENAAAIA7CZQRnyMYEDTq4mVdBUD4coECRIkCBBggQJQpAgQYIECRIkCEGCBAkSJEiQIAQJEiRIkCBBggQhSJAgQYIECRKEIEGCBAkSJEgQggQJEiRIkCBBghAkSJAgQYIECUKQIEGCBAkSJAhBggQJEiRIkCBBCBIkSJAgQYIEIUiQoD8LgmYvDS3mNkkAAAAASUVORK5CYII=';

/** A minimal valid DOCX whose body holds three paragraphs of real text. */
const VALID_DOCX_BASE64 =
  'UEsDBBQAAAAIAGy+R115bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAbL5HXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAGy+R12GGx+fdgAAAIwAAAAcAAAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc02MQQ7CIBAAv0L2bkEPxpjS3voAow/Y0BWIsBCWGP29HD1OJjPz+slJvalJLGzhOBlQxK7skb2Fx307XEBJR94xFSYLXxJYl/lGCftIJMQqajxYLITe61VrcYEyylQq8TDP0jL2gc3riu6FnvTJmLNu/w/Qyw9QSwMEFAAAAAgAbL5HXZcTyzc4AQAAygEAABEAAAB3b3JkL2RvY3VtZW50LnhtbJ2RQU/CMBiG/0rTuxQ9GLOwcdDoTT1o4nVuFUhY27STyQ0ICiQEL+hBFhL0ICGL6MUgJv4Zt479CzuI8eLBeHm/9PvePm++Npe/cMqggrkoUaLD9UwWAkwsapdIQYfHR7trWxAI1yS2WaYE67CKBcwbOU+zqXXuYOICBSBC83RYdF2mISSsInZMkaEMEzU7o9wxXXXkBeRRbjNOLSyE4jtltJHNbiLHLBGYIk+pXU0rS4WnsqRrgpmWimYcC8wrGBrJ6C0ePCV+Tb405G1Ljh5ySJmNVPlS2Z840g/U9fD9Ne6Pw3kvmXQX0zrYOdg+AZE/juZ91Y+uLuO7pnJG/nNy31w8tuVNWw79z1rjf6FxEISzWtxpR9cT2Z/Kbh0c7u+BaPARd1rhrLfKX631ewj6fir08w3GF1BLAQIUAxQAAAAIAGy+R115bjPX6AAAAK0BAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAbL5HXZv9N+qtAAAAKQEAAAsAAAAAAAAAAAAAAIABGQEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAbL5HXYYbH592AAAAjAAAABwAAAAAAAAAAAAAAIAB7wEAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwECFAMUAAAACABsvkddlxPLNzgBAADKAQAAEQAAAAAAAAAAAAAAgAGfAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAQABAADAQAABgQAAAAA';

const MATERIAL_ONE_ID = 'b1b2c3d4-0001-4000-8000-000000000001';
const MATERIAL_TWO_ID = 'b1b2c3d4-0002-4000-8000-000000000002';

interface SampleFile {
  readonly id: string;
  readonly materialId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly base64: string;
}

const SAMPLE_FILES: readonly SampleFile[] = [
  {
    id: 'c1b2c3d4-0001-4000-8000-000000000001',
    materialId: MATERIAL_ONE_ID,
    filename: '工地现场照片.png',
    ext: 'png',
    mimeType: 'image/png',
    base64: VALID_PNG_BASE64,
  },
  {
    id: 'c1b2c3d4-0002-4000-8000-000000000002',
    materialId: MATERIAL_ONE_ID,
    filename: '损坏的照片.png',
    ext: 'png',
    mimeType: 'image/png',
    base64: CORRUPT_PNG_BASE64,
  },
  {
    id: 'c1b2c3d4-0003-4000-8000-000000000003',
    materialId: MATERIAL_TWO_ID,
    filename: '项目需求文档.docx',
    ext: 'docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: VALID_DOCX_BASE64,
  },
];

const seed = defineSeed({
  name: '202610010001_project_materials_sample_data',
  async run(context) {
    const owner = ACCOUNTS[0];

    for (const account of ACCOUNTS) {
      const existing = await context.repository('user').findOne({
        filter: { username: account.username },
      });
      if (existing) {
        continue;
      }
      const now = new Date();
      const password = await hashPassword(account.password);
      await context.repository('user').createOne({
        values: {
          id: account.id,
          name: account.displayName,
          username: account.username,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      await context.repository('account').createOne({
        values: {
          id: crypto.randomUUID(),
          accountId: account.id,
          providerId: 'credential',
          userId: account.id,
          password,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const materials = [
      { id: MATERIAL_ONE_ID, title: '工地现场照片归档' },
      { id: MATERIAL_TWO_ID, title: '项目需求文档' },
    ];
    for (const material of materials) {
      const existing = await context.repository('projectMaterials').findOne({
        filter: { id: material.id },
      });
      if (existing) {
        continue;
      }
      const now = new Date();
      await context.repository('projectMaterials').createOne({
        values: {
          id: material.id,
          title: material.title,
          ownerId: owner.id,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const diskLocation = resolveDiskLocation(context.config);
    const objects = join(diskLocation, 'objects');
    await mkdir(objects, { recursive: true });

    for (const file of SAMPLE_FILES) {
      const key = `objects/${file.id}.${file.ext}`;
      const bytes = Buffer.from(file.base64, 'base64');
      // The row is the record of truth; rewriting identical bytes keeps the
      // stored object in step with it even if the file was removed by hand.
      await writeFile(join(diskLocation, key), bytes);
      const existing = await context
        .repository('projectMaterialFiles')
        .findOne({
          filter: { id: file.id },
        });
      if (existing) {
        continue;
      }
      const now = new Date();
      await context.repository('projectMaterialFiles').createOne({
        values: {
          id: file.id,
          disk: 'local',
          key,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: bytes.byteLength,
          ownerId: owner.id,
          materialId: file.materialId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

/** Where the `local` disk keeps objects, falling back to the database's directory. */
function resolveDiskLocation(config: {
  get<T = unknown>(key: string): T | undefined;
}): string {
  const configured = config.get<string>('drive.disks.local.location');
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  const filename = config.get<string>('database.connections.main.filename');
  if (typeof filename === 'string' && filename.length > 0) {
    return dirname(filename);
  }
  throw new Error(
    'Cannot resolve the local disk location: no drive or database path is configured.',
  );
}

export default seed;
