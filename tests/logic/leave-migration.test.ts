// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'leave-requests-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The leave requests the application's `/api/leaveRequests` routes read and write.
describeMigration('202610260001_create_leave_requests', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const leaveRequests = await expectCollection('leaveRequests').toExist();
    expect(Object.keys(leaveRequests.fields)).toEqual([
      'id',
      'userId',
      'userName',
      'type',
      'startDate',
      'endDate',
      'days',
      'reason',
      'status',
      'reviewerId',
      'reviewerName',
      'reviewComment',
      'submittedAt',
      'decidedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(leaveRequests.primaryKey).toEqual(['id']);
    await expectCollection('leaveRequests').toHaveField('userId', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('leaveRequests').toHaveField('startDate', {
      type: 'date',
      nullable: false,
    });
    await expectCollection('leaveRequests').toHaveField('endDate', {
      type: 'date',
      nullable: false,
    });
    await expectCollection('leaveRequests').toHaveField('reviewerId', {
      nullable: true,
    });
    await expectCollection('leaveRequests').toHaveField('decidedAt', {
      nullable: true,
    });

    const now = new Date();
    await connection.query
      .insertInto('leaveRequests')
      .values({
        id: 'leave-a',
        userId: 'user-a',
        userName: 'Ada',
        type: 'annual',
        startDate: '2026-11-02',
        endDate: '2026-11-04',
        days: 3,
        reason: 'Family trip',
        status: 'pending',
        reviewerId: null,
        reviewerName: null,
        reviewComment: null,
        submittedAt: now,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    // The id is the primary key.
    await expect(
      connection.query
        .insertInto('leaveRequests')
        .values({
          id: 'leave-a',
          userId: 'user-b',
          userName: 'Grace',
          type: 'sick',
          startDate: '2026-11-05',
          endDate: '2026-11-05',
          days: 1,
          reason: 'Appointment',
          status: 'pending',
          reviewerId: null,
          reviewerName: null,
          reviewComment: null,
          submittedAt: now,
          decidedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('leaveRequests').not.toExist();
  },
});
