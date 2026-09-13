import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Example material so a fresh installation has something to open in the resource centre.
// The rows deliberately carry no attachments: cover and document arrive through the UI.
// A repeat run inserts nothing, keyed on the title.
const EXAMPLE_RESOURCES = [
  { title: 'Employee Handbook', category: 'Policy' },
  { title: 'Product Roadmap 2026', category: 'Product' },
  { title: 'Safety Training Guide', category: 'Training' },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609130003_seed_resource_center',

  async run({ query }) {
    for (const resource of EXAMPLE_RESOURCES) {
      const existing = await query
        .selectFrom('resources')
        .select('id')
        .where('title', '=', resource.title)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      await query
        .insertInto('resources')
        .values({
          title: resource.title,
          category: resource.category,
          coverFileId: null,
          documentFileId: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
