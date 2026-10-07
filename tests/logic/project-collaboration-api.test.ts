// @vitest-environment node

import { expect } from 'vitest';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';

import { createStandaloneServer } from '../../server/standalone.ts';

// The authentication provider refuses to start without a session secret; a test run has no config file to read one
// from, so it is supplied the way any other environment variable would be.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

/**
 * The collaboration endpoints as a user meets them.
 *
 * `createAppTest` starts the application the way `pnpm start` does — its own runtime, providers, plugins and
 * migrations — on a test database, and installs its seeds, so the sample project the application ships with is
 * present and owned by the initial administrator. Every request below goes through the real routes, the real session
 * and the real service; nothing is stubbed.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  // Sessions are cookie-authenticated, and the authentication provider refuses a cookie-bearing write whose origin is
  // not the application's own. Pinning the public origin to the origin these tests address lets real writes through
  // exactly as a browser at that origin would.
  server: { env: { APP_PUBLIC_ORIGIN: 'http://localhost' } },
});

/** The colleague the sample seed creates, with a working credential. */
const MEMBER_CREDENTIALS = { username: 'lisi', password: 'admin123' } as const;

interface ProjectView {
  readonly id: string;
  readonly name: string;
  readonly myRole: 'owner' | 'member';
}

interface MemberView {
  readonly userId: string;
  readonly role: 'owner' | 'member';
}

interface MilestoneView {
  readonly id: string;
  readonly status: string;
}

interface TaskView {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly assigneeId: string | null;
}

interface DeliverableView {
  readonly id: string;
  readonly taskId: string;
  readonly status: string;
  readonly rejectReason: string | null;
}

interface ShareView {
  readonly id: string;
  readonly sharedWithId: string;
}

interface ProjectDetailView {
  readonly project: ProjectView;
  readonly members: readonly MemberView[];
  readonly milestones: readonly MilestoneView[];
  readonly tasks: readonly TaskView[];
  readonly deliverables: readonly DeliverableView[];
}

interface DashboardView {
  readonly metrics: {
    readonly projectCount: number;
    readonly openTaskCount: number;
    readonly overdueTaskCount: number;
    readonly pendingAcceptanceCount: number;
  };
  readonly todos: readonly TaskView[];
  readonly projects: readonly {
    readonly id: string;
    readonly overdueTaskCount: number;
    readonly pendingDeliverableCount: number;
  }[];
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function data<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

async function errorReason(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as {
    error?: { reason?: string; status?: string };
  };
  return payload.error?.reason;
}

/**
 * Signs a user in and adds the browser `Origin` header to everything they send.
 *
 * The authentication provider refuses a cookie-authenticated write that names no origin, which is a browser guarantee
 * rather than an API requirement; a `Request` built in a test has to state what a browser would.
 */
async function signInAtOrigin(
  app: Parameters<typeof signIn>[0],
  credentials: Parameters<typeof signIn>[1],
): Promise<TestSession> {
  const session = await signIn(app, credentials);
  return {
    ...session,
    fetch: (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('origin', 'http://localhost');
      return session.fetch(path, { ...init, headers });
    },
  };
}

/**
 * Sends a request to the application root rather than to its `/api` mount, with the session cookie attached.
 *
 * The delivered bytes are a root route (`defineRootRoutes`), deliberately outside `/api`, so the API-scoped
 * `session.fetch` cannot reach it.
 */
function fetchRoot(
  testApp: TestApp,
  session: TestSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', session.cookie);
  headers.set('origin', 'http://localhost');
  return Promise.resolve(
    testApp.fetch(
      new Request(`http://localhost${testApp.publicBasePath}${path}`, {
        ...init,
        headers,
      }),
    ),
  );
}

/** The sample project, as an administrator's session sees it. */
async function sampleProject(admin: TestSession): Promise<ProjectDetailView> {
  const projects = await data<ProjectView[]>(await admin.fetch('/projects'));
  expect(projects.length).toBeGreaterThan(0);
  const first = projects[0]!;
  return data<ProjectDetailView>(await admin.fetch(`/projects/${first.id}`));
}

test('answers an anonymous caller with 401', async ({ request }) => {
  const response = await request('/projects');
  expect(response.status).toBe(401);
  expect(await errorReason(response)).toBe('AUTHENTICATION_REQUIRED');
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(
    document.paths?.['/api/milestones/{milestoneId}/complete']?.post
      ?.operationId,
  ).toBe('completeMilestone');
  expect(document.paths?.['/api/projects']?.post?.operationId).toBe(
    'createProject',
  );
});

test('lists the sample project to its owner and to a member', async ({
  testApp,
}) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);

  const adminProjects = await data<ProjectView[]>(
    await admin.fetch('/projects'),
  );
  const memberProjects = await data<ProjectView[]>(
    await member.fetch('/projects'),
  );

  expect(adminProjects).toHaveLength(memberProjects.length);
  expect(adminProjects[0]?.name).toBe(memberProjects[0]?.name);
  expect(adminProjects[0]?.myRole).toBe('owner');
  expect(memberProjects[0]?.myRole).toBe('member');
});

test("shows the caller's own work on the dashboard", async ({ testApp }) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);

  const adminDashboard = await data<DashboardView>(
    await admin.fetch('/projects/dashboard'),
  );
  const memberDashboard = await data<DashboardView>(
    await member.fetch('/projects/dashboard'),
  );

  expect(adminDashboard.metrics.projectCount).toBe(1);
  // The sample seed leaves one deliverable awaiting acceptance.
  expect(adminDashboard.metrics.pendingAcceptanceCount).toBe(1);
  // The colleague is assigned the open work; the administrator's own completed task is not a to-do.
  expect(memberDashboard.todos.length).toBeGreaterThan(0);
  expect(
    memberDashboard.todos.every((task) => task.status !== 'completed'),
  ).toBe(true);
  expect(
    memberDashboard.projects[0]?.pendingDeliverableCount,
  ).toBeGreaterThanOrEqual(1);
});

test('refuses to complete a milestone whose required tasks are unfinished', async ({
  testApp,
}) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const detail = await sampleProject(admin);
  const milestone = detail.milestones.find(
    (candidate) => candidate.status !== 'completed',
  );
  expect(milestone).toBeDefined();

  const response = await admin.fetch(`/milestones/${milestone!.id}/complete`, {
    method: 'POST',
  });
  expect(response.status).toBe(400);
  expect(await errorReason(response)).toBe('MILESTONE_HAS_UNFINISHED_TASKS');

  // The unfinished task is still unfinished, and so is the milestone.
  const after = await sampleProject(admin);
  expect(
    after.milestones.find((candidate) => candidate.id === milestone!.id)
      ?.status,
  ).not.toBe('completed');
});

test('lets only the owner review a deliverable, and requires a rejection reason', async ({
  testApp,
}) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);
  const detail = await sampleProject(admin);
  const pending = detail.deliverables.find(
    (candidate) => candidate.status === 'pending',
  );
  expect(pending).toBeDefined();

  // The submitter is a member, not the owner, so reviewing is refused.
  const forbidden = await member.fetch(`/deliverables/${pending!.id}/accept`, {
    method: 'POST',
  });
  expect(forbidden.status).toBe(403);
  expect(await errorReason(forbidden)).toBe('PROJECT_OWNER_REQUIRED');

  // A rejection without a reason is refused even for the owner.
  const noReason = await admin.fetch(
    `/deliverables/${pending!.id}/reject`,
    jsonRequest({ reason: '   ' }),
  );
  expect(noReason.status).toBe(400);
  expect(await errorReason(noReason)).toBe('REJECTION_REASON_REQUIRED');

  // With a reason it succeeds, and the task goes back to work.
  const rejected = await admin.fetch(
    `/deliverables/${pending!.id}/reject`,
    jsonRequest({ reason: '缺少错误码说明，请补充后重新提交。' }),
  );
  expect(rejected.status).toBe(200);
  const rejectedBody = await data<DeliverableView>(rejected);
  expect(rejectedBody.status).toBe('rejected');
  expect(rejectedBody.rejectReason).toContain('错误码');

  const after = await sampleProject(admin);
  expect(
    after.tasks.find((task) => task.id === rejectedBody.taskId)?.status,
  ).toBe('in_progress');
});

test('accepts a deliverable the owner approves', async ({ testApp }) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);
  const detail = await sampleProject(admin);
  const task = detail.tasks.find(
    (candidate) => candidate.assigneeId === member.user.id,
  );
  expect(task).toBeDefined();

  const submitted = await member.fetch(
    `/tasks/${task!.id}/deliverables`,
    jsonRequest({ title: '接口文档 v2', description: '已补充错误码。' }),
  );
  expect(submitted.status).toBe(201);
  const deliverable = await data<DeliverableView>(submitted);
  expect(deliverable.status).toBe('pending');

  const accepted = await admin.fetch(`/deliverables/${deliverable.id}/accept`, {
    method: 'POST',
  });
  expect(accepted.status).toBe(200);
  expect((await data<DeliverableView>(accepted)).status).toBe('accepted');

  const after = await sampleProject(admin);
  expect(
    after.tasks.find((candidate) => candidate.id === task!.id)?.status,
  ).toBe('completed');
});

test('shares a deliverable with a colleague and blocks access again on revoke', async ({
  testApp,
}) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);
  const detail = await sampleProject(admin);
  const deliverable = detail.deliverables[0];
  expect(deliverable).toBeDefined();

  const shared = await admin.fetch(
    `/deliverables/${deliverable!.id}/shares`,
    jsonRequest({ userId: member.user.id }),
  );
  expect(shared.status).toBe(201);
  const share = await data<ShareView>(shared);
  expect(share.sharedWithId).toBe(member.user.id);

  // Sharing the same deliverable with the same colleague twice is a conflict, not a duplicate row.
  const duplicate = await admin.fetch(
    `/deliverables/${deliverable!.id}/shares`,
    jsonRequest({ userId: member.user.id }),
  );
  expect(duplicate.status).toBe(409);
  expect(await errorReason(duplicate)).toBe('DELIVERABLE_SHARE_EXISTS');

  const revoked = await admin.fetch(
    `/deliverables/${deliverable!.id}/shares/${share.id}`,
    { method: 'DELETE' },
  );
  expect(revoked.status).toBe(204);

  const after = await sampleProject(admin);
  const remaining = after.deliverables.find(
    (candidate) => candidate.id === deliverable!.id,
  );
  expect(remaining).toBeDefined();
});

test('does not let a non-member tell a project from an unknown one', async ({
  testApp,
}) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  // The administrator owns the sample project but not this one, so the answer is the same permission denial the
  // project's own existence check would give a stranger: an outsider cannot enumerate project ids.
  const response = await admin.fetch(
    '/projects/00000000-0000-4000-8000-0000000000ff',
  );
  expect(response.status).toBe(403);
  expect(await errorReason(response)).toBe('PROJECT_ACCESS_DENIED');
});

test('streams a delivered file to its owner and to a share holder, and refuses a plain member with 403', async ({
  testApp,
}) => {
  const admin = await signInAtOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);
  const detail = await sampleProject(admin);
  // A task assigned to the colleague, so the application's own owner can still submit a deliverable for it.
  const task = detail.tasks.find(
    (candidate) =>
      candidate.assigneeId === member.user.id &&
      candidate.status !== 'completed',
  );
  expect(task).toBeDefined();

  const form = new FormData();
  form.set(
    'file',
    new File(['delivered bytes'], 'notes.txt', { type: 'text/plain' }),
  );
  const upload = await admin.fetch('/deliverableFiles/upload', {
    method: 'POST',
    body: form,
  });
  expect(upload.status).toBe(201);
  const uploaded = await data<{ id: string }>(upload);

  const submitted = await admin.fetch(
    `/tasks/${task!.id}/deliverables`,
    jsonRequest({ title: '接口文档 v3', fileId: uploaded.id }),
  );
  expect(submitted.status).toBe(201);
  const deliverable = await data<DeliverableView>(submitted);

  // The owner may read the bytes.
  const ownerContent = await fetchRoot(
    testApp,
    admin,
    `/deliverables/${deliverable.id}/content`,
  );
  expect(ownerContent.status).toBe(200);
  expect(await ownerContent.text()).toBe('delivered bytes');

  // The colleague is neither the submitter, the owner, nor a share holder. This must be the domain's 403, not the
  // opaque 500 a `ProjectCollaborationError` used to become on this root route.
  const denied = await fetchRoot(
    testApp,
    member,
    `/deliverables/${deliverable.id}/content`,
  );
  expect(denied.status).toBe(403);
  expect(await errorReason(denied)).toBe('DELIVERABLE_CONTENT_DENIED');

  // Sharing the deliverable lifts the denial and the same URL now streams the bytes.
  const shared = await admin.fetch(
    `/deliverables/${deliverable.id}/shares`,
    jsonRequest({ userId: member.user.id }),
  );
  expect(shared.status).toBe(201);

  const allowed = await fetchRoot(
    testApp,
    member,
    `/deliverables/${deliverable.id}/content`,
  );
  expect(allowed.status).toBe(200);
  expect(await allowed.text()).toBe('delivered bytes');
});

test("delivers the overdue reminder into the assignee's in-app inbox", async ({
  testApp,
}) => {
  const member = await signInAtOrigin(testApp, MEMBER_CREDENTIALS);

  // The reminder job fires once when the application starts (its schedule is `immediately` and then daily), and the
  // in-app delivery runs as its own asynchronous task, so wait for the durable state instead of assuming it.
  const reminder = await waitFor(async () => {
    const response = await member.fetch('/notificationInApp/messages');
    if (response.status !== 200) return undefined;
    const items = await data<InAppMessageView[]>(response);
    return items.find((item) => item.title === 'Overdue task');
  });

  expect(reminder).toBeDefined();
  expect(reminder!.body).toContain('完善接口文档');
  expect(reminder!.target?.path).toContain('/projects/');
});

/** A message as the in-app inbox lists it. */
interface InAppMessageView {
  readonly id: string;
  readonly title?: string;
  readonly body: string;
  readonly target?: { readonly type: string; readonly path?: string };
}

/**
 * Polls `read` until it returns a defined value, or fails after a budget the reminder's asynchronous delivery chain
 * comfortably fits in.
 */
async function waitFor<T>(
  read: () => Promise<T | undefined>,
  timeoutMs = 20_000,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
