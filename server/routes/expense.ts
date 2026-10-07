import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type ApiErrorStatus,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { z } from 'zod';

import { ExpenseError, type ExpenseReason } from '../expense/errors.js';
import { expenseServiceToken } from '../expense/provider.js';
import type { Actor } from '../expense/logic.js';
import type { ExpenseListQuery } from '../expense/service.js';
import { EXPENSE_STATUSES, type ExpenseStatus } from '../expense/model.js';
import {
  ClaimDecisionInputSchema,
  ClaimFilterQuerySchema,
  ClaimInputSchema,
  ClaimListQuerySchema,
  ClaimListRowSchema,
  ClaimParamsSchema,
  ClaimPayInputSchema,
  ClaimDetailSchema,
  DepartmentSchema,
  ExpenseCountMetaSchema,
  ExpenseListMetaSchema,
  ExpenseStatsSchema,
  ExportFilterInputSchema,
  ExportJobSchema,
  ExportParamsSchema,
} from './schemas.js';

/** One namespace for every reason this application defines, matching the `/expense*` URL prefix. */
const EXPENSE_ERROR_DOMAIN = 'expenses';

/** The HTTP status each domain failure answers with. */
const EXPENSE_ERROR_STATUS: Record<ExpenseReason, ApiErrorStatus> = {
  not_found: 'NOT_FOUND',
  forbidden: 'PERMISSION_DENIED',
  // The request is well-formed; the claim's state is what refuses it.
  invalid_status: 'FAILED_PRECONDITION',
  validation: 'INVALID_ARGUMENT',
  comment_required: 'INVALID_ARGUMENT',
  empty_claim: 'FAILED_PRECONDITION',
  invalid_payment_method: 'INVALID_ARGUMENT',
  // A concurrent reviewer moved the claim first.
  conflict: 'ABORTED',
};

const EXPENSE_ERROR_REASON: Record<ExpenseReason, string> = {
  not_found: 'EXPENSE_NOT_FOUND',
  forbidden: 'EXPENSE_FORBIDDEN',
  invalid_status: 'EXPENSE_INVALID_STATUS',
  validation: 'EXPENSE_VALIDATION',
  comment_required: 'EXPENSE_COMMENT_REQUIRED',
  empty_claim: 'EXPENSE_EMPTY_CLAIM',
  invalid_payment_method: 'EXPENSE_INVALID_PAYMENT_METHOD',
  conflict: 'EXPENSE_CONFLICT',
};

/** Turn one domain failure into the `/api` error body, keeping any field the service named. */
function toExpenseApiError(error: ExpenseError): ApiError {
  const field =
    typeof error.details?.field === 'string' ? error.details.field : undefined;
  const status = EXPENSE_ERROR_STATUS[error.reason];
  return new ApiError({
    status,
    reason: EXPENSE_ERROR_REASON[error.reason],
    domain: EXPENSE_ERROR_DOMAIN,
    message: error.message,
    ...(field
      ? {
          fieldViolations: [
            {
              field,
              description: error.message,
              reason: EXPENSE_ERROR_REASON[error.reason],
            },
          ],
        }
      : {}),
  });
}

/** The variables the expense router reads: the session the authentication middleware resolved, and the actor it implies. */
type ExpenseEnv = AuthEnv & { Variables: { expenseActor: Actor } };

const tags = ['Expenses'];

/** Every expense route needs a session; the claim-level checks happen inside the service. */
const claimNotFoundResponse = apiErrorResponse(
  404,
  'No claim with this id is visible to the signed-in user (`EXPENSE_NOT_FOUND`).',
);
const exportNotFoundResponse = apiErrorResponse(
  404,
  'No export with this id belongs to the signed-in user (`EXPENSE_NOT_FOUND`).',
);
const forbiddenResponse = apiErrorResponse(
  403,
  'The signed-in user may not perform this action on the claim (`EXPENSE_FORBIDDEN`).',
);
const preconditionResponse = apiErrorResponse(
  400,
  "The claim's state does not allow this action (`EXPENSE_INVALID_STATUS`), or the concurrency guard refused the write (`EXPENSE_CONFLICT`).",
);
const validationResponse = apiErrorResponse(
  400,
  'A business rule the schema cannot express refused the input (`EXPENSE_VALIDATION`).',
);

/**
 * A route whose only authorization is the session.
 *
 * `apiErrorResponses` also lists `403`, which these routes cannot answer: what the caller may see is decided by
 * scoping a query rather than by refusing the request, so the only refusal they produce is the missing session.
 */
const sessionOnlyResponses = {
  401: apiErrorResponse(401, 'No session and no API key was presented.'),
  500: apiErrorResponse(500, 'The request failed unexpectedly.'),
};

/** Split a query value that may arrive comma separated or repeated into the values it carries. */
function splitList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parts.length ? parts : undefined;
}

/**
 * Translate the validated filter query into the service's query, dropping values the domain does not offer.
 *
 * The status list is narrowed to the known statuses here rather than rejected: a stale bookmark asking for a status
 * that no longer exists should show the other statuses, not fail.
 */
function toFilterQuery(
  query: z.infer<typeof ClaimFilterQuerySchema>,
): ExpenseListQuery {
  const statuses = splitList(query.status)?.filter(
    (status): status is ExpenseStatus =>
      (EXPENSE_STATUSES as readonly string[]).includes(status),
  );
  return {
    statuses: statuses?.length ? statuses : undefined,
    departmentIds: splitList(query.departmentId),
    keyword: query.keyword?.trim() || undefined,
    submittedFrom: query.submittedFrom || null,
    submittedTo: query.submittedTo || null,
  };
}

/** The full list query: the shared filters plus the standard page-number paging. */
function toListQuery(
  query: z.infer<typeof ClaimListQuerySchema>,
): ExpenseListQuery {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return {
    ...toFilterQuery(query),
    limit: pageSize,
    offset: (page - 1) * pageSize,
    sort: query.sort,
    order: query.order,
  };
}

/**
 * The reimbursement endpoints.
 *
 * Every route installs its own session guard on an exact path prefix: a contribution shares the mounted `/api` router
 * with every other contribution, so a bare `router.use('*', ...)` would also guard routes this module does not own. The
 * actor is resolved once per request from the session and the department tables, never from anything the caller sends.
 */
export function createExpenseRouter(app: Application): Hono<ExpenseEnv> {
  const service = app.container.resolve(expenseServiceToken);
  const session = app.container.resolve(authenticationToken).required();
  const router = new Hono<ExpenseEnv>();

  // The route's own failure first, then the framework's: anything unrecognized is rethrown to the application.
  router.onError((error, context) =>
    apiErrorHandler(
      error instanceof ExpenseError ? toExpenseApiError(error) : error,
      context,
    ),
  );

  const resolveActor: MiddlewareHandler<ExpenseEnv> = async (context, next) => {
    const current = context.get('auth');
    if (!current) {
      // The session guard runs first; this only fires if the route was mounted without it.
      throw new ApiError({
        status: 'UNAUTHENTICATED',
        reason: 'EXPENSE_AUTHENTICATION_REQUIRED',
        domain: EXPENSE_ERROR_DOMAIN,
        message: 'Sign in to use the expense workflow.',
      });
    }
    context.set(
      'expenseActor',
      await service.actorFor({ id: current.user.id, name: current.user.name }),
    );
    await next();
  };

  for (const prefix of [
    '/expenseClaims/*',
    '/expenseDepartments/*',
    '/expenseStats/*',
    '/expenseExports/*',
  ]) {
    router.use(prefix, session);
    router.use(prefix, resolveActor);
  }

  const actorOf = (context: Context<ExpenseEnv>): Actor =>
    context.get('expenseActor');

  router.get(
    '/expenseDepartments',
    describeRoute({
      tags,
      summary: 'List the departments a claim can be filed for',
      operationId: 'expenseListDepartments',
      description:
        'The full department tree, ordered for display. The form uses it to offer a department; the server still decides whether the signed-in user may file for the chosen one.',
      responses: {
        200: listResponse(
          DepartmentSchema,
          ExpenseCountMetaSchema,
          'Every department.',
        ),
        ...sessionOnlyResponses,
      },
    }),
    async (context) => {
      const departments = await service.listDepartments();
      return context.json({
        data: departments,
        meta: { total: departments.length },
      });
    },
  );

  router.get(
    '/expenseClaims',
    describeRoute({
      tags,
      summary: 'List the reimbursement claims the signed-in user may see',
      operationId: 'expenseListClaims',
      description:
        'Finance sees every claim; everyone else sees their own plus the claims of the departments they supervise. `status` and `departmentId` accept a comma-separated or repeated list. Ordering defaults to newest first.',
      responses: {
        200: listResponse(
          ClaimListRowSchema,
          ExpenseListMetaSchema,
          'One page of claims, each with its capability flags.',
        ),
        ...sessionOnlyResponses,
      },
    }),
    apiValidator('query', ClaimListQuerySchema),
    async (context) => {
      const query = context.req.valid('query');
      const { rows, total } = await service.listClaims(
        actorOf(context),
        toListQuery(query),
      );
      return context.json({
        data: rows,
        meta: { total, page: query.page ?? 1, pageSize: query.pageSize ?? 20 },
      });
    },
  );

  router.post(
    '/expenseClaims',
    describeRoute({
      tags,
      summary: 'Create a reimbursement claim',
      operationId: 'expenseCreateClaim',
      description:
        'Creates a draft claim with its expense lines. The total is computed from the lines; a total sent by the client is ignored. The claim is not submitted until the submit action is called.',
      responses: {
        201: dataResponse(
          ClaimDetailSchema,
          'The created claim, with the capabilities the client renders.',
        ),
        ...apiErrorResponses,
        ...{ 400: validationResponse, 403: forbiddenResponse },
      },
    }),
    apiValidator('json', ClaimInputSchema),
    async (context) =>
      context.json(
        {
          data: await service.createClaim(
            actorOf(context),
            context.req.valid('json'),
          ),
        },
        201,
      ),
  );

  router.get(
    '/expenseClaims/:claimId',
    describeRoute({
      tags,
      summary: 'Read one reimbursement claim',
      operationId: 'expenseGetClaim',
      description:
        'The claim, its expense lines, its full action history and the capabilities of the signed-in user.',
      responses: {
        200: dataResponse(ClaimDetailSchema),
        ...sessionOnlyResponses,
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    async (context) =>
      context.json({
        data: await service.getClaim(
          actorOf(context),
          context.req.valid('param').claimId,
        ),
      }),
  );

  router.patch(
    '/expenseClaims/:claimId',
    describeRoute({
      tags,
      summary: 'Replace the contents of a draft or rejected claim',
      operationId: 'expenseUpdateClaim',
      description:
        'Rewrites the purpose, department, remark and expense lines. Only a draft or a rejected claim may change; a claim under review or already paid refuses the write.',
      responses: {
        200: dataResponse(ClaimDetailSchema, 'The claim after the change.'),
        ...apiErrorResponses,
        400: preconditionResponse,
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    apiValidator('json', ClaimInputSchema),
    async (context) =>
      context.json({
        data: await service.updateClaim(
          actorOf(context),
          context.req.valid('param').claimId,
          context.req.valid('json'),
        ),
      }),
  );

  router.delete(
    '/expenseClaims/:claimId',
    describeRoute({
      tags,
      summary: 'Delete a draft or rejected claim',
      operationId: 'expenseDeleteClaim',
      description:
        'Only the applicant may delete, and only before the claim enters the approval chain or after a rejection.',
      responses: {
        204: emptyResponse('The claim and its expense lines were deleted.'),
        ...apiErrorResponses,
        400: preconditionResponse,
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    async (context) => {
      await service.deleteClaim(
        actorOf(context),
        context.req.valid('param').claimId,
      );
      return context.body(null, 204);
    },
  );

  router.post(
    '/expenseClaims/:claimId/submit',
    describeRoute({
      tags,
      summary: 'Submit a claim for approval',
      operationId: 'expenseSubmitClaim',
      description:
        'Moves a draft or rejected claim to `pending_supervisor`. The optional comment is recorded with the submit action.',
      responses: {
        200: dataResponse(ClaimDetailSchema, 'The claim after submission.'),
        ...apiErrorResponses,
        ...{
          400: apiErrorResponse(
            400,
            'The claim has no expense line with a positive amount (`EXPENSE_EMPTY_CLAIM`), or its state refuses submission (`EXPENSE_INVALID_STATUS`).',
          ),
        },
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    apiValidator('json', ClaimDecisionInputSchema),
    async (context) =>
      context.json({
        data: await service.act(
          actorOf(context),
          context.req.valid('param').claimId,
          'submit',
          {
            comment: context.req.valid('json').comment,
          },
        ),
      }),
  );

  router.post(
    '/expenseClaims/:claimId/approve',
    describeRoute({
      tags,
      summary: 'Approve a claim at the stage it currently sits',
      operationId: 'expenseApproveClaim',
      description:
        'A supervisor approving a claim over ¥5000 sends it on to `pending_finance`; every other approval reaches `approved`. The approver must manage the claim department, and an applicant never approves their own claim.',
      responses: {
        200: dataResponse(ClaimDetailSchema, 'The claim at its next stage.'),
        ...apiErrorResponses,
        ...{ 400: preconditionResponse },
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    apiValidator('json', ClaimDecisionInputSchema),
    async (context) =>
      context.json({
        data: await service.act(
          actorOf(context),
          context.req.valid('param').claimId,
          'approve',
          {
            comment: context.req.valid('json').comment,
          },
        ),
      }),
  );

  router.post(
    '/expenseClaims/:claimId/reject',
    describeRoute({
      tags,
      summary: 'Reject a claim',
      operationId: 'expenseRejectClaim',
      description:
        'Moves any claim under review to `rejected`. The comment is required: the applicant is told why and edits the claim before resubmitting.',
      responses: {
        200: dataResponse(ClaimDetailSchema, 'The rejected claim.'),
        ...apiErrorResponses,
        ...{
          400: apiErrorResponse(
            400,
            'No rejection reason was given (`EXPENSE_COMMENT_REQUIRED`), or the claim is not under review (`EXPENSE_INVALID_STATUS`).',
          ),
        },
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    apiValidator('json', ClaimDecisionInputSchema),
    async (context) =>
      context.json({
        data: await service.act(
          actorOf(context),
          context.req.valid('param').claimId,
          'reject',
          {
            comment: context.req.valid('json').comment,
          },
        ),
      }),
  );

  router.post(
    '/expenseClaims/:claimId/pay',
    describeRoute({
      tags,
      summary: 'Register the payment of an approved claim',
      operationId: 'expensePayClaim',
      description:
        'Finance marks an `approved` claim `paid`, recording the payment method and an optional remark. An approved claim can no longer be edited afterwards.',
      responses: {
        200: dataResponse(ClaimDetailSchema, 'The paid claim.'),
        ...apiErrorResponses,
        ...{
          400: apiErrorResponse(
            400,
            'The payment method is not one the application offers (`EXPENSE_INVALID_PAYMENT_METHOD`), or the claim is not approved (`EXPENSE_INVALID_STATUS`).',
          ),
        },
        404: claimNotFoundResponse,
      },
    }),
    apiValidator('param', ClaimParamsSchema),
    apiValidator('json', ClaimPayInputSchema),
    async (context) =>
      context.json({
        data: await service.act(
          actorOf(context),
          context.req.valid('param').claimId,
          'pay',
          {
            paymentMethod: context.req.valid('json').paymentMethod,
            paymentRemark: context.req.valid('json').paymentRemark,
          },
        ),
      }),
  );

  router.get(
    '/expenseStats',
    describeRoute({
      tags,
      summary: 'Summarize the claims the signed-in user may see',
      operationId: 'expenseGetStats',
      description:
        'Totals, plus a breakdown by submission month, by department and by status. It answers over the same scoped set the list does, so the dashboard never shows a claim the list would hide. Accepts the same filters as the list.',
      responses: {
        200: dataResponse(ExpenseStatsSchema),
        ...sessionOnlyResponses,
      },
    }),
    apiValidator('query', ClaimFilterQuerySchema),
    async (context) =>
      context.json({
        data: await service.stats(
          actorOf(context),
          toFilterQuery(context.req.valid('query')),
        ),
      }),
  );

  router.post(
    '/expenseExports',
    describeRoute({
      tags,
      summary: 'Start a batch export of the visible claims',
      operationId: 'expenseCreateExport',
      description:
        'Answers immediately with a job. The work runs in the background, so the user can keep working; the page polls `GET /expenseExports/:exportId` for progress and then downloads the result. The filter is snapshotted with the job and re-scoped when the job runs, so a job can never widen the requester’s access.',
      responses: {
        201: dataResponse(ExportJobSchema, 'The queued export job.'),
        ...sessionOnlyResponses,
      },
    }),
    apiValidator('json', ExportFilterInputSchema),
    async (context) =>
      context.json(
        {
          data: await service.startExport(
            actorOf(context),
            toFilterQuery(context.req.valid('json')),
          ),
        },
        201,
      ),
  );

  router.get(
    '/expenseExports',
    describeRoute({
      tags,
      summary: "List the signed-in user's recent export jobs",
      operationId: 'expenseListExports',
      description:
        'The last 20 jobs the caller started, newest first. Another user’s jobs are never listed.',
      responses: {
        200: listResponse(
          ExportJobSchema,
          ExpenseCountMetaSchema,
          'The caller’s recent jobs.',
        ),
        ...sessionOnlyResponses,
      },
    }),
    async (context) => {
      const jobs = await service.listExports(actorOf(context));
      return context.json({ data: jobs, meta: { total: jobs.length } });
    },
  );

  router.get(
    '/expenseExports/:exportId',
    describeRoute({
      tags,
      summary: 'Read one export job and its progress',
      operationId: 'expenseGetExport',
      description:
        'Poll this while the page shows progress; `progress` reaches 100 only when the job completed.',
      responses: {
        200: dataResponse(ExportJobSchema),
        ...sessionOnlyResponses,
        404: exportNotFoundResponse,
      },
    }),
    apiValidator('param', ExportParamsSchema),
    async (context) =>
      context.json({
        data: await service.getExport(
          actorOf(context),
          context.req.valid('param').exportId,
        ),
      }),
  );

  router.get(
    '/expenseExports/:exportId/download',
    describeRoute({
      tags,
      summary: 'Download the result of a completed export',
      operationId: 'expenseDownloadExport',
      description:
        'Answers the CSV itself, not a JSON envelope. Only the completed job’s own requester may download it; an unfinished job answers `EXPENSE_INVALID_STATUS`.',
      responses: {
        200: {
          description:
            'The export as a UTF-8 CSV file, with a BOM so Excel reads the Chinese headers correctly.',
          content: { 'text/csv': { schema: { type: 'string' } } },
        },
        ...sessionOnlyResponses,
        400: apiErrorResponse(
          400,
          'The export has not finished yet (`EXPENSE_INVALID_STATUS`).',
        ),
        404: exportNotFoundResponse,
      },
    }),
    apiValidator('param', ExportParamsSchema),
    async (context) => {
      const file = await service.getExportContent(
        actorOf(context),
        context.req.valid('param').exportId,
      );
      const asciiName = file.filename
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/"/g, '_');
      return context.body(file.content, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${asciiName}"`,
        // The result is derived per request from live data; never let a proxy or browser reuse it.
        'Cache-Control': 'no-store',
      });
    },
  );

  return router;
}

export const expenseRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    // The mounted router carries the typed context; the contribution's own router stays untyped because
    // `AppRouterFactory` is declared over `Hono` and only has to move requests into it.
    const router = new Hono();
    router.route('/', createExpenseRouter(app));
    return router;
  });
