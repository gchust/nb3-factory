// @vitest-environment node

import type { MigrationContext } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import itTicketMigration from '../../database/main/migrations/202609300001_create_it_tickets.js';
import type { ItTicketTestDatabase } from '../fixtures/it-tickets-database.js';
import { createItTicketTestDatabase } from '../fixtures/it-tickets-database.js';

describe('itTickets migration', () => {
  let context: ItTicketTestDatabase | undefined;

  afterEach(async () => {
    await context?.dispose();
    context = undefined;
  });

  it('creates a table the feature can read and write', async () => {
    context = await createItTicketTestDatabase();

    // The row shape the migration declares: an identity, the ticket fields,
    // and the timestamps the service fills in.
    await context.query
      .insertInto('itTickets')
      .values({
        title: 'Reset my password',
        category: 'account',
        description: null,
        submitterId: 'user-1',
        handlerId: null,
        status: 'pending',
        resolutionNote: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      })
      .execute();

    const rows = await context.query
      .selectFrom('itTickets')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Reset my password',
      category: 'account',
      submitterId: 'user-1',
      status: 'pending',
    });

    // The default the schema declares is what a row written without a status gets.
    await context.query
      .insertInto('itTickets')
      .values({
        title: 'No status given',
        category: 'other',
        description: null,
        submitterId: 'user-1',
        handlerId: null,
        resolutionNote: null,
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      })
      .execute();
    const withDefault = await context.query
      .selectFrom('itTickets')
      .selectAll()
      .where('title', '=', 'No status given')
      .executeTakeFirstOrThrow();
    expect(withDefault.status).toBe('pending');
  });

  it('reverses itself without leaving the table behind', async () => {
    context = await createItTicketTestDatabase();
    const migrationContext = {
      builder: context.builder,
      query: context.query,
      config: { get: () => undefined },
    } as unknown as MigrationContext;

    await itTicketMigration.down(migrationContext);

    await expect(
      context.query.selectFrom('itTickets').selectAll().execute(),
    ).rejects.toThrow();
  });
});
