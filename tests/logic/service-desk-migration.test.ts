// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'service-desk-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

/**
 * The tickets, the notes, the file collection and the service desk's own role table: every column the domain logic
 * reads, and the indexes it filters on.
 */
describeMigration('202611010001_create_service_desk', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const tickets = await expectCollection('tickets').toExist();
    expect(Object.keys(tickets.fields)).toEqual([
      'id',
      'title',
      'description',
      'category',
      'location',
      'urgency',
      'status',
      'statusChangedAt',
      'lifecycleVersion',
      'requesterId',
      'assigneeId',
      'solution',
      'returnReason',
      'attachmentIds',
      'createdAt',
      'updatedAt',
    ]);
    expect(tickets.primaryKey).toEqual(['id']);
    await expectCollection('tickets').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('assigneeId', {
      nullable: true,
    });
    await expectCollection('tickets').toHaveField('lifecycleVersion', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveIndex(['status']);
    await expectCollection('tickets').toHaveIndex(['requesterId']);
    await expectCollection('tickets').toHaveIndex(['assigneeId']);

    await expectCollection('ticketNotes').toHaveField('ticketId', {
      nullable: false,
    });
    await expectCollection('ticketNotes').toHaveField('content', {
      nullable: false,
    });
    await expectCollection('ticketNotes').toHaveIndex(['ticketId']);

    const files = await expectCollection('ticketFiles').toExist();
    expect(files.primaryKey).toEqual(['id']);
    await expectCollection('ticketFiles').toHaveField('key', {
      nullable: false,
    });
    await expectCollection('ticketFiles').toHaveField('size', {
      nullable: false,
    });

    await expectCollection('serviceDeskStaff').toHaveField('userId', {
      nullable: false,
    });
    await expectCollection('serviceDeskStaff').toHaveIndex(['userId'], {
      unique: true,
    });

    // The staff table holds at most one row per user; the second insert of the same user is refused.
    const now = new Date();
    await connection.query
      .insertInto('serviceDeskStaff')
      .values({
        userId: 'u1',
        role: 'engineer',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await expect(
      connection.query
        .insertInto('serviceDeskStaff')
        .values({
          userId: 'u1',
          role: 'helpdesk',
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('serviceDeskStaff').not.toExist();
    await expectCollection('ticketFiles').not.toExist();
    await expectCollection('ticketNotes').not.toExist();
    await expectCollection('tickets').not.toExist();
  },
});

/**
 * The two log tables `@nocobase/lifecycle` reads and writes. Their unique indexes are what make a repeated
 * submission fire once, so they are the part worth pinning.
 */
describeMigration('202611010002_create_lifecycle_tables', {
  sources,
  up: async ({ connection, expectCollection }) => {
    await expectCollection('lifecycleTransitions').toHaveField('requestKey', {
      nullable: false,
    });
    await expectCollection('lifecycleTransitions').toHaveField('input', {
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

    await expectCollection('lifecycleEffectRuns').toHaveField('stayBound', {
      nullable: false,
    });
    // The library writes `transitionId` as a number and reads it back with `String()`; a string column
    // turns a numeric id into "3.0" and every effect then fails its transition lookup.
    await expectCollection('lifecycleEffectRuns').toHaveField('transitionId', {
      type: 'integer',
      nullable: false,
    });
    await expectCollection('lifecycleEffectRuns').toHaveField('continuation', {
      nullable: true,
    });
    await expectCollection('lifecycleEffectRuns').toHaveField(
      'continuationDueAt',
      { nullable: true },
    );
    await expectCollection('lifecycleEffectRuns').toHaveIndex([
      'lifecycle',
      'recordId',
    ]);
    await expectCollection('lifecycleEffectRuns').toHaveIndex(['status']);

    const at = new Date();
    const row = {
      transitionId: 1,
      lifecycle: 'tickets',
      recordId: '1',
      effect: 'notify',
      stayBound: false,
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      createdAt: at,
      updatedAt: at,
    };
    await connection.query
      .insertInto('lifecycleTransitions')
      .values({
        lifecycle: 'tickets',
        recordId: '1',
        transition: '$create',
        to: 'submitted',
        actorId: 'u1',
        input: '{}',
        at,
        version: 1,
        requestKey: 'k1',
      })
      .execute();
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({
          lifecycle: 'tickets',
          recordId: '1',
          transition: 'assign',
          to: 'assigned',
          actorId: 'u1',
          input: '{}',
          at,
          version: 1,
          requestKey: 'k2',
        })
        .execute(),
    ).rejects.toThrow();

    await connection.query
      .insertInto('lifecycleEffectRuns')
      .values(row)
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('lifecycleEffectRuns').not.toExist();
    await expectCollection('lifecycleTransitions').not.toExist();
  },
});
