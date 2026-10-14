// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'it-service-desk-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The service desk tables: tickets, their attachments, and the two lifecycle log tables.
describeMigration('202610140001_create_it_service_desk', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const tickets = await expectCollection('tickets').toExist();
    expect(Object.keys(tickets.fields)).toEqual([
      'id',
      'title',
      'description',
      'urgency',
      'reporterId',
      'assigneeId',
      'handlingNote',
      'solution',
      'attachmentIds',
      'status',
      'statusChangedAt',
      'lifecycleVersion',
      'assignedAt',
      'resolvedAt',
      'closedAt',
      'returnedCount',
      'lastReturnReason',
      'remindedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(tickets.primaryKey).toEqual(['id']);
    await expectCollection('tickets').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('lifecycleVersion', {
      nullable: false,
    });
    await expectCollection('tickets').toHaveField('assigneeId', {
      nullable: true,
    });
    await expectCollection('tickets').toHaveField('attachmentIds', {
      nullable: true,
    });

    const files = await expectCollection('it_ticket_files').toExist();
    expect(files.primaryKey).toEqual(['id']);
    await expectCollection('it_ticket_files').toHaveField('size', {
      nullable: false,
    });
    await expectCollection('it_ticket_files').toHaveField('uploadedById', {
      nullable: true,
    });

    const transitions = await expectCollection(
      'lifecycleTransitions',
    ).toExist();
    expect(transitions.primaryKey).toEqual(['id']);
    await expectCollection('lifecycleTransitions').toHaveField('requestKey', {
      nullable: false,
    });
    await expectCollection('lifecycleTransitions').toHaveField('from', {
      nullable: true,
    });

    const effectRuns = await expectCollection('lifecycleEffectRuns').toExist();
    expect(effectRuns.primaryKey).toEqual(['id']);
    await expectCollection('lifecycleEffectRuns').toHaveField('stayBound', {
      nullable: false,
    });
    await expectCollection('lifecycleEffectRuns').toHaveField('continuation', {
      nullable: true,
    });

    // The transition log enforces one entry per record version and per request key.
    const now = new Date();
    const base = {
      lifecycle: 'tickets',
      recordId: '1',
      transition: 'assign',
      from: 'pending',
      to: 'processing',
      actorId: 'service',
      at: now,
      version: 1,
      requestId: 'req-1',
    };
    await connection.query
      .insertInto('lifecycleTransitions')
      .values({ ...base, id: 1, requestKey: 'req-1' })
      .execute();
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({ ...base, id: 2, requestKey: 'req-2' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({
          ...base,
          id: 3,
          version: 2,
          requestKey: 'req-1',
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('tickets').not.toExist();
    await expectCollection('it_ticket_files').not.toExist();
    await expectCollection('lifecycleTransitions').not.toExist();
    await expectCollection('lifecycleEffectRuns').not.toExist();
  },
});
