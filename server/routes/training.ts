import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  TRAINING_ADMIN_ROLE,
  TRAINING_INSTRUCTOR_ROLE,
  TRAINING_STUDENT_ROLE,
  TrainingError,
  trainingServiceToken,
  type TrainingService,
  type TrainingViewer,
} from '../providers/index.js';

/** The application's built-in super-administrator permission set. */
const SYSTEM_ADMINISTRATOR_ROLE = 'system-administrator';

/**
 * Training API.
 *
 * Authentication and authorization are owned here: the sub-router installs
 * `auth.required()` on every one of its paths, and each handler checks the
 * caller's application role before reaching the service. A student's rows are
 * scoped inside the service queries rather than filtered in memory here.
 */
export const trainingRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const training =
      app.container.resolve<TrainingService>(trainingServiceToken);

    const routes = new Hono<AuthEnv>();
    routes.use('*', auth.required());

    const viewerFor = async (context: Context<AuthEnv>) => {
      const session = context.get('auth');
      if (!session) {
        throw new TrainingError('UNAUTHORIZED', '请先登录', 403);
      }
      return resolveViewer(authorization, session.user.id);
    };

    const requireAdmin = (viewer: TrainingViewer) => {
      if (!viewer.isAdmin) {
        throw new TrainingError('FORBIDDEN', '仅管理员可执行该操作', 403);
      }
    };

    const requireInstructor = (viewer: TrainingViewer) => {
      if (!viewer.isInstructor) {
        throw new TrainingError('FORBIDDEN', '仅讲师或管理员可执行该操作', 403);
      }
    };

    const requireStudent = (viewer: TrainingViewer) => {
      if (!viewer.isStudent) {
        throw new TrainingError('FORBIDDEN', '仅学员可执行该操作', 403);
      }
    };

    routes.get('/me', (context) =>
      handle(context, async () => {
        const session = context.get('auth');
        const viewer = await viewerFor(context);
        return context.json({
          data: {
            ...viewer,
            name: session?.user.name ?? '',
            email: session?.user.email ?? '',
          },
        });
      }),
    );

    routes.get('/catalog', (context) =>
      handle(context, async () => {
        await viewerFor(context);
        const data = await training.listCatalog({
          search: context.req.query('search'),
          category: context.req.query('category'),
        });
        return context.json({ data });
      }),
    );

    routes.get('/categories', (context) =>
      handle(context, async () => {
        await viewerFor(context);
        return context.json({ data: await training.listCategories() });
      }),
    );

    routes.get('/my-learning', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        return context.json({ data: await training.listMyLearning(viewer) });
      }),
    );

    routes.get('/grading-todo', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireInstructor(viewer);
        return context.json({ data: await training.listGradingTodo(viewer) });
      }),
    );

    routes.get('/stats/completion', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireInstructor(viewer);
        return context.json({ data: await training.completionStats(viewer) });
      }),
    );

    routes.get('/users', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const role = context.req.query('role');
        if (
          role !== TRAINING_INSTRUCTOR_ROLE &&
          role !== TRAINING_STUDENT_ROLE
        ) {
          throw new TrainingError('VALIDATION', 'role 参数无效');
        }
        return context.json({ data: await training.listUsersByRole(role) });
      }),
    );

    routes.get('/sessions/:sessionId', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        const sessionId = numericParam(context, 'sessionId');
        return context.json({
          data: await training.getSessionDetail(viewer, sessionId),
        });
      }),
    );

    routes.get('/assignments/:assignmentId', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        const assignmentId = numericParam(context, 'assignmentId');
        return context.json({
          data: await training.getAssignmentDetail(viewer, assignmentId),
        });
      }),
    );

    routes.post('/assignments/:assignmentId/submissions', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireStudent(viewer);
        const assignmentId = numericParam(context, 'assignmentId');
        const body = await readJson(context);
        const content = typeof body.content === 'string' ? body.content : '';
        const data = await training.submitAssignment(
          viewer.userId,
          assignmentId,
          content,
        );
        return context.json({ data }, 201);
      }),
    );

    routes.post('/submissions/:submissionId/review', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireInstructor(viewer);
        const submissionId = numericParam(context, 'submissionId');
        const body = await readJson(context);
        const decision = body.decision;
        if (decision !== 'graded' && decision !== 'returned') {
          throw new TrainingError('INVALID_DECISION', '评阅结论无效');
        }
        const score =
          typeof body.score === 'number'
            ? body.score
            : body.score === null || body.score === undefined
              ? null
              : Number(body.score);
        const feedback =
          typeof body.feedback === 'string' ? body.feedback : null;
        const data = await training.reviewSubmission(viewer, submissionId, {
          decision,
          score,
          feedback,
        });
        return context.json({ data });
      }),
    );

    routes.get('/courses', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const data = await training.listCatalog({
          search: context.req.query('search'),
          category: context.req.query('category'),
          includeUnpublished: true,
        });
        return context.json({ data });
      }),
    );

    routes.post('/courses', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const body = await readJson(context);
        const data = await training.createCourse({
          code: stringField(body, 'code'),
          title: stringField(body, 'title'),
          description: optionalString(body.description),
          category: optionalString(body.category) ?? '未分类',
          level: optionalString(body.level) ?? '入门',
          status: optionalString(body.status) ?? undefined,
        });
        return context.json({ data }, 201);
      }),
    );

    routes.patch('/courses/:courseId', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const courseId = numericParam(context, 'courseId');
        const body = await readJson(context);
        const data = await training.updateCourse(courseId, {
          title: optionalString(body.title) ?? undefined,
          description:
            body.description === undefined
              ? undefined
              : optionalString(body.description),
          category: optionalString(body.category) ?? undefined,
          level: optionalString(body.level) ?? undefined,
          status: optionalString(body.status) ?? undefined,
        });
        return context.json({ data });
      }),
    );

    routes.post('/sessions', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const body = await readJson(context);
        const data = await training.createSession({
          code: stringField(body, 'code'),
          courseId: numericField(body, 'courseId'),
          title: stringField(body, 'title'),
          instructorId: stringField(body, 'instructorId'),
          startAt: stringField(body, 'startAt'),
          endAt: stringField(body, 'endAt'),
          capacity: optionalNumber(body.capacity),
          location: optionalString(body.location),
          status: optionalString(body.status) ?? undefined,
        });
        return context.json({ data }, 201);
      }),
    );

    routes.patch('/sessions/:sessionId', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const sessionId = numericParam(context, 'sessionId');
        const body = await readJson(context);
        const data = await training.updateSession(sessionId, {
          title: optionalString(body.title) ?? undefined,
          instructorId: optionalString(body.instructorId) ?? undefined,
          startAt: optionalString(body.startAt) ?? undefined,
          endAt: optionalString(body.endAt) ?? undefined,
          capacity: optionalNumber(body.capacity),
          location:
            body.location === undefined
              ? undefined
              : optionalString(body.location),
          status: optionalString(body.status) ?? undefined,
        });
        return context.json({ data });
      }),
    );

    routes.post('/sessions/:sessionId/enrollments', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const sessionId = numericParam(context, 'sessionId');
        const body = await readJson(context);
        const studentId = stringField(body, 'studentId');
        await training.enrollStudent(sessionId, studentId);
        return context.json({ data: { sessionId, studentId } }, 201);
      }),
    );

    routes.delete('/sessions/:sessionId/enrollments/:studentId', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireAdmin(viewer);
        const sessionId = numericParam(context, 'sessionId');
        const studentId = context.req.param('studentId');
        await training.unenrollStudent(sessionId, studentId);
        return context.json({ data: { sessionId, studentId } });
      }),
    );

    routes.post('/assignments', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireInstructor(viewer);
        const body = await readJson(context);
        const data = await training.createAssignment(viewer, {
          sessionId: numericField(body, 'sessionId'),
          title: stringField(body, 'title'),
          description: optionalString(body.description),
          dueAt: stringField(body, 'dueAt'),
          maxScore: optionalNumber(body.maxScore),
          status: optionalString(body.status) ?? undefined,
        });
        return context.json({ data }, 201);
      }),
    );

    routes.patch('/assignments/:assignmentId', (context) =>
      handle(context, async () => {
        const viewer = await viewerFor(context);
        requireInstructor(viewer);
        const assignmentId = numericParam(context, 'assignmentId');
        const body = await readJson(context);
        const data = await training.updateAssignment(viewer, assignmentId, {
          title: optionalString(body.title) ?? undefined,
          description:
            body.description === undefined
              ? undefined
              : optionalString(body.description),
          dueAt: optionalString(body.dueAt) ?? undefined,
          maxScore: optionalNumber(body.maxScore),
          status: optionalString(body.status) ?? undefined,
        });
        return context.json({ data });
      }),
    );

    router.route('/training', routes);
    return router;
  });

async function handle(
  context: Context<AuthEnv>,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof TrainingError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    throw error;
  }
}

async function resolveViewer(
  authorization: AppAuthorization,
  userId: string,
): Promise<TrainingViewer> {
  const assignments = await authorization.permissionSets.listAssignments();
  const roles = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === userId,
      )
      .map((assignment) => assignment.permissionSet),
  );
  // The built-in system administrator already administers every application
  // capability, so it is treated as the training administrator here. Without
  // this the maintainer account can sign in but sees only denial pages.
  const isAdmin =
    roles.has(TRAINING_ADMIN_ROLE) || roles.has(SYSTEM_ADMINISTRATOR_ROLE);
  return {
    userId,
    isAdmin,
    isInstructor: isAdmin || roles.has(TRAINING_INSTRUCTOR_ROLE),
    isStudent: roles.has(TRAINING_STUDENT_ROLE),
  };
}

function numericParam(context: Context<AuthEnv>, name: string): number {
  const value = Number(context.req.param(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new TrainingError('VALIDATION', `${name} 无效`);
  }
  return value;
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new TrainingError('VALIDATION', '请求内容无效');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof TrainingError) throw error;
    throw new TrainingError('VALIDATION', '请求内容不是合法 JSON');
  }
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new TrainingError('VALIDATION', `${name} 不能为空`);
  }
  return value;
}

function numericField(body: Record<string, unknown>, name: string): number {
  const value = Number(body[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new TrainingError('VALIDATION', `${name} 无效`);
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TrainingError('VALIDATION', '数值无效');
  }
  return parsed;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new TrainingError('VALIDATION', '文本字段无效');
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
