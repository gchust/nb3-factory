import { describe, expect, it } from 'vitest';

import { createDeskDatabase, seedDeskDatabase } from '../helpers/database.js';

describe('desk database helper', () => {
  it('creates the schema and seeds the demo data', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);

      const users = await manager
        .query()
        .selectFrom('user')
        .select('id')
        .execute();
      expect(users).toHaveLength(5);

      const tickets = await manager
        .query()
        .selectFrom('itTickets')
        .select('id')
        .execute();
      expect(tickets).toHaveLength(12);
    } finally {
      await manager.destroy();
    }
  });
});
