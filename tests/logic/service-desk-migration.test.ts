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

describeMigration('202611100001_create_service_desk', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const tickets = await expectCollection('serviceDeskTickets').toExist();
    expect(Object.keys(tickets.fields)).toEqual([
      'id',
      'title',
      'description',
      'status',
      'priority',
      'requesterId',
      'assigneeId',
      'resolution',
      'slaDueAt',
      'assignedAt',
      'resolvedAt',
      'closedAt',
      'reopenedAt',
      'overdueNotifiedAt',
      'commentCount',
      'attachments',
      'createdAt',
      'updatedAt',
    ]);
    await expectCollection('serviceDeskTickets').toHaveField('title', {
      nullable: false,
    });
    await expectCollection('serviceDeskTickets').toHaveField('assigneeId', {
      nullable: true,
    });

    const comments = await expectCollection('serviceDeskComments').toExist();
    expect(Object.keys(comments.fields)).toEqual([
      'id',
      'ticketId',
      'authorId',
      'kind',
      'body',
      'createdAt',
      'updatedAt',
    ]);

    const files = await expectCollection('serviceDeskFiles').toExist();
    expect(Object.keys(files.fields)).toEqual([
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mimeType',
      'size',
      'uploadedById',
      'ticketId',
      'createdAt',
      'updatedAt',
    ]);

    const now = new Date();
    await connection.query
      .insertInto('serviceDeskTickets')
      .values({
        id: 1,
        title: 'Laptop will not start',
        description: 'The power light blinks.',
        status: 'open',
        priority: 'high',
        requesterId: 'user-1',
        slaDueAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('serviceDeskComments')
      .values({
        id: 1,
        ticketId: 1,
        authorId: 'user-1',
        kind: 'created',
        body: 'created the ticket',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('serviceDeskFiles')
      .values({
        id: '00000000-0000-4000-8000-000000000001',
        disk: 'local',
        key: 'service-desk/file.png',
        filename: 'file.png',
        ext: 'png',
        mimeType: 'image/png',
        size: 10,
        uploadedById: 'user-1',
        ticketId: 1,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await connection.query
      .deleteFrom('serviceDeskTickets')
      .where('id', '=', 1)
      .execute();
    await expect(
      connection.query
        .selectFrom('serviceDeskComments')
        .select('id')
        .executeTakeFirst(),
    ).resolves.toBeUndefined();
    await expect(
      connection.query
        .selectFrom('serviceDeskFiles')
        .select('ticketId')
        .executeTakeFirst(),
    ).resolves.toEqual({ ticketId: null });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('serviceDeskFiles').not.toExist();
    await expectCollection('serviceDeskComments').not.toExist();
    await expectCollection('serviceDeskTickets').not.toExist();
  },
});
