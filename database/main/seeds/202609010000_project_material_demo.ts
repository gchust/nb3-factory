import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

/**
 * A seed is loaded as its own module, from the compiled `.js` in a deployment and from the `.ts` in
 * development, so it cannot import the server module that holds the fixture bytes: the relative
 * `.js` specifier resolves in `dist` and not against the TypeScript sources. The seed therefore
 * restates the attachment metadata it needs, and the byte fixtures stay in
 * `server/providers/demo-fixtures.ts`, which `ProjectMaterialServiceProvider.start` writes to the
 * disk. Keeping the two in step is checked by the demo attachment test.
 */
interface DemoAttachmentFixture {
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

const DEMO_SITE_PHOTO: DemoAttachmentFixture = {
  filename: 'site-photo.png',
  ext: 'png',
  mimeType: 'image/png',
  size: 75,
};

const DEMO_SITE_DOCUMENT: DemoAttachmentFixture = {
  filename: 'site-document.docx',
  ext: 'docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 1154,
};

const DEMO_CORRUPTED_PHOTO: DemoAttachmentFixture = {
  filename: 'corrupted-photo.png',
  ext: 'png',
  mimeType: 'image/png',
  size: 152,
};

/**
 * Demonstration content for project materials.
 *
 * Two isolated contributors, each owning one material, so the ownership rule can be exercised by
 * signing in as either. The attachment rows point at the byte fixtures the application provisions
 * on startup (`ProjectMaterialServiceProvider.start`): a seed runs inside the database task
 * container, which does not expose the drive to read or write bytes.
 *
 * The name sorts after the authentication plugin's default-admin seed, which returns early once any
 * user exists. Running first would leave the application without a super admin.
 */
const ZHEN = {
  username: 'ziliao_jia',
  email: 'jia@example.com',
  name: '资料员甲',
} as const;

const YI = {
  username: 'ziliao_yi',
  email: 'yi@example.com',
  name: '资料员乙',
} as const;

const DEMO_PASSWORD = 'Passw0rd!';

const MATERIAL_PHOTOS_ID = '6f6b1a2c-1a4e-4c9a-9f3e-2b1d7c8e5a01';
const MATERIAL_INSPECTION_ID = '6f6b1a2c-1a4e-4c9a-9f3e-2b1d7c8e5a02';

const PHOTO_FILE_ID = '1a7d3f20-9c2b-4e51-8a6d-0f4b7c1e9d11';
const DOCUMENT_FILE_ID = '1a7d3f20-9c2b-4e51-8a6d-0f4b7c1e9d12';
const CORRUPTED_FILE_ID = '1a7d3f20-9c2b-4e51-8a6d-0f4b7c1e9d13';

function fileRow(fixture: DemoAttachmentFixture, id: string) {
  return {
    id,
    disk: 'local',
    key: `objects/${id}.${fixture.ext}`,
    filename: fixture.filename,
    ext: fixture.ext,
    mimeType: fixture.mimeType,
    size: fixture.size,
  };
}

const seed = defineSeed({
  name: '202609010000_project_material_demo',
  async run({ query }) {
    const now = new Date();

    const ensureUser = async (account: {
      readonly username: string;
      readonly email: string;
      readonly name: string;
    }): Promise<string> => {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst<{ id: string }>();
      if (existing) return existing.id;

      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          username: account.username,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return userId;
    };

    const jiaId = await ensureUser(ZHEN);
    const yiId = await ensureUser(YI);

    const ensureMaterial = async (input: {
      readonly id: string;
      readonly title: string;
      readonly createdById: string;
    }): Promise<void> => {
      const existing = await query
        .selectFrom('projectMaterials')
        .select('id')
        .where('id', '=', input.id)
        .executeTakeFirst();
      if (existing) return;
      await query
        .insertInto('projectMaterials')
        .values({
          id: input.id,
          title: input.title,
          createdById: input.createdById,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };

    const ensureFile = async (input: {
      readonly fixture: DemoAttachmentFixture;
      readonly id: string;
      readonly ownerId: string;
      readonly materialId: string | null;
    }): Promise<void> => {
      const existing = await query
        .selectFrom('projectMaterialFiles')
        .select('id')
        .where('id', '=', input.id)
        .executeTakeFirst();
      if (existing) return;
      await query
        .insertInto('projectMaterialFiles')
        .values({
          ...fileRow(input.fixture, input.id),
          ownerId: input.ownerId,
          materialId: input.materialId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };

    await ensureMaterial({
      id: MATERIAL_PHOTOS_ID,
      title: '1号楼基础施工照片与说明',
      createdById: jiaId,
    });
    await ensureFile({
      fixture: DEMO_SITE_PHOTO,
      id: PHOTO_FILE_ID,
      ownerId: jiaId,
      materialId: MATERIAL_PHOTOS_ID,
    });
    await ensureFile({
      fixture: DEMO_SITE_DOCUMENT,
      id: DOCUMENT_FILE_ID,
      ownerId: jiaId,
      materialId: MATERIAL_PHOTOS_ID,
    });

    await ensureMaterial({
      id: MATERIAL_INSPECTION_ID,
      title: '2号楼巡检记录',
      createdById: yiId,
    });
    await ensureFile({
      fixture: DEMO_CORRUPTED_PHOTO,
      id: CORRUPTED_FILE_ID,
      ownerId: yiId,
      materialId: MATERIAL_INSPECTION_ID,
    });
  },
});

export default seed;
