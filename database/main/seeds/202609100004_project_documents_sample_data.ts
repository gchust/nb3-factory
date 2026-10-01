import { createDriveManager, type AppDriveConfig } from '@nocobase/drive';
import {
  defineSeed,
  type SeedDefinition,
  type DatabaseTaskConfig,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Installation data and acceptance fixtures for the Project documents feature.
 *
 * The application development Skill says a seed is never sample or demonstration
 * content. This seed is a deliberate exception: the issue that specifies this
 * feature asks for two fictitious documents, two isolated accounts and a small
 * set of valid and corrupted attachments, so privacy and preview behavior can be
 * seen and reviewed on a fresh database. Every row is written with a fixed id
 * and a fixed timestamp and the seed skips what already exists, so running it
 * twice changes nothing.
 *
 * The bytes are embedded here rather than read from `storage/` because that
 * directory is not part of the source and is git-ignored. The objects are
 * written through the configured drive, so both the file plugin's content route
 * and this application's own authenticated content route resolve them normally.
 */
const VALID_PNG = `
  iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABmklEQVR4nA3R0QBAIQxA0SEMIYQhhBDCEIYQwhBCCKHP+xnC
  EEJ47ygcEUGFJpjQhSG4EMIUUljCFo5whRKeIKKo0hRTujIUV0KZSipL2cpRrlLKU0Qa2mgNa/TGaHgjGrORjdXYjdO4jWq8
  hoihRjPM6MYw3AhjGmksYxvHuEYZzxDpaKd1rNM7o+Od6MxOdlZnd07ndqrzOiIDHbSBDfpgDHwQgznIwRrswRncQQ3eQMRR
  pznmdGc47oQznXSWs53jXKec54gEGrTAgh6MwIMIZpDBCnZwghtU8AKRiU7axCZ9MiY+icmc5GRN9uRM7qQmb/4PiSYtsaQn
  I/EkkplkspKdnOQmlbz8Hxa6aAtb9MVY+CIWc5GLtdiLs7iLWrz1P2x00za26Zux8U1s5iY3a7M3Z3M3tXn7fzjooR3s0A/j
  4Ic4zEMe1mEfzuEe6vDO/3DRS7vYpV/GxS9xmZe8rMu+nMu91OXd/6HQohVW9GIUXkQxiyxWsYtT3KKKV//DQx/tYY/+GA9/
  xGM+8rEe+3Ee91GP9/gAhnS4EFWZX+UAAAAASUVORK5CYII=
`;

const CORRUPT_PNG = `
  iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABmklEQVR4nA3R0QBAIQxA0SEMIYQhhBDCEIYQwhBCCKHP+xnC
  EEJ47ygcEUGFJpjQhSG4EMIUUljCFo5whRKeIKKo0hRTujIUV0KZSipL2cpRrlLKU0Qa2mgNa/TGaHgjGrORjdXYjdO4jWq8
  hoihRjPM6MYw3AhjGmksYxvHuEYZzxDpaKd1rNM7o+Od6MxOdlZnd07ndqrzOiIDHbSBDfpgDHwQgznIwRrswRncQQ3eQMRR
  pznmdGc47oQznXSWs53jXKc=
`;

const SAMPLE_DOCX = `
  UEsDBBQABgAIAAAAIQAJJIeCgQEAAI4FAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAACAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC0lE1Pg0AQ
  hu8m/geyVwPbejDGlPag9ahNrPG8LkPZyH5kZ/v17x1KS6qhpVq9kMAy7/vMCzOD0UqX0QI8KmtS1k96LAIjbabMLGWv08f4
  lkUYhMlEaQ2kbA3IRsPLi8F07QAjqjaYsiIEd8c5ygK0wMQ6MHSSW69FoFs/407IDzEDft3r3XBpTQAT4lBpsOHgAXIxL0M0
  XtHjmsRDiSy6r1+svFImnCuVFIFI+cJk31zirUNClZt3sFAOrwiD8VaH6uSwwbbumaLxKoNoInx4Epow+NL6jGdWzjX1kByX
  aeG0ea4kNPWVmvNWAiJlrsukOdFCmR3/QQ4M6xLw7ylq3RPt31QoxnkOkj52dx4a46rppLbYq+12gxAopFNMvv6CcVfouFXu
  RFjC+8u/UeyJd4LkNBpT8V7CCYn/MIxGuhMi0LwD31z7Z3NsZI5Z0mRMvHVI+8P/ou3dgqiqYxo5Bz4oaFZE24g1jrR7zu4P
  qu2WQdbizTfbdPgJAAD//wMAUEsDBBQABgAIAAAAIQAekRq38wAAAE4CAAALAAgCX3JlbHMvLnJlbHMgogQCKKAAAgAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  AAAAjJLbSgNBDIbvBd9hyH032woi0tneSKF3IusDhJnsAXcOzKTavr2jILpQ217m9OfLT9abg5vUO6c8Bq9hWdWg2JtgR99r
  eG23iwdQWchbmoJnDUfOsGlub9YvPJGUoTyMMaui4rOGQSQ+ImYzsKNchci+VLqQHEkJU4+RzBv1jKu6vsf0VwOamabaWQ1p
  Z+9AtcdYNl/WDl03Gn4KZu/Yy4kVyAdhb9kuYipsScZyjWop9SwabDDPJZ2RYqwKNuBpotX1RP9fi46FLAmhCYnP83x1nANa
  Xg902aJ5x687HyFZLBZ9e/tDg7MvaD4BAAD//wMAUEsDBBQABgAIAAAAIQB8O5c5IgEAALkDAAAcAAgBd29yZC9fcmVscy9k
  b2N1bWVudC54bWwucmVscyCiBAEooAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  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
  YXBwLnhtbFBLBQYAAAAADAAMAAkDAADGLgAAAAA=
`;

interface SeedAttachment {
  readonly id: string;
  readonly documentId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly bytes: string;
}

function decode(base64: string): Buffer {
  return Buffer.from(base64.replace(/\s+/g, ''), 'base64');
}

function objectKey(file: SeedAttachment): string {
  return `objects/${file.id}.${file.ext}`;
}

/**
 * Write any missing objects through the configured default disk. Running against
 * a disk whose driver cannot accept the write (for example an unconfigured S3
 * disk) is left to fail loudly; a seeded record without its object would only
 * hide the misconfiguration.
 */
async function materializeAttachments(
  config: DatabaseTaskConfig,
  files: readonly SeedAttachment[],
): Promise<void> {
  const driveConfig = config.get<AppDriveConfig>('drive');
  if (!driveConfig?.default || !driveConfig.disks?.[driveConfig.default]) {
    throw new Error('The drive configuration is required to seed attachments.');
  }
  if (driveConfig.disks[driveConfig.default].driver !== 'fs') return;
  const disk = createDriveManager(driveConfig).use();
  for (const file of files) {
    const key = objectKey(file);
    if (await disk.exists(key)) continue;
    await disk.put(key, decode(file.bytes), { contentType: file.mimeType });
  }
}

const seed: SeedDefinition = defineSeed({
  name: '202609100004_project_documents_sample_data',
  async run({ config, query }) {
    const createdAt = new Date('2026-01-05T09:00:00.000Z');
    const users = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        accountId: '30000000-0000-4000-8000-000000000001',
        name: '资料员甲',
        username: 'archivist_a',
        email: 'archivist.a@example.com',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        accountId: '30000000-0000-4000-8000-000000000002',
        name: '同事乙',
        username: 'colleague_b',
        email: 'colleague.b@example.com',
      },
    ];
    const password = 'Password123!';
    let passwordHash: string | undefined;
    for (const user of users) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('id', '=', user.id)
        .executeTakeFirst();
      if (existing) continue;
      passwordHash = passwordHash ?? (await hashPassword(password));
      await query
        .insertInto('user')
        .values({
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          emailVerified: true,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: user.accountId,
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: passwordHash,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
    }

    const documents = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        title: '项目开工现场照片',
        createdAt: new Date('2026-01-05T09:30:00.000Z'),
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        title: '破损图纸扫描件',
        createdAt: new Date('2026-01-06T14:00:00.000Z'),
      },
    ];
    const files: readonly SeedAttachment[] = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        documentId: documents[0].id,
        filename: 'site-photo.png',
        ext: 'png',
        mimeType: 'image/png',
        bytes: VALID_PNG,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        documentId: documents[0].id,
        filename: '开工说明.docx',
        ext: 'docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: SAMPLE_DOCX,
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        documentId: documents[1].id,
        filename: 'broken-scan.png',
        ext: 'png',
        mimeType: 'image/png',
        bytes: CORRUPT_PNG,
      },
    ];

    for (const document of documents) {
      const id = document.id;
      const existing = await query
        .selectFrom('project_documents')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('project_documents')
        .values({
          id,
          title: document.title,
          ownerId: users[0].id,
          createdAt: document.createdAt,
          updatedAt: document.createdAt,
        })
        .execute();
    }

    for (const file of files) {
      const id = file.id;
      const existing = await query
        .selectFrom('project_document_files')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('project_document_files')
        .values({
          id,
          disk: config.get<AppDriveConfig>('drive')?.default ?? 'local',
          key: objectKey(file),
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: decode(file.bytes).length,
          documentId: file.documentId,
          ownerId: users[0].id,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
    }

    await materializeAttachments(config, files);
  },
});

export default seed;
