// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

/**
 * The four tables the service desk owns. The migration is verified against a
 * real database: it is applied, its physical schema is inspected, it is rolled
 * back and every table is checked to be gone, and it is applied again.
 */
const sources: readonly MigrationSource[] = [
  {
    packageName: 'it-tickets-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202610100001_create_it_tickets', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const tickets = await expectCollection('itTickets').toExist();
    expect(Object.keys(tickets.fields)).toEqual([
      'id',
      'title',
      'description',
      'urgency',
      'status',
      'statusChangedAt',
      'reporterId',
      'assigneeId',
      'resolution',
      'resolvedAt',
      'closedAt',
      'closedById',
      'remindedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(tickets.primaryKey).toEqual(['id']);
    await expectCollection('itTickets').toHaveField('title', {
      nullable: false,
      length: 200,
    });
    await expectCollection('itTickets').toHaveField('assigneeId', {
      nullable: true,
      length: 64,
    });
    await expectCollection('itTickets').toHaveField('resolution', {
      nullable: true,
    });
    await expectCollection('itTickets').toHaveIndex(['reporterId']);
    await expectCollection('itTickets').toHaveIndex(['assigneeId']);
    await expectCollection('itTickets').toHaveIndex(['status']);

    await expectCollection('itTicketRecords').toHaveField('ticketId', {
      nullable: false,
    });
    await expectCollection('itTicketRecords').toHaveIndex(['ticketId']);
    await expectCollection('itTicketRecords').toHaveField('content', {
      nullable: true,
    });

    const files = await expectCollection('itTicketFiles').toExist();
    expect(files.primaryKey).toEqual(['id']);
    await expectCollection('itTicketFiles').toHaveField('size', {
      nullable: false,
    });
    await expectCollection('itTicketFiles').toHaveField('ticketId', {
      nullable: true,
    });
    await expectCollection('itTicketFiles').toHaveIndex(['ticketId']);

    await expectCollection('itTeamMembers').toHaveField('userId', {
      nullable: false,
      length: 64,
    });
    await expectCollection('itTeamMembers').toHaveIndex(['userId'], {
      unique: true,
    });
    await expectCollection('itTeamMembers').toHaveIndex(['role']);

    // The team-member link is unique per user, so a person cannot hold two roles at once.
    const now = new Date();
    await connection.query
      .insertInto('itTeamMembers')
      .values({
        userId: 'user-a',
        role: 'engineer',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await expect(
      connection.query
        .insertInto('itTeamMembers')
        .values({
          userId: 'user-a',
          role: 'serviceDesk',
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('itTeamMembers').not.toExist();
    await expectCollection('itTicketFiles').not.toExist();
    await expectCollection('itTicketRecords').not.toExist();
    await expectCollection('itTickets').not.toExist();
  },
});
