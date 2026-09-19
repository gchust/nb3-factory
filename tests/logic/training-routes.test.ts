import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TRAINING_ADMIN_ROLE,
  TRAINING_INSTRUCTOR_ROLE,
  TRAINING_LEARNER_ROLE,
  TRAINING_STUDENT_ROLE,
  TrainingError,
  trainingServiceToken,
} from '../../server/providers/training.js';
import { trainingRoutes } from '../../server/routes/training.js';

const ROLE_ASSIGNMENTS = [
  {
    id: 'a1',
    subject: { type: 'user', id: 'admin-user' },
    permissionSet: TRAINING_ADMIN_ROLE,
  },
  {
    id: 'a2',
    subject: { type: 'user', id: 'instructor-user' },
    permissionSet: TRAINING_INSTRUCTOR_ROLE,
  },
  {
    id: 'a3',
    subject: { type: 'user', id: 'student-user' },
    permissionSet: TRAINING_STUDENT_ROLE,
  },
  {
    id: 'a4',
    subject: { type: 'user', id: 'system-admin-user' },
    permissionSet: 'system-administrator',
  },
  {
    id: 'a5',
    subject: { type: 'authenticated', id: '*' },
    permissionSet: TRAINING_LEARNER_ROLE,
  },
];

function createRouter(service: Record<string, unknown>) {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required:
      () =>
      async (
        context: {
          req: { header: (name: string) => string | undefined };
          json: (body: unknown, status?: number) => Response;
          set: (key: string, value: unknown) => void;
        },
        next: () => Promise<void>,
      ) => {
        const userId = context.req.header('x-test-user');
        if (!userId) {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        context.set('auth', {
          user: { id: userId, name: userId, email: `${userId}@example.com` },
          session: { id: 'session-1' },
        });
        await next();
        return undefined;
      },
  } as never);
  container.instance(authorizationToken, {
    permissionSets: {
      listAssignments: async () => ROLE_ASSIGNMENTS,
    },
  } as never);
  container.instance(trainingServiceToken, service as never);
  return trainingRoutes.createRouter({ container } as unknown as Application);
}

function headers(userId?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(userId ? { 'x-test-user': userId } : {}),
  };
}

describe('training routes', () => {
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    service = {
      listCatalog: vi.fn(async () => []),
      listCategories: vi.fn(async () => []),
      listMyLearning: vi.fn(async () => []),
      getSessionDetail: vi.fn(async () => ({})),
      getAssignmentDetail: vi.fn(async () => ({})),
      submitAssignment: vi.fn(async () => ({ id: 1 })),
      reviewSubmission: vi.fn(async () => ({ id: 1 })),
      listGradingTodo: vi.fn(async () => []),
      completionStats: vi.fn(async () => []),
      listUsersByRole: vi.fn(async () => []),
      createCourse: vi.fn(async () => ({ id: 1 })),
      updateCourse: vi.fn(async () => ({ id: 1 })),
      createSession: vi.fn(async () => ({ id: 1 })),
      updateSession: vi.fn(async () => ({ id: 1 })),
      enrollStudent: vi.fn(async () => undefined),
      unenrollStudent: vi.fn(async () => undefined),
      createAssignment: vi.fn(async () => ({ id: 1 })),
      updateAssignment: vi.fn(async () => ({ id: 1 })),
      addSessionMaterials: vi.fn(async () => []),
      removeSessionMaterial: vi.fn(async () => undefined),
      canAccessFile: vi.fn(async () => true),
    };
  });

  it('rejects anonymous requests with 401', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/me', {
      headers: headers(),
    });
    expect(response.status).toBe(401);
  });

  it('reports the caller roles from the permission set assignments', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/me', {
      headers: headers('student-user'),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { userId: string; isStudent: boolean; isAdmin: boolean };
    };
    expect(body.data).toMatchObject({
      userId: 'student-user',
      isStudent: true,
      isAdmin: false,
    });
  });

  it('treats a self-registered user with only the audience default as a student', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/me', {
      headers: headers('self-registered-user'),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        userId: string;
        isStudent: boolean;
        isAdmin: boolean;
        isInstructor: boolean;
      };
    };
    expect(body.data).toMatchObject({
      userId: 'self-registered-user',
      isStudent: true,
      isAdmin: false,
      isInstructor: false,
    });
  });

  it('treats the built-in system administrator as a training administrator', async () => {
    const router = await createRouter(service);
    const me = await router.request('/training/me', {
      headers: headers('system-admin-user'),
    });
    expect(me.status).toBe(200);
    const body = (await me.json()) as {
      data: { isAdmin: boolean; isInstructor: boolean };
    };
    expect(body.data).toMatchObject({ isAdmin: true, isInstructor: true });

    const grading = await router.request('/training/grading-todo', {
      headers: headers('system-admin-user'),
    });
    expect(grading.status).toBe(200);
    expect(service.listGradingTodo).toHaveBeenCalled();
  });

  it('returns 403 when a student tries to review and never calls the service', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/submissions/5/review', {
      method: 'POST',
      headers: headers('student-user'),
      body: JSON.stringify({ decision: 'graded', score: 90 }),
    });
    expect(response.status).toBe(403);
    expect(service.reviewSubmission).not.toHaveBeenCalled();
  });

  it('returns 403 when a student tries to create a course', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/courses', {
      method: 'POST',
      headers: headers('student-user'),
      body: JSON.stringify({
        code: 'X',
        title: 'Y',
        category: 'Z',
        level: 'L',
      }),
    });
    expect(response.status).toBe(403);
    expect(service.createCourse).not.toHaveBeenCalled();
  });

  it('lets an administrator create a course', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/courses', {
      method: 'POST',
      headers: headers('admin-user'),
      body: JSON.stringify({
        code: 'TRN-401',
        title: '新课程',
        category: '通用',
        level: '入门',
        status: 'published',
      }),
    });
    expect(response.status).toBe(201);
    expect(service.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TRN-401', title: '新课程' }),
    );
  });

  it('scopes a submission to the signed-in student', async () => {
    const router = await createRouter(service);
    const response = await router.request(
      '/training/assignments/7/submissions',
      {
        method: 'POST',
        headers: headers('student-user'),
        body: JSON.stringify({ content: '我的答案' }),
      },
    );
    expect(response.status).toBe(201);
    expect(service.submitAssignment).toHaveBeenCalledWith(
      'student-user',
      7,
      '我的答案',
      [],
    );
  });

  it('passes the selected file ids through to the submission', async () => {
    const router = await createRouter(service);
    const response = await router.request(
      '/training/assignments/7/submissions',
      {
        method: 'POST',
        headers: headers('student-user'),
        body: JSON.stringify({
          content: '我的答案',
          fileIds: ['file-a', ' file-b ', ''],
        }),
      },
    );
    expect(response.status).toBe(201);
    expect(service.submitAssignment).toHaveBeenCalledWith(
      'student-user',
      7,
      '我的答案',
      ['file-a', 'file-b'],
    );
  });

  it('lets only an instructor manage lesson materials', async () => {
    const router = await createRouter(service);
    const denied = await router.request('/training/sessions/3/materials', {
      method: 'POST',
      headers: headers('student-user'),
      body: JSON.stringify({ files: [{ fileId: 'file-a' }] }),
    });
    expect(denied.status).toBe(403);
    expect(service.addSessionMaterials).not.toHaveBeenCalled();

    const allowed = await router.request('/training/sessions/3/materials', {
      method: 'POST',
      headers: headers('instructor-user'),
      body: JSON.stringify({ files: [{ fileId: 'file-a', title: '课件' }] }),
    });
    expect(allowed.status).toBe(201);
    expect(service.addSessionMaterials).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'instructor-user' }),
      3,
      [{ fileId: 'file-a', title: '课件' }],
    );
  });

  it('rejects a material request with no usable file id', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/sessions/3/materials', {
      method: 'POST',
      headers: headers('instructor-user'),
      body: JSON.stringify({ files: [{ title: '缺少文件' }] }),
    });
    expect(response.status).toBe(400);
    expect(service.addSessionMaterials).not.toHaveBeenCalled();
  });

  it('removes a material for the owning instructor', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/materials/9', {
      method: 'DELETE',
      headers: headers('instructor-user'),
    });
    expect(response.status).toBe(200);
    expect(service.removeSessionMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'instructor-user' }),
      9,
    );
  });

  it('keeps the review queue for instructors and above', async () => {
    const router = await createRouter(service);
    const denied = await router.request('/training/grading-todo', {
      headers: headers('student-user'),
    });
    expect(denied.status).toBe(403);

    const allowed = await router.request('/training/grading-todo', {
      headers: headers('instructor-user'),
    });
    expect(allowed.status).toBe(200);
    expect(service.listGradingTodo).toHaveBeenCalled();
  });

  it('rejects an unknown role filter', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/users?role=whatever', {
      headers: headers('admin-user'),
    });
    expect(response.status).toBe(400);
    expect(service.listUsersByRole).not.toHaveBeenCalled();
  });

  it('maps a domain error to its status and code', async () => {
    service.getSessionDetail.mockRejectedValueOnce(
      new TrainingError('NOT_ENROLLED', '您未报名该班次', 403),
    );
    const router = await createRouter(service);
    const response = await router.request('/training/sessions/1', {
      headers: headers('student-user'),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('NOT_ENROLLED');
  });

  it('validates the numeric session id', async () => {
    const router = await createRouter(service);
    const response = await router.request('/training/sessions/abc', {
      headers: headers('admin-user'),
    });
    expect(response.status).toBe(400);
  });
});
