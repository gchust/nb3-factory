// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

/*
 * The two migrations this feature adds, each verified against a real database: applied, inspected field by field and
 * index by index, rolled back and applied again. The sources are the application's own migration directory, so every
 * earlier migration runs first and the assertions see the schema an installation actually has.
 */
const sources: readonly MigrationSource[] = [
  {
    packageName: 'it-service-desk-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611200001_create_ticket_tables', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const tickets = await expectCollection('tickets').toExist();
    expect(tickets.primaryKey).toEqual(['id']);
    await expectCollection('tickets').toHaveField('id', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('title', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('description', {
      nullable: true,
    });
    // The lifecycle's three required fields.
    await expectCollection('tickets').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('statusChangedAt', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('lifecycleVersion', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('reporterId', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('assigneeId', {
      nullable: true,
    });
    await expectCollection('tickets').toHaveField('overdueNotifiedAt', {
      nullable: true,
    });
    // The indexes the trigger sweep and the list queries rely on.
    await expectCollection('tickets').toHaveIndex([
      'status',
      'statusChangedAt',
    ]);
    await expectCollection('tickets').toHaveIndex(['reporterId']);
    await expectCollection('tickets').toHaveIndex(['assigneeId']);
    await expectCollection('tickets').toHaveIndex(['createdAt']);

    await expectCollection('ticketComments').toExist();
    await expectCollection('ticketComments').toHaveField('ticketId', {
      nullable: false,
    });
    await expectCollection('ticketComments').toHaveField('body', {
      nullable: false,
    });
    await expectCollection('ticketComments').toHaveIndex(['ticketId']);

    await expectCollection('lifecycleTransitions').toHaveField('version', {
      nullable: false,
    });
    await expectCollection('lifecycleTransitions').toHaveField('requestKey', {
      nullable: false,
    });
    await expectCollection('lifecycleTransitions').toHaveIndex(
      ['lifecycle', 'recordId', 'version'],
      { unique: true },
    );
    await expectCollection('lifecycleTransitions').toHaveIndex(
      ['lifecycle', 'recordId', 'requestKey'],
      { unique: true },
    );
    await expectCollection('lifecycleTransitions').toHaveIndex([
      'lifecycle',
      'recordId',
      'id',
    ]);

    await expectCollection('lifecycleEffectRuns').toHaveField('transitionId', {
      nullable: false,
    });
    await expectCollection('lifecycleEffectRuns').toHaveField('stayBound', {
      nullable: false,
    });
    await expectCollection('lifecycleEffectRuns').toHaveField('continuation', {
      nullable: true,
    });
    await expectCollection('lifecycleEffectRuns').toHaveIndex(['status', 'id']);
    await expectCollection('lifecycleEffectRuns').toHaveIndex([
      'lifecycle',
      'recordId',
      'id',
    ]);
    await expectCollection('lifecycleEffectRuns').toHaveIndex([
      'continuationDueAt',
    ]);
    await expectCollection('lifecycleEffectRuns').toHaveIndex([
      'continuationAbandonedAt',
    ]);

    // One version, and one request key, per record: the two constraints that make a transition idempotent.
    const row = {
      lifecycle: 'ticket',
      recordId: 'ticket-1',
      transition: 'assign',
      to: 'assigned',
      actorId: 'user-1',
      input: '{}',
      at: new Date(),
      version: 1,
      requestKey: 'assign-1',
    };
    await connection.query
      .insertInto('lifecycleTransitions')
      .values(row)
      .execute();
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({ ...row, requestKey: 'assign-2' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({ ...row, version: 2 })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('tickets').not.toExist();
    await expectCollection('ticketComments').not.toExist();
    await expectCollection('lifecycleTransitions').not.toExist();
    await expectCollection('lifecycleEffectRuns').not.toExist();
  },
});

describeMigration('202611200002_create_ticket_files', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const files = await expectCollection('ticket_files').toExist();
    expect(files.primaryKey).toEqual(['id']);
    await expectCollection('ticket_files').toHaveField('disk', {
      nullable: false,
    });
    await expectCollection('ticket_files').toHaveField('key', {
      nullable: false,
    });
    await expectCollection('ticket_files').toHaveField('mimeType', {
      nullable: false,
    });
    await expectCollection('ticket_files').toHaveField('size', {
      nullable: false,
    });
    // The uploader, so the file's own route can let them preview a screenshot before the ticket exists.
    await expectCollection('ticket_files').toHaveField('ownerId', {
      nullable: false,
    });

    await connection.query
      .insertInto('ticket_files')
      .values({
        id: '00000000-0000-4000-8000-000000000000',
        disk: 'ticketAttachments',
        key: 'uploads/one.png',
        filename: 'one.png',
        ext: '.png',
        mimeType: 'image/png',
        size: 12,
        ownerId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('ticket_files').not.toExist();
  },
});
