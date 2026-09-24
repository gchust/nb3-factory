import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Two business documents for the attachment feature (#252), so the page is not
 * empty on first run. They deliberately ship without an attachment: the files
 * come from the factory test fixtures at upload time, and a real upload is what
 * the feature is meant to demonstrate.
 *
 * Idempotent by primary key: the `update` payload deliberately omits
 * `attachmentId`, so re-running the seed never detaches a file an operator
 * uploaded.
 */
const SAMPLE_DOCUMENTS = [
  {
    id: '1f0a5c2e-9b3d-4a6f-8c1e-2d4b6a8c0e01',
    title: '项目需求说明书',
    createdAt: '2026-09-24T02:00:00.000Z',
    updatedAt: '2026-09-24T02:00:00.000Z',
  },
  {
    id: '2b6d7e3f-4c8a-4d9b-9f0a-3e5c7b9d1f02',
    title: '产品设计规范',
    createdAt: '2026-09-24T03:00:00.000Z',
    updatedAt: '2026-09-24T03:00:00.000Z',
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609240002_sample_documents',
  async run(context) {
    const documents = context.repository('documents');
    for (const document of SAMPLE_DOCUMENTS) {
      await documents.upsertOne({
        filter: { id: document.id },
        create: {
          id: document.id,
          title: document.title,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
        update: { title: document.title },
      });
    }
  },
});

export default seed;
