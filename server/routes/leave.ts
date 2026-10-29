import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import type { AuthSession } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AuthorizationContext } from '@nocobase/authorization';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import { leaveServiceToken } from '../providers/leave-provider.js';
import {
  CreateLeaveInput,
  DecideLeaveInput,
  LeaveCalendarMeta,
  LeaveCalendarQuery,
  LeaveListMeta,
  LeaveListQuery,
  LeaveParams,
  LeaveRequest,
  LeaveStatsSchema,
} from './schemas.js';

const tags = ['Leave'];
const APPROVAL = {
  resource: { type: 'settings', id: 'leave.approvals' },
  action: 'decide',
} as const;

type AppContext = Context<{
  Variables: { auth: AuthSession; authz: AuthorizationContext };
}>;

function authOf(context: Context): AuthSession {
  return (context as AppContext).get('auth');
}

function authzOf(context: Context): AuthorizationContext {
  return (context as AppContext).get('authz');
}

function requester(auth: NonNullable<AuthSession>) {
  return {
    id: auth.user.id,
    name: auth.user.name || auth.user.email || auth.user.id,
    email: auth.user.email,
  };
}

function approvalRequired(): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'LEAVE_APPROVAL_FORBIDDEN',
    domain: 'leave',
    message: 'Deciding leave requests requires the leave approval permission.',
  });
}

export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  const router = new Hono();
  const leaveRequests = new Hono();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const leave = container.resolve(leaveServiceToken);

  leaveRequests.onError((error, context) => apiErrorHandler(error, context));
  leaveRequests.use('*', authentication.required(), authorization.middleware());

  const canDecide = (context: Context) => authzOf(context).can(APPROVAL);

  /** Permission is decided before the body is validated, so an outsider learns nothing from it. */
  const requireDecision: MiddlewareHandler = async (context, next) => {
    if (!(await canDecide(context))) throw approvalRequired();
    await next();
  };

  leaveRequests.get(
    '/',
    describeRoute({
      tags,
      summary: 'List leave requests',
      operationId: 'leaveListRequests',
      description:
        'Lists the signed-in person’s requests, or all requests when `scope=team` is used by an approver.',
      responses: {
        200: listResponse(LeaveRequest, LeaveListMeta),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', LeaveListQuery),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const query = context.req.valid('query');
      if (query.scope === 'team' && !(await canDecide(context))) {
        throw approvalRequired();
      }
      const result = await leave.list(auth.user.id, query);
      return context.json({
        data: result.items,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
        },
      });
    },
  );

  leaveRequests.get(
    '/stats',
    describeRoute({
      tags,
      summary: 'Get leave statistics',
      operationId: 'leaveGetStats',
      description:
        'Counts the signed-in person’s pending and approved leave and, for an approver, all pending requests.',
      responses: {
        200: dataResponse(LeaveStatsSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const includeTeam = await canDecide(context);
      return context.json({
        data: await leave.stats(auth.user.id, includeTeam),
      });
    },
  );

  leaveRequests.get(
    '/calendar',
    describeRoute({
      tags,
      summary: 'Get the approved leave calendar',
      operationId: 'leaveGetCalendar',
      description:
        'Approved leave overlapping the requested month, shared by the team.',
      responses: {
        200: listResponse(LeaveRequest, LeaveCalendarMeta),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', LeaveCalendarQuery),
    async (context) => {
      const { month } = context.req.valid('query');
      const items = await leave.calendar(month);
      return context.json({
        data: items,
        meta: { month, total: items.length },
      });
    },
  );

  leaveRequests.post(
    '/',
    describeRoute({
      tags,
      summary: 'Submit a leave request',
      operationId: 'leaveCreateRequest',
      description:
        'Creates a pending request for the signed-in person. Dates are inclusive calendar dates; only working days are counted.',
      responses: {
        201: {
          ...dataResponse(LeaveRequest, 'The submitted request.'),
          description: 'The submitted request.',
        },
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateLeaveInput),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const input = context.req.valid('json');
      const created = await leave.create(requester(auth), input);
      context.status(201);
      return context.json({ data: created });
    },
  );

  leaveRequests.get(
    '/:requestId',
    describeRoute({
      tags,
      summary: 'Get a leave request',
      operationId: 'leaveGetRequest',
      description:
        'Returns the request to its owner or to an approver. A request belonging to somebody else is reported as not found.',
      responses: {
        200: dataResponse(LeaveRequest),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'No leave request with this id is visible to the caller (`LEAVE_REQUEST_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', LeaveParams),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const { requestId } = context.req.valid('param');
      const request = await leave.get(requestId);
      if (request.userId !== auth.user.id && !(await canDecide(context))) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'LEAVE_REQUEST_NOT_FOUND',
          domain: 'leave',
          message: `Leave request ${requestId} was not found.`,
        });
      }
      return context.json({ data: request });
    },
  );

  leaveRequests.patch(
    '/:requestId/status',
    requireDecision,
    describeRoute({
      tags,
      summary: 'Approve or reject a leave request',
      operationId: 'leaveDecideRequest',
      description:
        'Moves a pending request to `approved` or `rejected` once. Requires the `leave.approvals` `decide` grant.',
      responses: {
        200: dataResponse(LeaveRequest, 'The decided request.'),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'No leave request with this id is visible to the caller (`LEAVE_REQUEST_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', LeaveParams),
    apiValidator('json', DecideLeaveInput),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const { requestId } = context.req.valid('param');
      const input = context.req.valid('json');
      const decided = await leave.decide(
        requestId,
        { id: auth.user.id, name: requester(auth).name },
        input,
      );
      return context.json({ data: decided });
    },
  );

  router.route('/leaveRequests', leaveRequests);
  return router;
});

export default apiRoutes;
