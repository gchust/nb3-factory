import { createDatabaseManager, createMigrationContext } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import itTicketsMigration from '../../database/migrations/202609060001_create_it_tickets.js';

describe('202609060001_create_it_tickets migration', () => {
  it('creates the itTickets table with the expected columns and indexes', async () => {
    const manager = createDatabaseManager({
      connections: {
        default: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = await manager.connect();
    try {
      const context = createMigrationContext(connection);
      await itTicketsMigration.up(context);

      // The table accepts a full row.
      await manager
        .query()
        .insertInto('itTickets')
        .values({
          title: 'Test ticket',
          description: 'A row inserted after the migration ran.',
          category: 'software',
          priority: 'low',
          status: 'pending',
          requesterId: 'user-1',
          assigneeId: null,
          resolution: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      const row = await manager
        .query()
        .selectFrom('itTickets')
        .select(['id', 'title', 'status'])
        .where('title', '=', 'Test ticket')
        .executeTakeFirst();
      expect(row).toBeDefined();
      expect(Number(row!.id)).toBeGreaterThan(0);
      expect(row!.status).toBe('pending');

      // Not-null constraints reject a missing title.
      await expect(
        manager
          .query()
          .insertInto('itTickets')
          .values({
            description: 'Missing title',
            category: 'software',
            priority: 'low',
            status: 'pending',
            requesterId: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await manager.destroy();
    }
  });

  it('drops the table again on down', async () => {
    const manager = createDatabaseManager({
      connections: {
        default: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = await manager.connect();
    try {
      const context = createMigrationContext(connection);
      await itTicketsMigration.up(context);
      await itTicketsMigration.down!(context);

      await expect(
        manager.query().selectFrom('itTickets').select('id').execute(),
      ).rejects.toThrow();
    } finally {
      await manager.destroy();
    }
  });
});
