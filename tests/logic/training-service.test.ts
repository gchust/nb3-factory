import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_training_tables.js';
import { createTrainingService } from '../../server/providers/training.js';
import type { TrainingViewer } from '../../server/providers/training.js';

const HOUR = 3600_000;

const admin: TrainingViewer = {
  userId: 'admin-1',
  isAdmin: true,
  isInstructor: true,
  isStudent: false,
};
const instructor: TrainingViewer = {
  userId: 'instructor-1',
  isAdmin: false,
  isInstructor: true,
  isStudent: false,
};
const otherInstructor: TrainingViewer = {
  userId: 'instructor-2',
  isAdmin: false,
  isInstructor: true,
  isStudent: false,
};
const student: TrainingViewer = {
  userId: 'student-1',
  isAdmin: false,
  isInstructor: false,
  isStudent: true,
};
const outsider: TrainingViewer = {
  userId: 'student-9',
  isAdmin: false,
  isInstructor: false,
  isStudent: true,
};

describe('training service', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    const context: MigrationContext = {
      builder: connection.builder,
      query: connection.query,
      connection: {
        name: connection.name,
        driver: connection.driver,
        dialect: connection.dialect,
        capabilities: connection.capabilities,
        client: connection.client.bind(connection),
      },
    };
    await migration.up(context);
    await connection.builder.createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('name', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
    await seedBaseData();
  });

  afterEach(async () => {
    await database.destroy();
  });

  function service() {
    return createTrainingService(database);
  }

  async function seedBaseData(): Promise<void> {
    const query = database.connection().query;
    const now = new Date();
    for (const user of [
      { id: 'admin-1', name: '管理员' },
      { id: 'instructor-1', name: '李讲师' },
      { id: 'instructor-2', name: '王讲师' },
      { id: 'student-1', name: '赵一' },
      { id: 'student-2', name: '钱二' },
      { id: 'student-9', name: '吴六' },
    ]) {
      await query
        .insertInto('user')
        .values({ ...user, createdAt: now, updatedAt: now })
        .execute();
    }
    await query
      .insertInto('trainingCourses')
      .values({
        code: 'TRN-101',
        title: '新员工培训',
        description: null,
        category: '通用',
        level: '入门',
        status: 'published',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('trainingSessions')
      .values({
        code: 'SES-1',
        courseId: 1,
        title: '一班',
        instructorId: 'instructor-1',
        startAt: new Date(now.getTime() - 48 * HOUR),
        endAt: new Date(now.getTime() + 48 * HOUR),
        capacity: 30,
        location: '线上',
        status: 'in_progress',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    for (const studentId of ['student-1', 'student-2']) {
      await query
        .insertInto('trainingEnrollments')
        .values({
          sessionId: 1,
          studentId,
          status: 'active',
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const assignments = [
      {
        title: '逾期作业',
        dueAt: new Date(now.getTime() - HOUR),
        status: 'published',
      },
      {
        title: '进行中作业',
        dueAt: new Date(now.getTime() + HOUR),
        status: 'published',
      },
      {
        title: '草稿作业',
        dueAt: new Date(now.getTime() + HOUR),
        status: 'draft',
      },
      {
        title: '已截止作业',
        dueAt: new Date(now.getTime() - HOUR),
        status: 'closed',
      },
    ];
    for (const assignment of assignments) {
      await query
        .insertInto('trainingAssignments')
        .values({
          sessionId: 1,
          title: assignment.title,
          description: null,
          dueAt: assignment.dueAt,
          maxScore: 100,
          status: assignment.status,
          publishedAt: assignment.status === 'draft' ? null : now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  }

  it('flags a submission after the due date as late', async () => {
    // Assignment 1 is already past its due date.
    const submission = await service().submitAssignment(
      'student-1',
      1,
      '我的心得',
    );
    expect(submission.status).toBe('submitted');
    expect(submission.isLate).toBe(true);
    expect(submission.attempt).toBe(1);
  });

  it('accepts an on-time submission and rejects a duplicate one', async () => {
    const created = await service().submitAssignment(
      'student-1',
      2,
      '按时提交',
    );
    expect(created.isLate).toBe(false);

    await expect(
      service().submitAssignment('student-1', 2, '再次提交'),
    ).rejects.toMatchObject({ code: 'DUPLICATE_SUBMISSION' });
  });

  it('rejects submitting to a closed assignment', async () => {
    await expect(
      service().submitAssignment('student-1', 4, '迟到的提交'),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_CLOSED' });
  });

  it('rejects a student who is not enrolled', async () => {
    await expect(
      service().submitAssignment('student-9', 2, '未报名'),
    ).rejects.toMatchObject({ code: 'NOT_ENROLLED' });
  });

  it('grades a submission once and rejects a second review', async () => {
    const created = await service().submitAssignment('student-1', 2, '待批阅');
    const graded = await service().reviewSubmission(instructor, created.id, {
      decision: 'graded',
      score: 88,
      feedback: '很好',
    });
    expect(graded.status).toBe('graded');
    expect(graded.score).toBe(88);
    expect(graded.reviews).toHaveLength(1);
    expect(graded.reviews[0]?.decision).toBe('graded');

    await expect(
      service().reviewSubmission(instructor, created.id, {
        decision: 'graded',
        score: 90,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
  });

  it('validates the score range', async () => {
    const created = await service().submitAssignment('student-1', 2, '答案');
    await expect(
      service().reviewSubmission(instructor, created.id, {
        decision: 'graded',
        score: 150,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCORE' });
  });

  it('forbids a non-owner instructor from reviewing', async () => {
    const created = await service().submitAssignment('student-1', 2, '答案');
    await expect(
      service().reviewSubmission(otherInstructor, created.id, {
        decision: 'graded',
        score: 80,
      }),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' });
  });

  it('lets a returned assignment be resubmitted as a new attempt', async () => {
    const first = await service().submitAssignment('student-1', 2, '第一版');
    await service().reviewSubmission(instructor, first.id, {
      decision: 'returned',
      feedback: '请补充细节',
    });
    const second = await service().submitAssignment('student-1', 2, '第二版');
    expect(second.attempt).toBe(2);
    expect(second.status).toBe('submitted');

    const detail = await service().getAssignmentDetail(student, 2);
    expect(detail.submissions).toHaveLength(2);
    expect(detail.assignment.mySubmission?.attempt).toBe(2);
    expect(detail.submissions[0]?.reviews[0]?.decision).toBe('returned');
  });

  it('hides draft assignments from students but shows them to instructors', async () => {
    const studentView = await service().getSessionDetail(student, 1);
    expect(studentView.assignments.map((item) => item.title)).not.toContain(
      '草稿作业',
    );

    const instructorView = await service().getSessionDetail(instructor, 1);
    expect(instructorView.assignments.map((item) => item.title)).toContain(
      '草稿作业',
    );
    expect(instructorView.roster).toHaveLength(2);

    await expect(
      service().getAssignmentDetail(student, 3),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('denies a student the detail of a session they are not enrolled in', async () => {
    await expect(service().getSessionDetail(outsider, 1)).rejects.toMatchObject(
      {
        code: 'NOT_ENROLLED',
      },
    );
  });

  it('computes completion statistics over published assignments', async () => {
    const first = await service().submitAssignment('student-1', 2, '答案');
    await service().reviewSubmission(instructor, first.id, {
      decision: 'graded',
      score: 90,
      feedback: 'ok',
    });
    await service().submitAssignment('student-2', 2, '答案');

    const stats = await service().completionStats(instructor);
    expect(stats).toHaveLength(1);
    const stat = stats[0];
    // Assignments 1 and 2 are published, assignment 4 is closed, and
    // assignment 3 is a draft the two enrolled students are not expected to do.
    expect(stat?.expected).toBe(6);
    expect(stat?.graded).toBe(1);
    expect(stat?.pending).toBe(1);
    expect(stat?.notSubmitted).toBe(4);
    expect(stat?.completionRate).toBeCloseTo(1 / 6);
    expect(stat?.averageScore).toBe(90);
  });

  it('lists pending grading work for the owning instructor only', async () => {
    await service().submitAssignment('student-1', 2, '答案');
    const todo = await service().listGradingTodo(instructor);
    expect(todo).toHaveLength(1);
    expect(todo[0]?.studentName).toBe('赵一');

    const other = await service().listGradingTodo(otherInstructor);
    expect(other).toHaveLength(0);

    const all = await service().listGradingTodo(admin);
    expect(all).toHaveLength(1);
  });

  it('rejects course creation with a duplicate code but returns catalog data', async () => {
    const created = await service().createCourse({
      code: 'TRN-301',
      title: '数据安全',
      category: '合规',
      level: '进阶',
      status: 'published',
    });
    expect(created.code).toBe('TRN-301');

    await expect(
      service().createCourse({
        code: 'TRN-301',
        title: '重复课程',
        category: '合规',
        level: '进阶',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_CODE' });

    const catalog = await service().listCatalog({ includeUnpublished: true });
    expect(catalog.map((course) => course.code)).toContain('TRN-301');
    expect(
      catalog.find((course) => course.code === 'TRN-101')?.sessionCount,
    ).toBe(1);
  });

  it('enrolls a student only once and can unenroll', async () => {
    await service().enrollStudent(1, 'student-9');
    await service().enrollStudent(1, 'student-9');
    const detail = await service().getSessionDetail(instructor, 1);
    expect(
      detail.roster.filter((item) => item.studentId === 'student-9'),
    ).toHaveLength(1);

    await service().unenrollStudent(1, 'student-9');
    const after = await service().getSessionDetail(instructor, 1);
    expect(after.roster.map((item) => item.studentId)).not.toContain(
      'student-9',
    );
  });
});
