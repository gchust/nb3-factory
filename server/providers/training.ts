import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export const TRAINING_ADMIN_ROLE = 'training-admin';
export const TRAINING_INSTRUCTOR_ROLE = 'training-instructor';
export const TRAINING_STUDENT_ROLE = 'training-student';

const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
const SESSION_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const;

export type TrainingCourseStatus = (typeof COURSE_STATUSES)[number];
export type TrainingSessionStatus = (typeof SESSION_STATUSES)[number];
export type TrainingAssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export interface TrainingViewer {
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly isInstructor: boolean;
  readonly isStudent: boolean;
}

export class TrainingError extends Error {
  public readonly code: string;
  public readonly status: 400 | 403 | 404 | 409;

  constructor(
    code: string,
    message: string,
    status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'TrainingError';
    this.code = code;
    this.status = status;
  }
}

export interface CourseSummary {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string;
  readonly level: string;
  readonly status: TrainingCourseStatus;
  readonly sessionCount: number;
  readonly assignmentCount: number;
}

export interface SessionSummary {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly courseId: number;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly capacity: number;
  readonly location: string | null;
  readonly status: TrainingSessionStatus;
  readonly enrolledCount: number;
}

export interface LearningSession extends SessionSummary {
  readonly assignmentCount: number;
  readonly submittedCount: number;
  readonly gradedCount: number;
  readonly returnedCount: number;
  readonly nextDueAt: string | null;
}

export interface SubmissionView {
  readonly id: number;
  readonly assignmentId: number;
  readonly studentId: string;
  readonly studentName?: string;
  readonly attempt: number;
  readonly content: string;
  readonly status: 'submitted' | 'graded' | 'returned';
  readonly isLate: boolean;
  readonly submittedAt: string;
  readonly score: number | null;
  readonly feedback: string | null;
  readonly maxScore: number;
  readonly reviewedById: string | null;
  readonly reviewedAt: string | null;
  readonly reviews: readonly SubmissionReviewView[];
}

export interface SubmissionReviewView {
  readonly id: number;
  readonly attempt: number;
  readonly decision: 'graded' | 'returned';
  readonly score: number | null;
  readonly feedback: string;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly createdAt: string;
}

export interface AssignmentView {
  readonly id: number;
  readonly sessionId: number;
  readonly title: string;
  readonly description: string | null;
  readonly dueAt: string;
  readonly maxScore: number;
  readonly status: TrainingAssignmentStatus;
  readonly publishedAt: string | null;
  readonly submissionCount: number;
  readonly gradedCount: number;
  readonly pendingCount: number;
  readonly returnedCount: number;
  readonly mySubmission: SubmissionView | null;
}

export interface SessionDetail {
  readonly session: SessionSummary;
  readonly assignments: readonly AssignmentView[];
  readonly roster: readonly {
    readonly studentId: string;
    readonly studentName: string;
  }[];
}

export interface AssignmentDetail {
  readonly assignment: AssignmentView;
  readonly session: SessionSummary;
  readonly submissions: readonly SubmissionView[];
}

export interface GradingTodoItem {
  readonly submissionId: number;
  readonly assignmentId: number;
  readonly assignmentTitle: string;
  readonly sessionId: number;
  readonly sessionTitle: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly attempt: number;
  readonly submittedAt: string;
  readonly isLate: boolean;
}

export interface CompletionStat {
  readonly sessionId: number;
  readonly sessionTitle: string;
  readonly courseTitle: string;
  readonly instructorName: string;
  readonly status: TrainingSessionStatus;
  readonly expected: number;
  readonly graded: number;
  readonly pending: number;
  readonly returned: number;
  readonly notSubmitted: number;
  readonly late: number;
  readonly completionRate: number;
  readonly averageScore: number | null;
}

export interface TrainingUserOption {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
}

export interface TrainingService {
  listCatalog(options?: {
    search?: string;
    category?: string;
    includeUnpublished?: boolean;
  }): Promise<readonly CourseSummary[]>;
  listCategories(): Promise<readonly string[]>;
  listMyLearning(viewer: TrainingViewer): Promise<readonly LearningSession[]>;
  getSessionDetail(
    viewer: TrainingViewer,
    sessionId: number,
  ): Promise<SessionDetail>;
  getAssignmentDetail(
    viewer: TrainingViewer,
    assignmentId: number,
  ): Promise<AssignmentDetail>;
  submitAssignment(
    studentId: string,
    assignmentId: number,
    content: string,
  ): Promise<SubmissionView>;
  reviewSubmission(
    viewer: TrainingViewer,
    submissionId: number,
    input: {
      decision: 'graded' | 'returned';
      score?: number | null;
      feedback?: string | null;
    },
  ): Promise<SubmissionView>;
  listGradingTodo(viewer: TrainingViewer): Promise<readonly GradingTodoItem[]>;
  completionStats(viewer: TrainingViewer): Promise<readonly CompletionStat[]>;
  listUsersByRole(role: string): Promise<readonly TrainingUserOption[]>;
  createCourse(input: {
    code: string;
    title: string;
    description?: string | null;
    category: string;
    level: string;
    status?: string;
  }): Promise<CourseSummary>;
  updateCourse(
    courseId: number,
    input: {
      title?: string;
      description?: string | null;
      category?: string;
      level?: string;
      status?: string;
    },
  ): Promise<CourseSummary>;
  createSession(input: {
    code: string;
    courseId: number;
    title: string;
    instructorId: string;
    startAt: string;
    endAt: string;
    capacity?: number;
    location?: string | null;
    status?: string;
  }): Promise<SessionSummary>;
  updateSession(
    sessionId: number,
    input: {
      title?: string;
      instructorId?: string;
      startAt?: string;
      endAt?: string;
      capacity?: number;
      location?: string | null;
      status?: string;
    },
  ): Promise<SessionSummary>;
  enrollStudent(sessionId: number, studentId: string): Promise<void>;
  unenrollStudent(sessionId: number, studentId: string): Promise<void>;
  createAssignment(
    viewer: TrainingViewer,
    input: {
      sessionId: number;
      title: string;
      description?: string | null;
      dueAt: string;
      maxScore?: number;
      status?: string;
    },
  ): Promise<AssignmentView>;
  updateAssignment(
    viewer: TrainingViewer,
    assignmentId: number,
    input: {
      title?: string;
      description?: string | null;
      dueAt?: string;
      maxScore?: number;
      status?: string;
    },
  ): Promise<AssignmentView>;
}

export const trainingServiceToken: ServiceToken<TrainingService> =
  createServiceToken<TrainingService>('app/training-service');

export default class TrainingProvider extends ServiceProvider<Application> {
  public readonly name = 'app/training-provider';

  public override register(): void {
    this.app.container.singleton(trainingServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createTrainingService(database);
    });
  }
}

export function createTrainingService(
  database: DatabaseManager,
): TrainingService {
  return new TrainingServiceImpl(database);
}

class TrainingServiceImpl implements TrainingService {
  constructor(private readonly database: DatabaseManager) {}

  private get query(): QueryAdapter {
    return this.database.query();
  }

  public async listCatalog(options?: {
    search?: string;
    category?: string;
    includeUnpublished?: boolean;
  }): Promise<readonly CourseSummary[]> {
    let query = this.query.selectFrom('trainingCourses').selectAll();
    if (!options?.includeUnpublished) {
      query = query.where('status', '=', 'published');
    }
    if (options?.category) {
      query = query.where('category', '=', options.category);
    }
    const search = options?.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      query = query.where((eb) =>
        eb.or([eb('title', 'like', pattern), eb('code', 'like', pattern)]),
      );
    }
    const courses = await query.orderBy('code', 'asc').execute();

    const sessions = await this.query
      .selectFrom('trainingSessions')
      .select(['id', 'courseId', 'status'])
      .execute();
    const assignments = await this.query
      .selectFrom('trainingAssignments')
      .select(['id', 'sessionId', 'status'])
      .execute();
    const assignmentBySession = new Map<number, number>();
    for (const assignment of assignments) {
      const sessionId = num(assignment.sessionId);
      assignmentBySession.set(
        sessionId,
        (assignmentBySession.get(sessionId) ?? 0) + 1,
      );
    }

    return courses.map((course) => {
      const courseId = num(course.id);
      const courseSessions = sessions.filter(
        (session) =>
          num(session.courseId) === courseId && session.status !== 'cancelled',
      );
      const assignmentCount = courseSessions.reduce(
        (total, session) =>
          total + (assignmentBySession.get(num(session.id)) ?? 0),
        0,
      );
      return {
        id: courseId,
        code: text(course.code),
        title: text(course.title),
        description: nullableText(course.description),
        category: text(course.category),
        level: text(course.level),
        status: text(course.status) as TrainingCourseStatus,
        sessionCount: courseSessions.length,
        assignmentCount,
      };
    });
  }

  public async listCategories(): Promise<readonly string[]> {
    const rows = await this.query
      .selectFrom('trainingCourses')
      .select('category')
      .distinct()
      .orderBy('category', 'asc')
      .execute();
    return rows.map((row) => text(row.category));
  }

  public async listMyLearning(
    viewer: TrainingViewer,
  ): Promise<readonly LearningSession[]> {
    const sessions = await this.listSessionsForViewer(viewer);
    if (sessions.length === 0) return [];
    return this.attachLearningProgress(sessions, viewer);
  }

  public async getSessionDetail(
    viewer: TrainingViewer,
    sessionId: number,
  ): Promise<SessionDetail> {
    const session = await this.findSessionSummary(sessionId);
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    const enrolled = await this.isEnrolled(sessionId, viewer.userId);
    if (viewer.isAdmin) {
      // Administrators see every session.
    } else if (viewer.isInstructor) {
      if (session.instructorId !== viewer.userId && !enrolled) {
        throw new TrainingError('NOT_OWNER', '您不是该班次的讲师', 403);
      }
    } else if (!enrolled) {
      throw new TrainingError('NOT_ENROLLED', '您未报名该班次', 403);
    }

    const canSeeAll = viewer.isAdmin || viewer.isInstructor;
    let assignmentQuery = this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where('sessionId', '=', sessionId);
    if (viewer.isStudent && !canSeeAll) {
      assignmentQuery = assignmentQuery.where('status', 'in', [
        'published',
        'closed',
      ]);
    }
    const assignmentRows = await assignmentQuery
      .orderBy('dueAt', 'asc')
      .orderBy('id', 'asc')
      .execute();

    const assignmentIds = assignmentRows.map((row) => num(row.id));
    const submissions = assignmentIds.length
      ? await this.query
          .selectFrom('trainingSubmissions')
          .selectAll()
          .where('assignmentId', 'in', assignmentIds)
          .execute()
      : [];
    const latest = latestSubmissions(submissions);

    const assignments: AssignmentView[] = [];
    for (const row of assignmentRows) {
      const assignmentId = num(row.id);
      const related = [...latest.values()].filter(
        (submission) => num(submission.assignmentId) === assignmentId,
      );
      const mine = submissions
        .filter(
          (submission) =>
            num(submission.assignmentId) === assignmentId &&
            text(submission.studentId) === viewer.userId,
        )
        .sort((a, b) => num(b.attempt) - num(a.attempt))[0];
      assignments.push({
        id: assignmentId,
        sessionId,
        title: text(row.title),
        description: nullableText(row.description),
        dueAt: iso(row.dueAt),
        maxScore: num(row.maxScore),
        status: text(row.status) as TrainingAssignmentStatus,
        publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
        submissionCount: related.length,
        gradedCount: related.filter((item) => text(item.status) === 'graded')
          .length,
        pendingCount: related.filter(
          (item) => text(item.status) === 'submitted',
        ).length,
        returnedCount: related.filter(
          (item) => text(item.status) === 'returned',
        ).length,
        mySubmission: mine
          ? await this.toSubmissionView(mine, { withReviews: false })
          : null,
      });
    }

    const roster = canSeeAll ? await this.loadRoster(sessionId) : [];

    return { session, assignments, roster };
  }

  public async getAssignmentDetail(
    viewer: TrainingViewer,
    assignmentId: number,
  ): Promise<AssignmentDetail> {
    const assignment = await this.findAssignmentRow(assignmentId);
    if (!assignment) {
      throw new TrainingError('NOT_FOUND', '作业不存在', 404);
    }
    const session = await this.findSessionSummary(num(assignment.sessionId));
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    const canManage =
      viewer.isAdmin ||
      (viewer.isInstructor && session.instructorId === viewer.userId);

    if (!canManage) {
      if (assignment.status === 'draft') {
        throw new TrainingError('NOT_FOUND', '作业不存在', 404);
      }
      const enrolled = await this.isEnrolled(session.id, viewer.userId);
      if (!enrolled) {
        throw new TrainingError('NOT_ENROLLED', '您未报名该班次', 403);
      }
    }

    const submissionRows = await this.query
      .selectFrom('trainingSubmissions')
      .selectAll()
      .where('assignmentId', '=', assignmentId)
      .orderBy('attempt', 'asc')
      .execute();
    const visibleRows = canManage
      ? submissionRows
      : submissionRows.filter(
          (submission) => text(submission.studentId) === viewer.userId,
        );

    const latest = latestSubmissions(submissionRows);
    const related = [...latest.values()].filter(
      (submission) => num(submission.assignmentId) === assignmentId,
    );

    const submissions: SubmissionView[] = [];
    for (const row of visibleRows) {
      submissions.push(await this.toSubmissionView(row, { withReviews: true }));
    }

    const mine = submissionRows
      .filter((submission) => text(submission.studentId) === viewer.userId)
      .sort((a, b) => num(b.attempt) - num(a.attempt))[0];

    return {
      assignment: {
        id: assignmentId,
        sessionId: session.id,
        title: text(assignment.title),
        description: nullableText(assignment.description),
        dueAt: iso(assignment.dueAt),
        maxScore: num(assignment.maxScore),
        status: text(assignment.status) as TrainingAssignmentStatus,
        publishedAt: assignment.publishedAt
          ? iso(assignment.publishedAt)
          : null,
        submissionCount: related.length,
        gradedCount: related.filter((item) => text(item.status) === 'graded')
          .length,
        pendingCount: related.filter(
          (item) => text(item.status) === 'submitted',
        ).length,
        returnedCount: related.filter(
          (item) => text(item.status) === 'returned',
        ).length,
        mySubmission: mine
          ? await this.toSubmissionView(mine, { withReviews: true })
          : null,
      },
      session,
      submissions,
    };
  }

  public async submitAssignment(
    studentId: string,
    assignmentId: number,
    content: string,
  ): Promise<SubmissionView> {
    const trimmed = content?.trim() ?? '';
    if (!trimmed) {
      throw new TrainingError('CONTENT_REQUIRED', '作业内容不能为空');
    }
    const assignment = await this.findAssignmentRow(assignmentId);
    if (!assignment || assignment.status === 'draft') {
      throw new TrainingError('NOT_FOUND', '作业不存在', 404);
    }
    if (assignment.status === 'closed') {
      throw new TrainingError('ASSIGNMENT_CLOSED', '作业已截止，无法提交', 409);
    }
    const sessionId = num(assignment.sessionId);
    if (!(await this.isEnrolled(sessionId, studentId))) {
      throw new TrainingError('NOT_ENROLLED', '您未报名该班次', 403);
    }

    const existing = await this.query
      .selectFrom('trainingSubmissions')
      .selectAll()
      .where('assignmentId', '=', assignmentId)
      .where('studentId', '=', studentId)
      .orderBy('attempt', 'desc')
      .execute();
    const current = existing[0];
    if (current) {
      const status = text(current.status);
      if (status === 'submitted') {
        throw new TrainingError(
          'DUPLICATE_SUBMISSION',
          '已有待批阅的提交，请等待讲师评阅',
          409,
        );
      }
      if (status === 'graded') {
        throw new TrainingError(
          'ALREADY_GRADED',
          '作业已评分，不能重复提交',
          409,
        );
      }
    }

    const now = new Date();
    const isLate = now.getTime() > asDate(assignment.dueAt).getTime();
    const attempt = current ? num(current.attempt) + 1 : 1;
    await this.query
      .insertInto('trainingSubmissions')
      .values({
        assignmentId,
        studentId,
        attempt,
        content: trimmed,
        status: 'submitted',
        isLate,
        submittedAt: now,
        score: null,
        feedback: null,
        reviewedById: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const created = await this.query
      .selectFrom('trainingSubmissions')
      .selectAll()
      .where('assignmentId', '=', assignmentId)
      .where('studentId', '=', studentId)
      .where('attempt', '=', attempt)
      .executeTakeFirstOrThrow();
    return this.toSubmissionView(created, { withReviews: true });
  }

  public async reviewSubmission(
    viewer: TrainingViewer,
    submissionId: number,
    input: {
      decision: 'graded' | 'returned';
      score?: number | null;
      feedback?: string | null;
    },
  ): Promise<SubmissionView> {
    if (input.decision !== 'graded' && input.decision !== 'returned') {
      throw new TrainingError('INVALID_DECISION', '评阅结论无效');
    }
    const submission = await this.query
      .selectFrom('trainingSubmissions')
      .selectAll()
      .where('id', '=', submissionId)
      .executeTakeFirst();
    if (!submission) {
      throw new TrainingError('NOT_FOUND', '提交记录不存在', 404);
    }
    const assignment = await this.findAssignmentRow(
      num(submission.assignmentId),
    );
    if (!assignment) {
      throw new TrainingError('NOT_FOUND', '作业不存在', 404);
    }
    const session = await this.findSessionRow(num(assignment.sessionId));
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    if (
      !viewer.isAdmin &&
      !(viewer.isInstructor && text(session.instructorId) === viewer.userId)
    ) {
      throw new TrainingError('NOT_OWNER', '您不是该班次的讲师', 403);
    }
    if (text(submission.status) !== 'submitted') {
      throw new TrainingError(
        'ALREADY_REVIEWED',
        '该提交已评阅，不能重复评阅',
        409,
      );
    }
    const laterAttempt = await this.query
      .selectFrom('trainingSubmissions')
      .select('id')
      .where('assignmentId', '=', num(submission.assignmentId))
      .where('studentId', '=', text(submission.studentId))
      .where('attempt', '>', num(submission.attempt))
      .executeTakeFirst();
    if (laterAttempt) {
      throw new TrainingError(
        'SUPERSEDED_SUBMISSION',
        '存在更新的提交，不能评阅旧版本',
        409,
      );
    }

    const maxScore = num(assignment.maxScore);
    let score: number | null = null;
    if (input.decision === 'graded') {
      const raw = input.score;
      if (
        raw === undefined ||
        raw === null ||
        !Number.isInteger(raw) ||
        raw < 0 ||
        raw > maxScore
      ) {
        throw new TrainingError(
          'INVALID_SCORE',
          `分数必须是 0 到 ${maxScore} 之间的整数`,
        );
      }
      score = raw;
    }
    const feedback = input.feedback?.trim() ?? '';
    if (input.decision === 'returned' && !feedback) {
      throw new TrainingError('FEEDBACK_REQUIRED', '退回重做必须填写评语');
    }

    const now = new Date();
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('trainingSubmissions')
        .set({
          status: input.decision,
          score,
          feedback: feedback || null,
          reviewedById: viewer.userId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where('id', '=', submissionId)
        .execute();
      await connection.query
        .insertInto('trainingSubmissionReviews')
        .values({
          submissionId,
          attempt: num(submission.attempt),
          decision: input.decision,
          score,
          feedback:
            feedback ||
            (input.decision === 'graded' ? '已评分。' : '退回重做。'),
          reviewerId: viewer.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    });

    const updated = await this.query
      .selectFrom('trainingSubmissions')
      .selectAll()
      .where('id', '=', submissionId)
      .executeTakeFirstOrThrow();
    return this.toSubmissionView(updated, { withReviews: true });
  }

  public async listGradingTodo(
    viewer: TrainingViewer,
  ): Promise<readonly GradingTodoItem[]> {
    const rows = await this.query
      .selectFrom('trainingSubmissions')
      .selectAll()
      .where('status', '=', 'submitted')
      .orderBy('submittedAt', 'asc')
      .execute();
    if (rows.length === 0) return [];

    const assignments = await this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where(
        'id',
        'in',
        rows.map((row) => num(row.assignmentId)),
      )
      .execute();
    const sessions = await this.query
      .selectFrom('trainingSessions')
      .selectAll()
      .where(
        'id',
        'in',
        assignments.map((row) => num(row.sessionId)),
      )
      .execute();
    const assignmentById = new Map(
      assignments.map((row) => [num(row.id), row]),
    );
    const sessionById = new Map(sessions.map((row) => [num(row.id), row]));
    const studentNames = await this.loadUserNames(
      rows.map((row) => text(row.studentId)),
    );

    const items: GradingTodoItem[] = [];
    for (const row of rows) {
      const assignment = assignmentById.get(num(row.assignmentId));
      if (!assignment) continue;
      const session = sessionById.get(num(assignment.sessionId));
      if (!session) continue;
      if (
        !viewer.isAdmin &&
        !(viewer.isInstructor && text(session.instructorId) === viewer.userId)
      ) {
        continue;
      }
      items.push({
        submissionId: num(row.id),
        assignmentId: num(row.assignmentId),
        assignmentTitle: text(assignment.title),
        sessionId: num(assignment.sessionId),
        sessionTitle: text(session.title),
        studentId: text(row.studentId),
        studentName:
          studentNames.get(text(row.studentId)) ?? text(row.studentId),
        attempt: num(row.attempt),
        submittedAt: iso(row.submittedAt),
        isLate: bool(row.isLate),
      });
    }
    return items;
  }

  public async completionStats(
    viewer: TrainingViewer,
  ): Promise<readonly CompletionStat[]> {
    const sessions = await this.listSessionsForViewer(viewer);
    if (sessions.length === 0) return [];
    const sessionIds = sessions.map((session) => session.id);

    const enrollments = await this.query
      .selectFrom('trainingEnrollments')
      .select(['id', 'sessionId', 'studentId', 'status'])
      .where('sessionId', 'in', sessionIds)
      .execute();
    const assignments = await this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where('sessionId', 'in', sessionIds)
      .where('status', 'in', ['published', 'closed'])
      .execute();
    const assignmentIds = assignments.map((row) => num(row.id));
    const submissions = assignmentIds.length
      ? await this.query
          .selectFrom('trainingSubmissions')
          .selectAll()
          .where('assignmentId', 'in', assignmentIds)
          .execute()
      : [];
    const latest = latestSubmissions(submissions);

    return sessions.map((session) => {
      const activeStudents = enrollments
        .filter(
          (enrollment) =>
            num(enrollment.sessionId) === session.id &&
            text(enrollment.status) !== 'cancelled',
        )
        .map((enrollment) => text(enrollment.studentId));
      const sessionAssignments = assignments.filter(
        (assignment) => num(assignment.sessionId) === session.id,
      );
      const expected = activeStudents.length * sessionAssignments.length;
      let graded = 0;
      let pending = 0;
      let returned = 0;
      let late = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      for (const assignment of sessionAssignments) {
        for (const studentId of activeStudents) {
          const submission = latest.get(`${num(assignment.id)}:${studentId}`);
          if (!submission) continue;
          const status = text(submission.status);
          if (bool(submission.isLate)) late += 1;
          if (status === 'graded') {
            graded += 1;
            if (submission.score !== null && submission.score !== undefined) {
              scoreSum += num(submission.score);
              scoreCount += 1;
            }
          } else if (status === 'submitted') {
            pending += 1;
          } else if (status === 'returned') {
            returned += 1;
          }
        }
      }
      const notSubmitted = Math.max(expected - graded - pending - returned, 0);
      return {
        sessionId: session.id,
        sessionTitle: session.title,
        courseTitle: session.courseTitle,
        instructorName: session.instructorName,
        status: session.status,
        expected,
        graded,
        pending,
        returned,
        notSubmitted,
        late,
        completionRate: expected === 0 ? 0 : graded / expected,
        averageScore: scoreCount === 0 ? null : scoreSum / scoreCount,
      };
    });
  }

  public async listUsersByRole(
    role: string,
  ): Promise<readonly TrainingUserOption[]> {
    const assignments = await this.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectId'])
      .where('permissionSetKey', '=', role)
      .where('subjectType', '=', 'user')
      .execute();
    const ids = assignments.map((row) => text(row.subjectId));
    if (ids.length === 0) return [];
    const users = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('id', 'in', ids)
      .execute();
    return users
      .filter((user) => user.id)
      .map((user) => ({
        id: text(user.id),
        name: text(user.name),
        username: nullableText(user.username) ?? '',
        email: text(user.email),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  public async createCourse(input: {
    code: string;
    title: string;
    description?: string | null;
    category: string;
    level: string;
    status?: string;
  }): Promise<CourseSummary> {
    const code = input.code?.trim();
    const title = input.title?.trim();
    if (!code || !title) {
      throw new TrainingError('VALIDATION', '课程编码和名称不能为空');
    }
    const status = normalizeStatus(input.status, COURSE_STATUSES, 'draft');
    const existing = await this.query
      .selectFrom('trainingCourses')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) {
      throw new TrainingError('DUPLICATE_CODE', '课程编码已存在', 409);
    }
    const now = new Date();
    await this.query
      .insertInto('trainingCourses')
      .values({
        code,
        title,
        description: input.description?.trim() || null,
        category: input.category?.trim() || '未分类',
        level: input.level?.trim() || '入门',
        status,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.query
      .selectFrom('trainingCourses')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow();
    return {
      id: num(created.id),
      code: text(created.code),
      title: text(created.title),
      description: nullableText(created.description),
      category: text(created.category),
      level: text(created.level),
      status: text(created.status) as TrainingCourseStatus,
      sessionCount: 0,
      assignmentCount: 0,
    };
  }

  public async updateCourse(
    courseId: number,
    input: {
      title?: string;
      description?: string | null;
      category?: string;
      level?: string;
      status?: string;
    },
  ): Promise<CourseSummary> {
    const course = await this.query
      .selectFrom('trainingCourses')
      .selectAll()
      .where('id', '=', courseId)
      .executeTakeFirst();
    if (!course) {
      throw new TrainingError('NOT_FOUND', '课程不存在', 404);
    }
    const status =
      input.status === undefined
        ? text(course.status)
        : normalizeStatus(input.status, COURSE_STATUSES, text(course.status));
    await this.query
      .updateTable('trainingCourses')
      .set({
        title: input.title?.trim() || text(course.title),
        description:
          input.description === undefined
            ? nullableText(course.description)
            : input.description?.trim() || null,
        category: input.category?.trim() || text(course.category),
        level: input.level?.trim() || text(course.level),
        status,
        updatedAt: new Date(),
      })
      .where('id', '=', courseId)
      .execute();
    const updated = await this.query
      .selectFrom('trainingCourses')
      .selectAll()
      .where('id', '=', courseId)
      .executeTakeFirstOrThrow();
    return {
      id: num(updated.id),
      code: text(updated.code),
      title: text(updated.title),
      description: nullableText(updated.description),
      category: text(updated.category),
      level: text(updated.level),
      status: text(updated.status) as TrainingCourseStatus,
      sessionCount: 0,
      assignmentCount: 0,
    };
  }

  public async createSession(input: {
    code: string;
    courseId: number;
    title: string;
    instructorId: string;
    startAt: string;
    endAt: string;
    capacity?: number;
    location?: string | null;
    status?: string;
  }): Promise<SessionSummary> {
    const code = input.code?.trim();
    const title = input.title?.trim();
    if (!code || !title) {
      throw new TrainingError('VALIDATION', '班次编码和名称不能为空');
    }
    const course = await this.query
      .selectFrom('trainingCourses')
      .select('id')
      .where('id', '=', input.courseId)
      .executeTakeFirst();
    if (!course) {
      throw new TrainingError('NOT_FOUND', '课程不存在', 404);
    }
    const instructor = await this.query
      .selectFrom('user')
      .select('id')
      .where('id', '=', input.instructorId)
      .executeTakeFirst();
    if (!instructor) {
      throw new TrainingError('NOT_FOUND', '讲师不存在', 404);
    }
    const startAt = asDate(input.startAt);
    const endAt = asDate(input.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new TrainingError('VALIDATION', '开课时间无效');
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new TrainingError('VALIDATION', '结课时间必须晚于开课时间');
    }
    const existing = await this.query
      .selectFrom('trainingSessions')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) {
      throw new TrainingError('DUPLICATE_CODE', '班次编码已存在', 409);
    }
    const now = new Date();
    await this.query
      .insertInto('trainingSessions')
      .values({
        code,
        courseId: input.courseId,
        title,
        instructorId: input.instructorId,
        startAt,
        endAt,
        capacity: normalizeCapacity(input.capacity),
        location: input.location?.trim() || null,
        status: normalizeStatus(input.status, SESSION_STATUSES, 'planned'),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.findSessionSummaryByCode(code);
    if (!created) throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    return created;
  }

  public async updateSession(
    sessionId: number,
    input: {
      title?: string;
      instructorId?: string;
      startAt?: string;
      endAt?: string;
      capacity?: number;
      location?: string | null;
      status?: string;
    },
  ): Promise<SessionSummary> {
    const session = await this.query
      .selectFrom('trainingSessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    const startAt = input.startAt
      ? asDate(input.startAt)
      : asDate(session.startAt);
    const endAt = input.endAt ? asDate(input.endAt) : asDate(session.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new TrainingError('VALIDATION', '开课时间无效');
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new TrainingError('VALIDATION', '结课时间必须晚于开课时间');
    }
    await this.query
      .updateTable('trainingSessions')
      .set({
        title: input.title?.trim() || text(session.title),
        instructorId: input.instructorId || text(session.instructorId),
        startAt,
        endAt,
        capacity:
          input.capacity === undefined
            ? num(session.capacity)
            : normalizeCapacity(input.capacity),
        location:
          input.location === undefined
            ? nullableText(session.location)
            : input.location?.trim() || null,
        status:
          input.status === undefined
            ? text(session.status)
            : normalizeStatus(
                input.status,
                SESSION_STATUSES,
                text(session.status),
              ),
        updatedAt: new Date(),
      })
      .where('id', '=', sessionId)
      .execute();
    const updated = await this.findSessionSummary(sessionId);
    if (!updated) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    return updated;
  }

  public async enrollStudent(
    sessionId: number,
    studentId: string,
  ): Promise<void> {
    const session = await this.query
      .selectFrom('trainingSessions')
      .select('id')
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    const user = await this.query
      .selectFrom('user')
      .select('id')
      .where('id', '=', studentId)
      .executeTakeFirst();
    if (!user) {
      throw new TrainingError('NOT_FOUND', '学员不存在', 404);
    }
    const existing = await this.query
      .selectFrom('trainingEnrollments')
      .selectAll()
      .where('sessionId', '=', sessionId)
      .where('studentId', '=', studentId)
      .executeTakeFirst();
    const now = new Date();
    if (existing) {
      if (text(existing.status) === 'cancelled') {
        await this.query
          .updateTable('trainingEnrollments')
          .set({ status: 'active', updatedAt: now })
          .where('id', '=', num(existing.id))
          .execute();
      }
      return;
    }
    await this.query
      .insertInto('trainingEnrollments')
      .values({
        sessionId,
        studentId,
        status: 'active',
        enrolledAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  public async unenrollStudent(
    sessionId: number,
    studentId: string,
  ): Promise<void> {
    const existing = await this.query
      .selectFrom('trainingEnrollments')
      .select('id')
      .where('sessionId', '=', sessionId)
      .where('studentId', '=', studentId)
      .executeTakeFirst();
    if (!existing) return;
    await this.query
      .updateTable('trainingEnrollments')
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where('id', '=', num(existing.id))
      .execute();
  }

  public async createAssignment(
    viewer: TrainingViewer,
    input: {
      sessionId: number;
      title: string;
      description?: string | null;
      dueAt: string;
      maxScore?: number;
      status?: string;
    },
  ): Promise<AssignmentView> {
    const session = await this.findSessionRow(input.sessionId);
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    this.assertCanManageSession(viewer, session);
    const title = input.title?.trim();
    if (!title) {
      throw new TrainingError('VALIDATION', '作业标题不能为空');
    }
    const dueAt = asDate(input.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      throw new TrainingError('VALIDATION', '截止时间无效');
    }
    const status = normalizeStatus(input.status, ASSIGNMENT_STATUSES, 'draft');
    const now = new Date();
    await this.query
      .insertInto('trainingAssignments')
      .values({
        sessionId: input.sessionId,
        title,
        description: input.description?.trim() || null,
        dueAt,
        maxScore: normalizeMaxScore(input.maxScore),
        status,
        publishedAt: status === 'draft' ? null : now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where('sessionId', '=', input.sessionId)
      .where('title', '=', title)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    return this.toAssignmentView(created, null);
  }

  public async updateAssignment(
    viewer: TrainingViewer,
    assignmentId: number,
    input: {
      title?: string;
      description?: string | null;
      dueAt?: string;
      maxScore?: number;
      status?: string;
    },
  ): Promise<AssignmentView> {
    const assignment = await this.findAssignmentRow(assignmentId);
    if (!assignment) {
      throw new TrainingError('NOT_FOUND', '作业不存在', 404);
    }
    const session = await this.findSessionRow(num(assignment.sessionId));
    if (!session) {
      throw new TrainingError('NOT_FOUND', '班次不存在', 404);
    }
    this.assertCanManageSession(viewer, session);
    const dueAt = input.dueAt ? asDate(input.dueAt) : asDate(assignment.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      throw new TrainingError('VALIDATION', '截止时间无效');
    }
    const nextStatus =
      input.status === undefined
        ? text(assignment.status)
        : normalizeStatus(
            input.status,
            ASSIGNMENT_STATUSES,
            text(assignment.status),
          );
    const publishedAt =
      nextStatus === 'draft' ? null : (assignment.publishedAt ?? new Date());
    await this.query
      .updateTable('trainingAssignments')
      .set({
        title: input.title?.trim() || text(assignment.title),
        description:
          input.description === undefined
            ? nullableText(assignment.description)
            : input.description?.trim() || null,
        dueAt,
        maxScore:
          input.maxScore === undefined
            ? num(assignment.maxScore)
            : normalizeMaxScore(input.maxScore),
        status: nextStatus,
        publishedAt,
        updatedAt: new Date(),
      })
      .where('id', '=', assignmentId)
      .execute();
    const updated = await this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where('id', '=', assignmentId)
      .executeTakeFirstOrThrow();
    return this.toAssignmentView(updated, null);
  }

  private assertCanManageSession(
    viewer: TrainingViewer,
    session: Record<string, unknown>,
  ): void {
    const owns = text(session.instructorId) === viewer.userId;
    if (!viewer.isAdmin && !(viewer.isInstructor && owns)) {
      throw new TrainingError('NOT_OWNER', '您不是该班次的讲师', 403);
    }
  }

  private async listSessionsForViewer(
    viewer: TrainingViewer,
  ): Promise<readonly SessionSummary[]> {
    if (!viewer.isAdmin && !viewer.isInstructor && !viewer.isStudent) {
      return [];
    }
    let query = this.query.selectFrom('trainingSessions').selectAll();
    if (viewer.isStudent && !viewer.isAdmin && !viewer.isInstructor) {
      const enrollments = await this.query
        .selectFrom('trainingEnrollments')
        .select('sessionId')
        .where('studentId', '=', viewer.userId)
        .where('status', '!=', 'cancelled')
        .execute();
      const ids = enrollments.map((row) => num(row.sessionId));
      if (ids.length === 0) return [];
      query = query.where('id', 'in', ids);
    } else if (viewer.isInstructor && !viewer.isAdmin) {
      query = query.where('instructorId', '=', viewer.userId);
    }
    const rows = await query.orderBy('startAt', 'desc').execute();
    const summaries: SessionSummary[] = [];
    for (const row of rows) {
      const summary = await this.sessionSummaryFromRow(row);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  private async attachLearningProgress(
    sessions: readonly SessionSummary[],
    viewer: TrainingViewer,
  ): Promise<readonly LearningSession[]> {
    const sessionIds = sessions.map((session) => session.id);
    const assignments = await this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where('sessionId', 'in', sessionIds)
      .where('status', 'in', ['published', 'closed'])
      .execute();
    const assignmentIds = assignments.map((row) => num(row.id));
    const submissions = assignmentIds.length
      ? await this.query
          .selectFrom('trainingSubmissions')
          .selectAll()
          .where('assignmentId', 'in', assignmentIds)
          .execute()
      : [];
    const latest = latestSubmissions(submissions);

    return sessions.map((session) => {
      const sessionAssignments = assignments.filter(
        (assignment) => num(assignment.sessionId) === session.id,
      );
      let submitted = 0;
      let graded = 0;
      let returned = 0;
      const dueDates: number[] = [];
      for (const assignment of sessionAssignments) {
        dueDates.push(asDate(assignment.dueAt).getTime());
        const submission = latest.get(`${num(assignment.id)}:${viewer.userId}`);
        if (!submission) continue;
        const status = text(submission.status);
        if (status === 'submitted') submitted += 1;
        else if (status === 'graded') graded += 1;
        else if (status === 'returned') returned += 1;
      }
      const now = Date.now();
      const upcoming = dueDates.filter((time) => time >= now).sort();
      return {
        ...session,
        assignmentCount: sessionAssignments.length,
        submittedCount: submitted,
        gradedCount: graded,
        returnedCount: returned,
        nextDueAt: upcoming.length ? new Date(upcoming[0]).toISOString() : null,
      };
    });
  }

  private async findSessionSummary(
    sessionId: number,
  ): Promise<SessionSummary | undefined> {
    const row = await this.findSessionRow(sessionId);
    return row ? this.sessionSummaryFromRow(row) : undefined;
  }

  private async findSessionSummaryByCode(
    code: string,
  ): Promise<SessionSummary | undefined> {
    const row = await this.query
      .selectFrom('trainingSessions')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
    return row ? this.sessionSummaryFromRow(row) : undefined;
  }

  private async findSessionRow(
    sessionId: number,
  ): Promise<Record<string, unknown> | undefined> {
    return this.query
      .selectFrom('trainingSessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();
  }

  private async findAssignmentRow(
    assignmentId: number,
  ): Promise<Record<string, unknown> | undefined> {
    return this.query
      .selectFrom('trainingAssignments')
      .selectAll()
      .where('id', '=', assignmentId)
      .executeTakeFirst();
  }

  private async sessionSummaryFromRow(
    row: Record<string, unknown>,
  ): Promise<SessionSummary | undefined> {
    const courseRows = await this.query
      .selectFrom('trainingCourses')
      .select(['code', 'title'])
      .where('id', '=', num(row.courseId))
      .executeTakeFirst();
    const names = await this.loadUserNames([text(row.instructorId)]);
    const enrolled = await this.query
      .selectFrom('trainingEnrollments')
      .select(({ fn }) => [fn.countAll().as('count')])
      .where('sessionId', '=', num(row.id))
      .where('status', '!=', 'cancelled')
      .execute();
    return {
      id: num(row.id),
      code: text(row.code),
      title: text(row.title),
      courseId: num(row.courseId),
      courseCode: courseRows ? text(courseRows.code) : '',
      courseTitle: courseRows ? text(courseRows.title) : '',
      instructorId: text(row.instructorId),
      instructorName:
        names.get(text(row.instructorId)) ?? text(row.instructorId),
      startAt: iso(row.startAt),
      endAt: iso(row.endAt),
      capacity: num(row.capacity),
      location: nullableText(row.location),
      status: text(row.status) as TrainingSessionStatus,
      enrolledCount: Number(enrolled[0]?.count ?? 0),
    };
  }

  private async loadRoster(
    sessionId: number,
  ): Promise<readonly { studentId: string; studentName: string }[]> {
    const rows = await this.query
      .selectFrom('trainingEnrollments')
      .select(['studentId'])
      .where('sessionId', '=', sessionId)
      .where('status', '!=', 'cancelled')
      .orderBy('studentId', 'asc')
      .execute();
    const names = await this.loadUserNames(
      rows.map((row) => text(row.studentId)),
    );
    return rows.map((row) => ({
      studentId: text(row.studentId),
      studentName: names.get(text(row.studentId)) ?? text(row.studentId),
    }));
  }

  private async loadUserNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [text(row.id), text(row.name)]));
  }

  private async isEnrolled(
    sessionId: number,
    studentId: string,
  ): Promise<boolean> {
    const row = await this.query
      .selectFrom('trainingEnrollments')
      .select('id')
      .where('sessionId', '=', sessionId)
      .where('studentId', '=', studentId)
      .where('status', '!=', 'cancelled')
      .executeTakeFirst();
    return Boolean(row);
  }

  private async toSubmissionView(
    row: Record<string, unknown>,
    options: { withReviews: boolean },
  ): Promise<SubmissionView> {
    const names = await this.loadUserNames([
      text(row.studentId),
      row.reviewedById ? text(row.reviewedById) : '',
    ]);
    let reviews: SubmissionReviewView[] = [];
    if (options.withReviews) {
      const reviewRows = await this.query
        .selectFrom('trainingSubmissionReviews')
        .selectAll()
        .where('submissionId', '=', num(row.id))
        .orderBy('attempt', 'asc')
        .execute();
      const reviewerNames = await this.loadUserNames(
        reviewRows.map((review) => text(review.reviewerId)),
      );
      reviews = reviewRows.map((review) => ({
        id: num(review.id),
        attempt: num(review.attempt),
        decision: text(review.decision) as 'graded' | 'returned',
        score: review.score === null ? null : num(review.score),
        feedback: text(review.feedback),
        reviewerId: text(review.reviewerId),
        reviewerName:
          reviewerNames.get(text(review.reviewerId)) ?? text(review.reviewerId),
        createdAt: iso(review.createdAt),
      }));
    }
    const assignment = await this.query
      .selectFrom('trainingAssignments')
      .select('maxScore')
      .where('id', '=', num(row.assignmentId))
      .executeTakeFirst();
    return {
      id: num(row.id),
      assignmentId: num(row.assignmentId),
      studentId: text(row.studentId),
      studentName: names.get(text(row.studentId)) ?? text(row.studentId),
      attempt: num(row.attempt),
      content: text(row.content),
      status: text(row.status) as 'submitted' | 'graded' | 'returned',
      isLate: bool(row.isLate),
      submittedAt: iso(row.submittedAt),
      score: row.score === null ? null : num(row.score),
      feedback: nullableText(row.feedback),
      maxScore: assignment ? num(assignment.maxScore) : 100,
      reviewedById: row.reviewedById ? text(row.reviewedById) : null,
      reviewedAt: row.reviewedAt ? iso(row.reviewedAt) : null,
      reviews,
    };
  }

  private async toAssignmentView(
    row: Record<string, unknown>,
    mySubmission: SubmissionView | null,
  ): Promise<AssignmentView> {
    return {
      id: num(row.id),
      sessionId: num(row.sessionId),
      title: text(row.title),
      description: nullableText(row.description),
      dueAt: iso(row.dueAt),
      maxScore: num(row.maxScore),
      status: text(row.status) as TrainingAssignmentStatus,
      publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
      submissionCount: 0,
      gradedCount: 0,
      pendingCount: 0,
      returnedCount: 0,
      mySubmission,
    };
  }
}

function latestSubmissions(
  rows: readonly Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = `${num(row.assignmentId)}:${text(row.studentId)}`;
    const current = latest.get(key);
    if (!current || num(row.attempt) > num(current.attempt)) {
      latest.set(key, row);
    }
  }
  return latest;
}

function normalizeStatus<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: string,
): string {
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) {
    throw new TrainingError(
      'VALIDATION',
      `状态必须是 ${allowed.join(' / ')} 之一`,
    );
  }
  return value;
}

function normalizeCapacity(value: number | undefined): number {
  if (value === undefined) return 30;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TrainingError('VALIDATION', '人数上限必须是正整数');
  }
  return value;
}

function normalizeMaxScore(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TrainingError('VALIDATION', '满分必须是正整数');
  }
  return value;
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function iso(value: unknown): string {
  return asDate(value).toISOString();
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const converted = text(value);
  return converted === '' ? null : converted;
}
