import { defineSeed, type SeedDefinition } from '@nocobase/db';

const HOME_COUNTER_KEY = 'home';

const seed: SeedDefinition = defineSeed({
  name: '202609140002_seed_access_counter_home',

  async run({ query }) {
    const existing = await query
      .selectFrom('accessCounters')
      .select('id')
      .where('key', '=', HOME_COUNTER_KEY)
      .executeTakeFirst();
    if (existing) return;

    await query
      .insertInto('accessCounters')
      .values({ key: HOME_COUNTER_KEY, count: 0 })
      .execute();
  },
});

export default seed;
