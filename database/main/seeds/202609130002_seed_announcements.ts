import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Fixed dates, not the current time, so a repeat run is reproducible. They are deliberately in the past so any
// announcement a user creates sorts above them.
const SAMPLE_ANNOUNCEMENTS = [
  {
    title: 'Welcome to the announcements board',
    body: 'Use this page to share updates with the team. Publish an announcement with a title and a body and it appears at the top of the list.',
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
  },
  {
    title: 'Scheduled maintenance',
    body: 'The service will be briefly unavailable on 2026-09-05 from 02:00 to 03:00 UTC while we apply updates.',
    createdAt: new Date('2026-09-02T09:00:00.000Z'),
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609130002_seed_announcements',

  async run({ query }) {
    // Seeds never overwrite user data. Only a board with no announcements at all receives the samples.
    const existing = await query
      .selectFrom('announcements')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    await query
      .insertInto('announcements')
      .values(SAMPLE_ANNOUNCEMENTS)
      .execute();
  },
});

export default seed;
