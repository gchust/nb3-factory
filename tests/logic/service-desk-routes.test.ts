// @vitest-environment node
/**
 * The service desk's HTTP surface, driven through the whole application: its own authentication, its own
 * migrations and seeds, and its own lifecycle jobs. Every test starts from a ticket it raised itself, so the
 * checks do not depend on the order the file runs in.
 */
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  // The application refuses to start without the keys it signs sessions with; `config.yml` supplies them in a
  // deployment and this test configuration supplies its own.
  config: {
    auth: { secret: 'service-desk-test-secret-at-least-32-characters' },
    // The origin the requests name; the application trusts it for cookie-authenticated writes.
    app: { publicOrigin: 'http://localhost' },
  },
});

let counter = 0;

/** The origin the requests are addressed to; a cookie-authenticated write must name a trusted one. */
const ORIGIN = 'http://localhost';

interface User {
  readonly id: string;
  readonly session: TestSession;
}

/** A fresh ordinary employee: signed up through the application's own route, then signed in. */
async function employee(
  testApp: { request: (path: string, init?: RequestInit) => Promise<Response> },
  app: Parameters<typeof signIn>[0],
  name: string,
): Promise<User> {
  counter += 1;
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${counter}@example.com`;
  const password = 'password1234';
  const signedUp = await testApp.request('/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password, name }),
  });
  if (!signedUp.ok) {
    throw new Error(
      `Sign-up failed with ${signedUp.status}: ${await signedUp.text()}`,
    );
  }
  const session = await signIn(app, { email, password });
  return { id: session.user.id, session };
}

/** The administrator the seed also puts on the service desk. */
async function helpdesk(
  app: Parameters<typeof signIn>[0],
): Promise<TestSession> {
  return signIn(app, DEFAULT_ADMIN_CREDENTIALS);
}

async function appoint(
  helpdeskSession: TestSession,
  userId: string,
  role: 'engineer' | 'helpdesk' | null,
): Promise<void> {
  const response = await helpdeskSession.fetch(`/serviceDesk/staff/${userId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ role }),
  });
  expect(response.status).toBe(204);
}

async function raise(
  session: TestSession,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; status: string; version: number }> {
  const response = await session.fetch('/serviceDesk/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({
      title: 'The meeting room projector has no signal',
      description: 'The projector shows "no signal" for every cable.',
      urgency: 'normal',
      ...overrides,
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    data: { record: { id: number; status: string }; version: number };
  };
  return {
    id: body.data.record.id,
    status: body.data.record.status,
    version: body.data.version,
  };
}

async function fire(
  session: TestSession,
  ticketId: number,
  transition: string,
  input: Record<string, unknown> = {},
): Promise<Response> {
  return session.fetch(`/serviceDesk/tickets/${ticketId}/fire`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ transition, input }),
  });
}

test('refuses an anonymous caller and identifies a signed-in one', async ({
  testApp,
  request,
}) => {
  const anonymous = await request('/serviceDesk/me');
  expect(anonymous.status).toBe(401);

  const alice = await employee(testApp, testApp, 'alice');
  const me = await alice.session.fetch('/serviceDesk/me');
  expect(me.status).toBe(200);
  await expect(me.json()).resolves.toMatchObject({
    data: { userId: alice.id, helpdesk: false, engineer: false },
  });
});

test('shows an employee only the tickets they raised', async ({ testApp }) => {
  const alice = await employee(testApp, testApp, 'alice2');
  const bob = await employee(testApp, testApp, 'bob2');

  const mine = await raise(alice.session, { title: 'Alice printer jam' });

  const aliceList = await alice.session.fetch('/serviceDesk/tickets');
  expect(aliceList.status).toBe(200);
  const aliceBody = (await aliceList.json()) as {
    data: { id: number; requesterName: string }[];
    meta: { total: number };
  };
  expect(aliceBody.data.map((row) => row.id)).toContain(mine.id);
  expect(aliceBody.data.every((row) => row.requesterName === 'alice2')).toBe(
    true,
  );

  const bobList = await bob.session.fetch('/serviceDesk/tickets');
  await expect(bobList.json()).resolves.toMatchObject({ meta: { total: 0 } });
  // Another employee's ticket is not merely forbidden, it is invisible.
  const peek = await bob.session.fetch(`/serviceDesk/tickets/${mine.id}`);
  expect(peek.status).toBe(404);
  await expect(peek.json()).resolves.toMatchObject({
    error: { reason: 'TICKET_NOT_FOUND' },
  });
});

test('takes a ticket from assignment to a confirmed close', async ({
  testApp,
}) => {
  const admin = await helpdesk(testApp);
  const erin = await employee(testApp, testApp, 'erin');
  const frank = await employee(testApp, testApp, 'frank');
  await appoint(admin, erin.id, 'engineer');

  const ticket = await raise(frank.session, { urgency: 'high' });

  // An employee may not assign: the guard refuses a caller without the permission.
  const refused = await fire(frank.session, ticket.id, 'assign', {
    assigneeId: erin.id,
  });
  expect(refused.status).toBe(403);
  await expect(refused.json()).resolves.toMatchObject({
    error: { metadata: { blockers: [{ code: 'NOT_HELPDESK' }] } },
  });

  const assigned = await fire(admin, ticket.id, 'assign', {
    assigneeId: erin.id,
  });
  expect(assigned.status).toBe(200);
  await expect(assigned.json()).resolves.toMatchObject({
    data: { state: 'assigned', record: { assigneeId: erin.id } },
  });

  // The assigned engineer can see it; another engineer cannot.
  const gina = await employee(testApp, testApp, 'gina');
  await appoint(admin, gina.id, 'engineer');
  expect(
    (await erin.session.fetch(`/serviceDesk/tickets/${ticket.id}`)).status,
  ).toBe(200);
  expect(
    (await gina.session.fetch(`/serviceDesk/tickets/${ticket.id}`)).status,
  ).toBe(404);

  expect((await fire(erin.session, ticket.id, 'start')).status).toBe(200);

  const resolved = await fire(erin.session, ticket.id, 'resolve', {
    solution: 'Replaced the HDMI cable.',
  });
  expect(resolved.status).toBe(200);
  await expect(resolved.json()).resolves.toMatchObject({
    data: {
      state: 'resolved',
      record: { solution: 'Replaced the HDMI cable.' },
    },
  });

  // Only the requester may confirm.
  const wrongConfirmer = await fire(erin.session, ticket.id, 'confirm');
  expect(wrongConfirmer.status).toBe(403);
  const confirmed = await fire(frank.session, ticket.id, 'confirm');
  expect(confirmed.status).toBe(200);
  await expect(confirmed.json()).resolves.toMatchObject({
    data: { state: 'closed' },
  });
});

test('returns a resolved ticket to the engineer and lets the desk reassign it', async ({
  testApp,
}) => {
  const admin = await helpdesk(testApp);
  const henry = await employee(testApp, testApp, 'henry');
  const irene = await employee(testApp, testApp, 'irene');
  const jane = await employee(testApp, testApp, 'jane');
  await appoint(admin, henry.id, 'engineer');
  await appoint(admin, irene.id, 'engineer');

  const ticket = await raise(jane.session);
  await fire(admin, ticket.id, 'assign', { assigneeId: henry.id });
  await fire(admin, ticket.id, 'resolve', { solution: 'Rebooted.' });

  const returned = await fire(jane.session, ticket.id, 'return', {
    returnReason: 'It happened again this morning.',
  });
  expect(returned.status).toBe(200);
  await expect(returned.json()).resolves.toMatchObject({
    data: { state: 'returned' },
  });

  const reassigned = await fire(admin, ticket.id, 'reassign', {
    assigneeId: irene.id,
  });
  expect(reassigned.status).toBe(200);
  await expect(reassigned.json()).resolves.toMatchObject({
    data: { state: 'assigned', record: { assigneeId: irene.id } },
  });
  expect((await fire(irene.session, ticket.id, 'start')).status).toBe(200);
});

test('records a handling note as a comment for anyone but the assigned engineer', async ({
  testApp,
}) => {
  const admin = await helpdesk(testApp);
  const kate = await employee(testApp, testApp, 'kate');
  const leo = await employee(testApp, testApp, 'leo');
  await appoint(admin, kate.id, 'engineer');

  const ticket = await raise(leo.session);
  await fire(admin, ticket.id, 'assign', { assigneeId: kate.id });

  const engineerNote = await kate.session.fetch(
    `/serviceDesk/tickets/${ticket.id}/notes`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        content: 'Ordered the spare part.',
        kind: 'handling',
      }),
    },
  );
  expect(engineerNote.status).toBe(201);
  await expect(engineerNote.json()).resolves.toMatchObject({
    data: { kind: 'handling', authorName: 'kate' },
  });

  // The requester asks for a handling note; the server records a plain comment instead.
  const requesterNote = await leo.session.fetch(
    `/serviceDesk/tickets/${ticket.id}/notes`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ content: 'Any update?', kind: 'handling' }),
    },
  );
  await expect(requesterNote.json()).resolves.toMatchObject({
    data: { kind: 'comment' },
  });

  const listed = await leo.session.fetch(
    `/serviceDesk/tickets/${ticket.id}/notes`,
  );
  const listedBody = (await listed.json()) as { data: { kind: string }[] };
  expect(listedBody.data.map((note) => note.kind)).toEqual([
    'handling',
    'comment',
  ]);
});

test('counts what the caller may see, including overdue tickets and engineer load', async ({
  testApp,
  connection,
}) => {
  const admin = await helpdesk(testApp);
  const mia = await employee(testApp, testApp, 'mia');
  const nate = await employee(testApp, testApp, 'nate');
  await appoint(admin, mia.id, 'engineer');
  await appoint(admin, nate.id, 'engineer');

  await raise(mia.session, { title: 'Waiting for the desk' });
  const overdue = await raise(mia.session, { title: 'Waiting too long' });
  await fire(admin, overdue.id, 'assign', { assigneeId: mia.id });
  // Backdate the open ticket so it has waited past the 24 hour reminder.
  await connection.query
    .updateTable('tickets')
    .set({ statusChangedAt: new Date(Date.now() - 30 * 60 * 60 * 1000) })
    .where('id', '=', overdue.id)
    .execute();

  const overview = await admin.fetch('/serviceDesk/overview');
  expect(overview.status).toBe(200);
  const body = (await overview.json()) as {
    data: {
      pendingAssignment: number;
      overdue: number;
      workload: {
        engineerId: string;
        name: string;
        open: number;
        overdue: number;
      }[];
    };
  };
  expect(body.data.pendingAssignment).toBeGreaterThanOrEqual(1);
  expect(body.data.overdue).toBeGreaterThanOrEqual(1);
  const load = body.data.workload.find((row) => row.engineerId === mia.id);
  expect(load).toMatchObject({ name: 'mia', open: 1, overdue: 1 });

  // An engineer's overview counts their own load, not everyone's.
  const engineerOverview = await mia.session.fetch('/serviceDesk/overview');
  await expect(engineerOverview.json()).resolves.toMatchObject({
    data: { me: { engineer: true }, workload: [{ engineerId: mia.id }] },
  });
});

test('keeps staff management to the service desk', async ({ testApp }) => {
  const admin = await helpdesk(testApp);
  const olivia = await employee(testApp, testApp, 'olivia');

  expect((await olivia.session.fetch('/serviceDesk/staff')).status).toBe(403);
  const refused = await olivia.session.fetch(
    `/serviceDesk/staff/${olivia.id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ role: 'engineer' }),
    },
  );
  expect(refused.status).toBe(403);
  await expect(refused.json()).resolves.toMatchObject({
    error: { reason: 'HELPDESK_ONLY' },
  });

  expect((await admin.fetch('/serviceDesk/staff')).status).toBe(200);
  await appoint(admin, olivia.id, 'engineer');
  const engineers = await admin.fetch('/serviceDesk/engineers');
  const engineersBody = (await engineers.json()) as { data: { id: string }[] };
  expect(engineersBody.data.map((user) => user.id)).toContain(olivia.id);

  // Clearing the role makes them an ordinary employee again.
  await appoint(admin, olivia.id, null);
  const after = await admin.fetch('/serviceDesk/engineers');
  const afterBody = (await after.json()) as { data: { id: string }[] };
  expect(afterBody.data.map((user) => user.id)).not.toContain(olivia.id);
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(
    document.paths?.['/api/serviceDesk/tickets/{ticketId}/fire']?.post
      ?.operationId,
  ).toBe('serviceDeskTicketsFire');
});
