// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'itsm-service-desk-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The three tables the service desk works on: a ticket, its process log, and the file collection its screenshots are
// uploaded into.
describeMigration('202611150001_create_service_tickets', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const tickets = await expectCollection('serviceTickets').toExist();
    await expectCollection('serviceTickets').toHaveField('title', {
      nullable: false,
    });
    await expectCollection('serviceTickets').toHaveField('urgency', {
      nullable: false,
    });
    await expectCollection('serviceTickets').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('serviceTickets').toHaveField('requesterId', {
      nullable: false,
    });
    // An unassigned ticket has no engineer; the service desk fills this in when it assigns one.
    await expectCollection('serviceTickets').toHaveField('assigneeId', {
      nullable: true,
    });
    await expectCollection('serviceTickets').toHaveField('returnCount', {
      nullable: false,
    });
    expect(tickets.primaryKey).toEqual(['id']);
    await expectCollection('serviceTickets').toHaveIndex(['status']);
    await expectCollection('serviceTickets').toHaveIndex(['assigneeId']);
    await expectCollection('serviceTickets').toHaveIndex(['requesterId']);

    await expectCollection('serviceTicketLogs').toExist();
    await expectCollection('serviceTicketLogs').toHaveField('ticketId', {
      nullable: false,
    });
    await expectCollection('serviceTicketLogs').toHaveField('kind', {
      nullable: false,
    });
    await expectCollection('serviceTicketLogs').toHaveIndex(['ticketId']);

    await expectCollection('serviceTicketFiles').toExist();
    await expectCollection('serviceTicketFiles').toHaveField('key', {
      nullable: false,
    });
    await expectCollection('serviceTicketFiles').toHaveField('mimeType', {
      nullable: false,
    });

    const idField = tickets.fields['id'];
    expect(idField).toBeDefined();

    const now = new Date();
    await connection.query
      .insertInto('service_tickets')
      .values({
        title: 'Laptop will not start',
        description: 'The screen stays black.',
        urgency: 'high',
        status: 'pending',
        requesterId: 'user-1',
        screenshotIds: '[]',
        returnCount: 0,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    // `urgency` and `status` default, so a bare insert still lands.
    await connection.query
      .insertInto('service_tickets')
      .values({
        title: 'VPN drops',
        description: 'It disconnects every few minutes.',
        requesterId: 'user-1',
        screenshotIds: '[]',
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const rows = await connection.query
      .selectFrom('service_tickets')
      .select(['urgency', 'status'])
      .where('title', '=', 'VPN drops')
      .executeTakeFirstOrThrow();
    expect(rows).toEqual({ urgency: 'medium', status: 'pending' });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('serviceTicketLogs').not.toExist();
    await expectCollection('serviceTicketFiles').not.toExist();
    await expectCollection('serviceTickets').not.toExist();
  },
});
