import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_delivery_tables.js';
import {
  createDeliveryService,
  type DeliveryActor,
  type DeliveryService,
} from '../../server/providers/delivery-service.js';

const OWNER = 'u-owner';
const MEMBER = 'u-member';
const REVIEWER = 'u-reviewer';
const OUTSIDER = 'u-outsider';
const FILE_V1 = '11111111-1111-1111-1111-111111111111';
const FILE_V2 = '22222222-2222-2222-2222-222222222222';

const owner: DeliveryActor = { userId: OWNER, isAdmin: false };
const member: DeliveryActor = { userId: MEMBER, isAdmin: false };
const reviewer: DeliveryActor = { userId: REVIEWER, isAdmin: false };
const outsider: DeliveryActor = { userId: OUTSIDER, isAdmin: false };

describe('delivery service', () => {
  let database: DatabaseManager;
  let service: DeliveryService;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = database.connection();
    await migration.up({
      builder: database.builder(),
      query: connection.query,
      connection,
    } as unknown as MigrationContext);
    await database.builder().createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('username', { length: 255 }).nullable();
      collection.string('email', { length: 320 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
    });
    await seedFixture(database);
    service = createDeliveryService({ database, publicBasePath: '/main' });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('keeps the versions an application already references', async () => {
    await service.addResultVersion(owner, 1, {
      note: 'second version',
      fileIds: [FILE_V2],
    });

    const submission = await service.getSubmission(owner, 1);
    expect(submission.items).toHaveLength(1);
    expect(submission.items[0].versionId).toBe(1);
    expect(submission.items[0].note).toBe('first version');
    expect(submission.items[0].files.map((file) => file.id)).toEqual([FILE_V1]);

    await expect(
      service.removeVersionFile(owner, 1, FILE_V1),
    ).rejects.toMatchObject({ code: 'VERSION_REFERENCED' });
  });

  it('removes an unreferenced version file and its metadata', async () => {
    const versionId = await service.addResultVersion(owner, 1, {
      note: 'second version',
      fileIds: [FILE_V2],
    });
    await service.removeVersionFile(owner, versionId, FILE_V2);
    const task = await service.getTask(owner, 1);
    const versions = task.results[0].versions;
    expect(versions.find((version) => version.id === versionId)?.files).toEqual(
      [],
    );
  });

  it('requires every task to be done and blocks self review', async () => {
    const milestoneId = await service.createMilestone(owner, {
      projectId: 1,
      name: 'Milestone 2',
    });
    await service.createTask(owner, { milestoneId, title: 'Todo task' });
    await expect(
      service.createSubmission(owner, {
        milestoneId,
        reviewerId: REVIEWER,
        versionIds: [],
      }),
    ).rejects.toMatchObject({ code: 'TASKS_INCOMPLETE' });

    await expect(
      service.createSubmission(owner, {
        milestoneId: 1,
        reviewerId: OWNER,
        versionIds: [1],
      }),
    ).rejects.toMatchObject({ code: 'SELF_REVIEW' });
  });

  it('only lets the assigned reviewer decide, and returning needs a reason', async () => {
    await expect(
      service.decideSubmission(owner, 1, { decision: 'approve' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.decideSubmission(reviewer, 1, {
        decision: 'return',
        comment: '',
      }),
    ).rejects.toMatchObject({ code: 'RETURN_REASON_REQUIRED' });
  });

  it('locks task status once the milestone is accepted', async () => {
    await service.decideSubmission(reviewer, 1, {
      decision: 'approve',
      comment: 'accepted',
    });
    const milestone = await service.getMilestone(owner, 1);
    expect(milestone.milestone.status).toBe('completed');
    await expect(
      service.updateTask(owner, 1, { status: 'todo' }),
    ).rejects.toMatchObject({ code: 'MILESTONE_COMPLETED' });
  });

  it('refuses another delivery application once the milestone is accepted', async () => {
    await service.decideSubmission(reviewer, 1, {
      decision: 'approve',
      comment: 'accepted',
    });
    await expect(
      service.createSubmission(owner, {
        milestoneId: 1,
        reviewerId: REVIEWER,
        versionIds: [1],
      }),
    ).rejects.toMatchObject({ code: 'MILESTONE_COMPLETED' });
  });

  it('refuses a new result on an accepted milestone without leaving a partial row', async () => {
    await service.decideSubmission(reviewer, 1, {
      decision: 'approve',
      comment: 'accepted',
    });

    await expect(
      service.createResult(owner, 1, {
        title: 'late result',
        note: 'too late',
        fileIds: [FILE_V2],
      }),
    ).rejects.toMatchObject({ code: 'MILESTONE_COMPLETED' });

    const results = await database
      .connection()
      .query.selectFrom('deliveryTaskResults')
      .select(['title'])
      .execute();
    expect(results.map((result) => String(result.title))).not.toContain(
      'late result',
    );
  });

  it('keeps one team out of another team project', async () => {
    expect(await service.listProjects(outsider)).toEqual([]);
    await expect(service.getProject(outsider, 1)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.getTask(outsider, 1)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await service.listProjects(member)).toHaveLength(1);
  });

  it('grants file access to project members and to the assigned reviewer only', async () => {
    expect(await service.canAccessFile(member, FILE_V1)).toBe(true);
    expect(await service.canAccessFile(owner, FILE_V1)).toBe(true);
    expect(await service.canAccessFile(reviewer, FILE_V1)).toBe(true);
    expect(await service.canAccessFile(outsider, FILE_V1)).toBe(false);
  });

  it('revokes file access when a member is removed', async () => {
    await service.removeMember(owner, 1, 2);
    expect(await service.canAccessFile(member, FILE_V1)).toBe(false);
  });

  it('lets the assignee update status but not other fields', async () => {
    await service.updateTask(member, 1, { status: 'in_progress' });
    await expect(
      service.updateTask(member, 1, { title: 'renamed' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.updateTask(outsider, 1, { status: 'done' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reports overdue tasks and pending reviews on the dashboard', async () => {
    const ownerDashboard = await service.dashboard(owner);
    expect(ownerDashboard.projectCount).toBe(1);
    expect(ownerDashboard.milestoneCount).toBe(1);
    expect(ownerDashboard.overdueTaskCount).toBe(0);
    expect(ownerDashboard.pendingReviewCount).toBe(0);

    const reviewerDashboard = await service.dashboard(reviewer);
    expect(reviewerDashboard.projectCount).toBe(0);
    expect(reviewerDashboard.pendingReviewCount).toBe(1);
  });
});

async function seedFixture(database: DatabaseManager): Promise<void> {
  const query = database.connection().query;
  const now = new Date();
  await query
    .insertInto('user')
    .values(
      [
        {
          id: OWNER,
          name: 'Owner',
          username: 'owner',
          email: 'owner@example.com',
        },
        {
          id: MEMBER,
          name: 'Member',
          username: 'member',
          email: 'member@example.com',
        },
        {
          id: REVIEWER,
          name: 'Reviewer',
          username: 'reviewer',
          email: 'reviewer@example.com',
        },
        {
          id: OUTSIDER,
          name: 'Outsider',
          username: 'outsider',
          email: 'outsider@example.com',
        },
      ].map((user) => ({ ...user, createdAt: now, updatedAt: now })),
    )
    .execute();

  await query
    .insertInto('deliveryProjects')
    .values({
      code: 'P-1',
      name: 'Project',
      managerId: OWNER,
      status: 'active',
      createdById: OWNER,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('deliveryProjectMembers')
    .values([
      {
        projectId: 1,
        userId: OWNER,
        role: 'manager',
        createdAt: now,
        updatedAt: now,
      },
      {
        projectId: 1,
        userId: MEMBER,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
  await query
    .insertInto('deliveryMilestones')
    .values({
      projectId: 1,
      name: 'Milestone 1',
      status: 'in_progress',
      createdById: OWNER,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('deliveryTasks')
    .values({
      milestoneId: 1,
      projectId: 1,
      title: 'Finished task',
      assigneeId: MEMBER,
      priority: 'high',
      planDate: '2026-01-01',
      actualDate: '2026-01-01',
      status: 'done',
      createdById: OWNER,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('deliveryTaskResults')
    .values({
      taskId: 1,
      title: 'Result',
      createdById: MEMBER,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('deliveryTaskResultVersions')
    .values({
      resultId: 1,
      versionNo: 1,
      note: 'first version',
      createdById: MEMBER,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('deliveryFiles')
    .values([
      {
        id: FILE_V1,
        disk: 'local',
        key: 'objects/v1.txt',
        filename: 'v1.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 10,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: FILE_V2,
        disk: 'local',
        key: 'objects/v2.txt',
        filename: 'v2.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 12,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
  await query
    .insertInto('deliveryTaskResultVersionFiles')
    .values({ versionId: 1, fileId: FILE_V1, sortOrder: 0, createdAt: now })
    .execute();
  await query
    .insertInto('deliverySubmissions')
    .values({
      projectId: 1,
      milestoneId: 1,
      applicantId: OWNER,
      reviewerId: REVIEWER,
      status: 'pending',
      note: 'please review',
      round: 1,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('deliverySubmissionItems')
    .values({ submissionId: 1, resultVersionId: 1, createdAt: now })
    .execute();
}
