// @vitest-environment node

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

import { createStandaloneServer } from '../../server/standalone.ts';

/**
 * The reimbursement API as a signed-in user meets it.
 *
 * The application starts the way `pnpm start` starts it — its own runtime, providers, plugins, migrations and seeds on
 * test databases — so this file proves three things a unit test cannot: every route is declared in the API document,
 * the session guard covers the endpoints and the invoice content path, and the workflow the finance lead described is
 * what the endpoints actually do.
 *
 * The sample users are the seed's: an employee and a manager in Engineering, an employee and a manager in Sales, and a
 * finance officer. Their password is the sample one.
 */
const SAMPLE_PASSWORD = 'demo12345';

/**
 * The origin a browser addresses the application by.
 *
 * A cookie-authenticated write has to name it, because the authentication plugin refuses one that does not: without an
 * `Origin` or `Referer` header there is no way to tell a same-site form post from a cross-site one, and the request is
 * answered `INVALID_CSRF_ORIGIN`. A real browser sends it automatically; a test has to say it.
 */
const TEST_ORIGIN = 'http://localhost';

const test = createAppTest({
  createServer: createStandaloneServer,
  // The application reads its auth secret from configuration, never from a development default. It is long enough for
  // Better Auth to accept it, and exists only inside the test's own temporary configuration file.
  //
  // `publicOrigin` names the origin Better Auth treats as the application's own, which is what a cookie-authenticated
  // write is checked against; without it the application starts with no base URL at all, warns about it, and refuses
  // every write as a cross-site one.
  config: {
    app: { publicOrigin: TEST_ORIGIN },
    auth: {
      secret: 'expense-api-test-secret-at-least-32-chars',
      trustedOrigins: [TEST_ORIGIN],
    },
  },
});

const EXPENSE_PATHS = [
  '/expenseClaims',
  '/expenseDepartments',
  '/expenseStats',
  '/expenseExports',
] as const;

test('refuses every expense endpoint without a session', async ({
  request,
  fetch,
  testApp,
}) => {
  for (const path of EXPENSE_PATHS) {
    const response = await request(path);
    expect(response.status).toBe(401);
  }

  // The invoice bytes are served from outside `/api`; the exposure's own routes carry no authentication, so this is
  // the assertion that the application's guard is in front of them. A UUID that exists proves nothing here: the
  // request must be refused before the key is looked up.
  const invoice = await fetch(
    new Request(
      `http://localhost${testApp.publicBasePath}/uploads/expenseInvoices/00000000-0000-0000-0000-000000000000.pdf`,
    ),
  );
  expect(invoice.status).toBe(401);
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);

  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  // The workflow endpoints are declared with a unique id, the statuses they can answer with, and their request body.
  const approve =
    document.paths?.['/api/expenseClaims/{claimId}/approve']?.post;
  expect(approve?.operationId).toBe('expenseApproveClaim');
  expect(Object.keys(approve?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '403',
    '404',
    '500',
  ]);

  const list = document.paths?.['/api/expenseClaims']?.get;
  expect(list?.operationId).toBe('expenseListClaims');
  // The list has no permission check beyond the session, so it can neither answer 403 nor name a claim that is missing.
  // The 400 is the query validator's own, added by the router rather than declared here.
  expect(Object.keys(list?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '500',
  ]);

  const upload = document.paths?.['/api/expenseInvoiceFiles/uploadOne']?.post;
  expect(upload).toBeDefined();
});

test('runs the whole approval chain and stops a paid claim from changing', async ({
  testApp,
}) => {
  const employee = await signIn(testApp, {
    username: 'zhangsan',
    password: SAMPLE_PASSWORD,
  });
  const supervisor = await signIn(testApp, {
    username: 'lisi',
    password: SAMPLE_PASSWORD,
  });
  const finance = await signIn(testApp, {
    username: 'qianqi',
    password: SAMPLE_PASSWORD,
  });
  const stranger = await signIn(testApp, {
    username: 'wangwu',
    password: SAMPLE_PASSWORD,
  });

  const departmentId = await findDepartmentId(employee, 'engineering');
  const created = await createClaim(employee, {
    title: '客户拜访差旅费 Client visit travel',
    departmentId,
    items: [
      {
        category: 'transport',
        amount: 4200.5,
        expenseDate: '2026-04-01',
        description: '高铁往返',
      },
      {
        category: 'meal',
        amount: 880.25,
        expenseDate: '2026-04-01',
        description: '工作餐',
      },
    ],
  });
  const claimId = created.claim.id;

  // The server computes the total from the lines and ignores anything the client might have sent.
  expect(created.claim.totalAmount).toBe(5080.75);
  expect(created.claim.status).toBe('draft');
  expect(created.items).toHaveLength(2);
  expect(created.capabilities).toMatchObject({
    canEdit: true,
    canSubmit: true,
    canApprove: false,
    canPay: false,
  });

  // A claim under review is no longer editable.
  const submitted = await act(employee, claimId, 'submit', {});
  expect(submitted.claim.status).toBe('pending_supervisor');
  expect(submitted.approvals).toHaveLength(1);
  expect(submitted.approvals[0]).toMatchObject({
    action: 'submit',
    toStatus: 'pending_supervisor',
  });
  await expect(
    write(
      employee,
      `/expenseClaims/${claimId}`,
      {
        title: 'Changed',
        items: [{ category: 'meal', amount: 1 }],
      },
      'PATCH',
    ),
  ).resolves.toMatchObject({ status: 400 });

  // The applicant may see the claim but may not approve it — the capability is refused, not hidden.
  expect(submitted.capabilities.canApprove).toBe(false);
  expect(await actStatus(employee, claimId, 'approve', {})).toBe(403);

  // A signed-in user in another department cannot see it at all: not found, not forbidden.
  const invisible = await stranger.fetch(`/expenseClaims/${claimId}`);
  expect(invisible.status).toBe(404);
  expect(await actStatus(stranger, claimId, 'approve', {})).toBe(404);
  expect(
    (await (await stranger.fetch('/expenseClaims')).json()).data.map(
      (row: { id: string }) => row.id,
    ),
  ).not.toContain(claimId);

  // Over ¥5000 the supervisor's approval hands the claim to finance rather than finishing it.
  const supervisorApproved = await act(supervisor, claimId, 'approve', {
    comment: '同意 Approve',
  });
  expect(supervisorApproved.claim.status).toBe('pending_finance');
  expect(supervisorApproved.capabilities.canPay).toBe(false);

  // Paying before the review is finished is refused even for finance.
  expect(
    await actStatus(finance, claimId, 'pay', {
      paymentMethod: 'bank_transfer',
    }),
  ).toBe(403);

  const financeApproved = await act(finance, claimId, 'approve', {
    comment: '财务复核通过 Finance review passed',
  });
  expect(financeApproved.claim.status).toBe('approved');
  expect(financeApproved.capabilities.canPay).toBe(true);

  // A payment needs a method the application offers.
  expect(
    await actStatus(finance, claimId, 'pay', { paymentMethod: 'cheque' }),
  ).toBe(400);

  const paid = await act(finance, claimId, 'pay', {
    paymentMethod: 'bank_transfer',
    paymentRemark: '已转账 Paid',
  });
  expect(paid.claim.status).toBe('paid');
  expect(paid.claim.paidAt).not.toBeNull();
  expect(paid.claim.paymentMethod).toBe('bank_transfer');

  // Every action is on the record, with who did it and when, in the order it happened.
  expect(paid.approvals.map((approval) => approval.action)).toEqual([
    'submit',
    'approve',
    'approve',
    'pay',
  ]);
  expect(paid.approvals.map((approval) => approval.operatorId)).toEqual([
    employee.user.id,
    supervisor.user.id,
    finance.user.id,
    finance.user.id,
  ]);
  expect(paid.approvals.every((approval) => approval.createdAt !== null)).toBe(
    true,
  );
  expect(paid.approvals[1]?.comment).toBe('同意 Approve');

  // A paid claim is frozen: no edit, no resubmit, and no second payment.
  expect(paid.capabilities).toMatchObject({
    canEdit: false,
    canSubmit: false,
    canApprove: false,
    canPay: false,
  });
  const editAfterPayment = await write(
    employee,
    `/expenseClaims/${claimId}`,
    { title: 'Too late', items: [{ category: 'meal', amount: 1 }] },
    'PATCH',
  );
  expect(editAfterPayment.status).toBe(400);
  expect(await actStatus(employee, claimId, 'submit', {})).toBe(403);
  expect(
    await actStatus(finance, claimId, 'pay', { paymentMethod: 'cash' }),
  ).toBe(403);
});

test('sends a claim back with a reason and lets the applicant resubmit it', async ({
  testApp,
}) => {
  const employee = await signIn(testApp, {
    username: 'wangwu',
    password: SAMPLE_PASSWORD,
  });
  const supervisor = await signIn(testApp, {
    username: 'zhaoliu',
    password: SAMPLE_PASSWORD,
  });

  const departmentId = await findDepartmentId(employee, 'sales');
  const created = await createClaim(employee, {
    title: '培训报名费 Training fee',
    departmentId,
    items: [{ category: 'other', amount: 2300, expenseDate: '2026-04-02' }],
  });
  const claimId = created.claim.id;
  await act(employee, claimId, 'submit', {});

  // A rejection without a reason is refused: the applicant is owed a reason.
  expect(await actStatus(supervisor, claimId, 'reject', {})).toBe(400);
  expect(
    await actStatus(supervisor, claimId, 'reject', { comment: '   ' }),
  ).toBe(400);

  const rejected = await act(supervisor, claimId, 'reject', {
    comment: '发票不完整 Invoice incomplete',
  });
  expect(rejected.claim.status).toBe('rejected');
  expect(rejected.approvals.at(-1)?.comment).toBe(
    '发票不完整 Invoice incomplete',
  );
  // The owner may fix it, and the reason is still on the record. Capabilities answer for the caller, so the applicant
  // has to read the claim to see theirs.
  const ownerView = (await (
    await employee.fetch(`/expenseClaims/${claimId}`)
  ).json()) as { data: ClaimDetailBody };
  expect(ownerView.data.capabilities).toMatchObject({
    canEdit: true,
    canSubmit: true,
  });

  const edited = await write(
    employee,
    `/expenseClaims/${claimId}`,
    {
      title: '培训报名费 Training fee (revised)',
      departmentId,
      items: [
        {
          category: 'other',
          amount: 2150,
          expenseDate: '2026-04-02',
          description: '含完整发票 With invoice',
        },
      ],
    },
    'PATCH',
  );
  expect(edited.status).toBe(200);
  const editedBody = (await edited.json()) as {
    data: { claim: { totalAmount: number; status: string } };
  };
  // The total follows the lines that replaced the old ones.
  expect(editedBody.data.claim.totalAmount).toBe(2150);
  expect(editedBody.data.claim.status).toBe('rejected');

  const resubmitted = await act(employee, claimId, 'submit', {
    comment: '已补充发票 Invoice attached',
  });
  expect(resubmitted.claim.status).toBe('pending_supervisor');

  // Under ¥5000 the supervisor's approval ends the approval chain.
  const approved = await act(supervisor, claimId, 'approve', {});
  expect(approved.claim.status).toBe('approved');
});

test('scopes the list, the statistics and the export to the requester', async ({
  testApp,
}) => {
  const employee = await signIn(testApp, {
    username: 'zhangsan',
    password: SAMPLE_PASSWORD,
  });
  const finance = await signIn(testApp, {
    username: 'qianqi',
    password: SAMPLE_PASSWORD,
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // A list answer is an envelope: the rows plus the paging it was cut from.
  const mine = await employee.fetch('/expenseClaims');
  expect(mine.status).toBe(200);
  const mineBody = (await mine.json()) as {
    data: { applicantId: string }[];
    meta: { total: number };
  };
  expect(mineBody.meta.total).toBe(mineBody.data.length);
  expect(mineBody.data.length).toBeGreaterThan(0);
  // A scoped list holds only what the caller may see: their own claims, plus those of departments they manage.
  expect(
    mineBody.data.every((row) => row.applicantId === employee.user.id),
  ).toBe(true);

  // Finance sees every claim, including other people's.
  const all = await finance.fetch('/expenseClaims?pageSize=100');
  const allBody = (await all.json()) as {
    data: unknown[];
    meta: { total: number };
  };
  expect(allBody.meta.total).toBeGreaterThan(mineBody.meta.total);

  // The root account is not finance and not a member of any seeded department, so it sees only its own (none).
  const adminList = await admin.fetch('/expenseClaims');
  expect(adminList.status).toBe(200);
  expect(((await adminList.json()) as { data: unknown[] }).data).toEqual([]);

  // Status and department filters narrow the list; an unknown status is ignored rather than refused.
  const filtered = await employee.fetch(
    '/expenseClaims?status=paid,draft&pageSize=100',
  );
  const filteredBody = (await filtered.json()) as {
    data: { status: string }[];
  };
  expect(filteredBody.data.length).toBeGreaterThan(0);
  expect(
    filteredBody.data.every((row) => ['paid', 'draft'].includes(row.status)),
  ).toBe(true);
  const unknownStatus = await employee.fetch(
    '/expenseClaims?status=archived&pageSize=100',
  );
  expect(unknownStatus.status).toBe(200);
  expect(
    ((await unknownStatus.json()) as { data: unknown[] }).data.length,
  ).toBe(mineBody.data.length);

  // Statistics are scoped the same way and answer the dashboard's shape.
  const stats = await finance.fetch('/expenseStats');
  expect(stats.status).toBe(200);
  const statsBody = (await stats.json()) as {
    data: {
      totals: { count: number };
      byStatus: { status: string }[];
      byMonth: { month: string }[];
    };
  };
  expect(statsBody.data.totals.count).toBeGreaterThan(0);
  expect(statsBody.data.byStatus.map((bucket) => bucket.status)).toEqual([
    'draft',
    'pending_supervisor',
    'pending_finance',
    'approved',
    'rejected',
    'paid',
  ]);
  expect(
    statsBody.data.byMonth.every((bucket) =>
      /^\d{4}-\d{2}$/.test(bucket.month),
    ),
  ).toBe(true);
});

test('runs a batch export in the background and hands back its file', async ({
  testApp,
}) => {
  const employee = await signIn(testApp, {
    username: 'zhangsan',
    password: SAMPLE_PASSWORD,
  });

  const started = await write(employee, '/expenseExports', {});
  expect(started.status).toBe(201);
  const job = (await started.json()) as {
    data: { id: string; status: string; progress: number };
  };
  expect(['pending', 'running', 'completed']).toContain(job.data.status);

  // The requester polls the job while carrying on with other work; no request blocks on the export.
  const finished = await waitForExport(employee, job.data.id);
  expect(finished.status).toBe('completed');
  expect(finished.progress).toBe(100);
  expect(finished.resultSize).toBeGreaterThan(0);
  expect(finished.resultFilename).toMatch(/\.csv$/u);

  // The download route answers the file itself, with the name and content type a browser needs.
  const download = await employee.fetch(
    `/expenseExports/${job.data.id}/download`,
  );
  expect(download.status).toBe(200);
  expect(download.headers.get('content-disposition')).toContain('.csv');
  const csvBytes = new Uint8Array(await download.arrayBuffer());
  // A UTF-8 BOM so Excel reads the Chinese columns, a header row, and the requester's own claim numbers.
  expect([...csvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(csvBytes);
  expect(csv).toContain('报销单号 Claim No');
  expect(csv).toContain('EX2026');

  // An export belongs to the person who asked for it.
  const other = await signIn(testApp, {
    username: 'wangwu',
    password: SAMPLE_PASSWORD,
  });
  expect((await other.fetch(`/expenseExports/${job.data.id}`)).status).toBe(
    404,
  );
  expect(
    (await other.fetch(`/expenseExports/${job.data.id}/download`)).status,
  ).toBe(404);
  // And so does the list of them.
  expect(
    (
      (await (await other.fetch('/expenseExports')).json()) as {
        data: unknown[];
      }
    ).data,
  ).toEqual([]);
});

/** A cookie-authenticated write, naming the origin a browser would send. */
function write(
  session: TestSession,
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' | 'PUT' = 'POST',
): Promise<Response> {
  return session.fetch(path, {
    method,
    headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
    body: JSON.stringify(body),
  });
}

/** A signed-in user performing one workflow action. */
async function act(
  session: TestSession,
  claimId: string,
  action: 'submit' | 'approve' | 'reject' | 'pay',
  payload: { comment?: string; paymentMethod?: string; paymentRemark?: string },
): Promise<ClaimDetailBody> {
  const response = await write(
    session,
    `/expenseClaims/${claimId}/${action}`,
    payload,
  );
  if (!response.ok) {
    throw new Error(
      `${action} failed with ${response.status}: ${await response.text()}`,
    );
  }
  return ((await response.json()) as { data: ClaimDetailBody }).data;
}

/** The status of an action the caller is expected to be refused. */
async function actStatus(
  session: TestSession,
  claimId: string,
  action: 'submit' | 'approve' | 'reject' | 'pay',
  payload: { comment?: string; paymentMethod?: string; paymentRemark?: string },
): Promise<number> {
  const response = await write(
    session,
    `/expenseClaims/${claimId}/${action}`,
    payload,
  );
  return response.status;
}

interface ClaimDetailBody {
  readonly claim: {
    id: string;
    status: string;
    totalAmount: number;
    paidAt: string | null;
    paymentMethod: string | null;
  };
  readonly items: readonly { id: string }[];
  readonly approvals: readonly {
    action: string;
    operatorId: string;
    comment: string | null;
    createdAt: string | null;
  }[];
  readonly capabilities: {
    canEdit: boolean;
    canSubmit: boolean;
    canApprove: boolean;
    canReject: boolean;
    canPay: boolean;
  };
}

async function createClaim(
  session: TestSession,
  input: {
    title: string;
    departmentId: string | null;
    items: readonly {
      category: string;
      amount: number;
      expenseDate?: string;
      description?: string;
    }[];
  },
): Promise<ClaimDetailBody> {
  const response = await write(session, '/expenseClaims', input);
  if (response.status !== 201) {
    throw new Error(
      `create failed with ${response.status}: ${await response.text()}`,
    );
  }
  return ((await response.json()) as { data: ClaimDetailBody }).data;
}

/** The id of a department by its code, read from the endpoint the form uses. */
async function findDepartmentId(
  session: TestSession,
  code: string,
): Promise<string> {
  const response = await session.fetch('/expenseDepartments');
  const body = (await response.json()) as {
    data: { id: string; code: string }[];
  };
  const department = body.data.find((candidate) => candidate.code === code);
  if (!department) {
    throw new Error(`No department with code "${code}" was seeded`);
  }
  return department.id;
}

/** Poll the job until it stops running, the way the export panel does. */
async function waitForExport(
  session: TestSession,
  id: string,
): Promise<{
  status: string;
  progress: number;
  resultFilename: string | null;
  resultSize: number;
}> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await session.fetch(`/expenseExports/${id}`);
    const job = (
      (await response.json()) as {
        data: {
          status: string;
          progress: number;
          resultFilename: string | null;
          resultSize: number;
        };
      }
    ).data;
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The export job did not finish');
}
