import { describe, expect, it } from 'vitest';

import { createDeskDatabase, seedDeskDatabase } from '../helpers/database.js';

describe('202609060002_seed_it_service_desk seed', () => {
  it('inserts the staff directory and demo tickets', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);

      const users = await manager
        .query()
        .selectFrom('user')
        .select(['email', 'name'])
        .orderBy('email', 'asc')
        .execute();
      expect(users).toHaveLength(5);
      expect(users.map((u) => u.email)).toEqual([
        'chen.jie@example.com',
        'li.na@example.com',
        'liu.yang@example.com',
        'wang.fang@example.com',
        'zhang.wei@example.com',
      ]);

      const accounts = await manager
        .query()
        .selectFrom('account')
        .select('id')
        .execute();
      expect(accounts).toHaveLength(5);

      const tickets = await manager
        .query()
        .selectFrom('itTickets')
        .select(['category', 'priority', 'status'])
        .execute();
      expect(tickets).toHaveLength(12);

      // Every category, priority and status appears in the demo data.
      const categories = new Set(tickets.map((t) => t.category));
      expect(categories).toEqual(
        new Set(['hardware', 'software', 'network', 'account']),
      );
      const priorities = new Set(tickets.map((t) => t.priority));
      expect(priorities).toEqual(new Set(['low', 'normal', 'high', 'urgent']));
      const statuses = new Set(tickets.map((t) => t.status));
      expect(statuses).toEqual(
        new Set(['pending', 'inProgress', 'resolved', 'closed']),
      );
    } finally {
      await manager.destroy();
    }
  });

  it('is idempotent: a second run duplicates nothing', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      await seedDeskDatabase(manager);

      const users = await manager
        .query()
        .selectFrom('user')
        .select('id')
        .execute();
      expect(users).toHaveLength(5);

      const accounts = await manager
        .query()
        .selectFrom('account')
        .select('id')
        .execute();
      expect(accounts).toHaveLength(5);

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
