/**
 * The HR HTTP API, mounted under `/api/hr`.
 *
 * Every route authenticates, runs the authorization middleware, requires the
 * composite action it needs, validates its input, and delegates to
 * `HrService`. Domain failures arrive as `HrError` and are translated here
 * into the standard `/api` error body with the `hr` domain.
 */
import type { Application } from '@nocobase/app-server/application';
import { Hono, type Context } from 'hono';
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
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import { HR_ACTION, HR_RESOURCE, type HrAction } from '../hr/resources.js';
import { HrError, hrServiceToken, type HrService } from '../hr/service.js';
import type { HrActor } from '../hr/types.js';
import {
  DashboardSchema,
  DepartmentCreateInput,
  DepartmentIdParam,
  DepartmentSchema,
  DepartmentUpdateInput,
  EmployeeCreateInput,
  EmployeeIdParam,
  EmployeeLifecycleInput,
  EmployeeListQuery,
  EmployeeSchema,
  EmployeeUpdateInput,
  LeaveCreateInput,
  LeaveDecisionInput,
  LeaveListQuery,
  LeaveRequestIdParam,
  LeaveRequestSchema,
  LeaveUpdateInput,
  NotificationIdParam,
  NotificationSchema,
} from './schemas.js';

const TAG = 'HR';

/** Reads the authorization context the shared middleware installs on the request. */
const authzOf = (context: Context): AuthorizationContext =>
  context.get('authz' as never) as AuthorizationContext;

function listBody<T>(data: T[]): {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
} {
  return { data, meta: { total: data.length, page: 1, pageSize: data.length } };
}

export function createHrRouter(app: Application): Hono {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);

  router.onError((error, context) => {
    const apiError =
      error instanceof HrError
        ? new ApiError({
            status: error.status,
            reason: error.reason,
            domain: 'hr',
            message: error.message,
          })
        : error;
    return apiErrorHandler(apiError, context);
  });

  router.use('/hr/*', auth.required());
  router.use('/hr/*', authz.middleware());

  const service = (): HrService => app.container.resolve(hrServiceToken);

  /** Provisions sample data on first use, then resolves what this identity may do. */
  const actorOf = async (context: AuthorizationContext): Promise<HrActor> => {
    await service().ensureProvisioned();
    return service().resolveActor(context);
  };

  const require = async (
    context: AuthorizationContext,
    action: HrAction,
  ): Promise<void> => {
    // A composite action composes database grants, whose own decisions are
    // `conditional` because they carry a row scope. `require` rejects anything
    // other than a plain `permit`, so it cannot gate a composite; `can` is the
    // action-level check. Row scoping and field confidentiality are enforced by
    // the service, which is where a data scope that resolves to nothing turns
    // into an empty result rather than a refusal.
    if (await context.can({ resource: HR_RESOURCE, action })) return;
    throw new HrError(
      'PERMISSION_DENIED',
      'AUTHORIZATION_DENIED',
      `Missing permission: ${HR_RESOURCE.id}.${action}`,
    );
  };

  // --- dashboard ------------------------------------------------------------

  router.get(
    '/hr/dashboard',
    describeRoute({
      tags: [TAG],
      summary: 'HR dashboard counts for the signed-in user',
      operationId: 'hrGetDashboard',
      responses: {
        200: dataResponse(DashboardSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      return context.json({ data: await service().dashboard(actor) });
    },
  );

  router.get(
    '/hr/me',
    describeRoute({
      tags: [TAG],
      summary: 'The signed-in user’s own employee record',
      operationId: 'hrGetMe',
      responses: {
        200: dataResponse(EmployeeSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      if (!actor.employee) {
        throw new HrError(
          'NOT_FOUND',
          'HR_NO_EMPLOYEE_RECORD',
          'Your account is not linked to an employee record yet.',
        );
      }
      return context.json({
        data: await service().getEmployee(actor, actor.employee.id),
      });
    },
  );

  // --- departments ----------------------------------------------------------

  router.get(
    '/hr/departments',
    describeRoute({
      tags: [TAG],
      summary: 'List departments',
      operationId: 'hrListDepartments',
      responses: {
        200: listResponse(DepartmentSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.viewDepartments);
      return context.json(listBody(await service().listDepartments(actor)));
    },
  );

  router.post(
    '/hr/departments',
    describeRoute({
      tags: [TAG],
      summary: 'Create a department',
      operationId: 'hrCreateDepartment',
      responses: {
        200: dataResponse(DepartmentSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', DepartmentCreateInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.manageDepartments);
      return context.json({
        data: await service().createDepartment(
          actor,
          context.req.valid('json'),
        ),
      });
    },
  );

  router.patch(
    '/hr/departments/:departmentId',
    describeRoute({
      tags: [TAG],
      summary: 'Update a department',
      operationId: 'hrUpdateDepartment',
      responses: {
        200: dataResponse(DepartmentSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', DepartmentIdParam),
    apiValidator('json', DepartmentUpdateInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.manageDepartments);
      const { departmentId } = context.req.valid('param');
      return context.json({
        data: await service().updateDepartment(
          actor,
          departmentId,
          context.req.valid('json'),
        ),
      });
    },
  );

  // --- employees ------------------------------------------------------------

  router.get(
    '/hr/employees',
    describeRoute({
      tags: [TAG],
      summary: 'List employees visible to the signed-in user',
      operationId: 'hrListEmployees',
      responses: {
        200: listResponse(EmployeeSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', EmployeeListQuery),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.viewEmployees);
      return context.json(
        listBody(
          await service().listEmployees(actor, context.req.valid('query')),
        ),
      );
    },
  );

  router.get(
    '/hr/employees/:employeeId',
    describeRoute({
      tags: [TAG],
      summary: 'Get one employee',
      operationId: 'hrGetEmployee',
      responses: {
        200: dataResponse(EmployeeSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', EmployeeIdParam),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.viewEmployees);
      const { employeeId } = context.req.valid('param');
      return context.json({
        data: await service().getEmployee(actor, employeeId),
      });
    },
  );

  router.post(
    '/hr/employees',
    describeRoute({
      tags: [TAG],
      summary: 'Create an employee, optionally opening their account',
      operationId: 'hrCreateEmployee',
      responses: {
        200: dataResponse(EmployeeSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', EmployeeCreateInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.manageEmployees);
      return context.json({
        data: await service().createEmployee(actor, context.req.valid('json')),
      });
    },
  );

  router.patch(
    '/hr/employees/:employeeId',
    describeRoute({
      tags: [TAG],
      summary: 'Update an employee record',
      operationId: 'hrUpdateEmployee',
      responses: {
        200: dataResponse(EmployeeSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', EmployeeIdParam),
    apiValidator('json', EmployeeUpdateInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.manageEmployees);
      const { employeeId } = context.req.valid('param');
      return context.json({
        data: await service().updateEmployee(
          actor,
          employeeId,
          context.req.valid('json'),
        ),
      });
    },
  );

  router.post(
    '/hr/employees/:employeeId/lifecycle',
    describeRoute({
      tags: [TAG],
      summary: 'Onboard (open an account) or offboard (disable it) an employee',
      operationId: 'hrChangeEmployeeLifecycle',
      responses: {
        200: dataResponse(EmployeeSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', EmployeeIdParam),
    apiValidator('json', EmployeeLifecycleInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.manageEmployees);
      const { employeeId } = context.req.valid('param');
      const { action, ...options } = context.req.valid('json');
      return context.json({
        data: await service().changeEmployeeLifecycle(
          actor,
          employeeId,
          action,
          options,
        ),
      });
    },
  );

  // --- leave ----------------------------------------------------------------

  router.get(
    '/hr/leave-requests',
    describeRoute({
      tags: [TAG],
      summary: 'List leave requests visible to the signed-in user',
      operationId: 'hrListLeaveRequests',
      responses: {
        200: listResponse(LeaveRequestSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', LeaveListQuery),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.viewLeave);
      return context.json(
        listBody(
          await service().listLeaveRequests(actor, context.req.valid('query')),
        ),
      );
    },
  );

  router.post(
    '/hr/leave-requests',
    describeRoute({
      tags: [TAG],
      summary: 'Apply for leave',
      operationId: 'hrApplyLeave',
      responses: {
        200: dataResponse(LeaveRequestSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', LeaveCreateInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.applyLeave);
      return context.json({
        data: await service().applyLeave(actor, context.req.valid('json')),
      });
    },
  );

  router.patch(
    '/hr/leave-requests/:requestId',
    describeRoute({
      tags: [TAG],
      summary: 'Edit a pending request or resubmit a rejected one',
      operationId: 'hrUpdateLeaveRequest',
      responses: {
        200: dataResponse(LeaveRequestSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', LeaveRequestIdParam),
    apiValidator('json', LeaveUpdateInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.applyLeave);
      const { requestId } = context.req.valid('param');
      return context.json({
        data: await service().updateLeaveRequest(
          actor,
          requestId,
          context.req.valid('json'),
        ),
      });
    },
  );

  router.post(
    '/hr/leave-requests/:requestId/decision',
    describeRoute({
      tags: [TAG],
      summary: 'Approve or reject a leave request',
      operationId: 'hrDecideLeaveRequest',
      responses: {
        200: dataResponse(LeaveRequestSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', LeaveRequestIdParam),
    apiValidator('json', LeaveDecisionInput),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      await require(authzOf(context), HR_ACTION.decideLeave);
      const { requestId } = context.req.valid('param');
      const { decision, rejectionReason } = context.req.valid('json');
      return context.json({
        data: await service().decideLeaveRequest(
          actor,
          requestId,
          decision,
          rejectionReason,
        ),
      });
    },
  );

  // --- notifications --------------------------------------------------------

  router.get(
    '/hr/notifications',
    describeRoute({
      tags: [TAG],
      summary: 'List the signed-in user’s HR notifications',
      operationId: 'hrListNotifications',
      responses: {
        200: listResponse(NotificationSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      return context.json(listBody(await service().listNotifications(actor)));
    },
  );

  router.post(
    '/hr/notifications/:notificationId/read',
    describeRoute({
      tags: [TAG],
      summary: 'Mark an HR notification as read',
      operationId: 'hrMarkNotificationRead',
      responses: {
        200: dataResponse(NotificationSchema),
        ...apiErrorResponses,
        ...{ 404: apiErrorResponse(404) },
      },
    }),
    apiValidator('param', NotificationIdParam),
    async (context) => {
      const actor = await actorOf(authzOf(context));
      const { notificationId } = context.req.valid('param');
      return context.json({
        data: await service().markNotificationRead(actor, notificationId),
      });
    },
  );

  return router;
}

export const hrRoutes = defineApiRoutes<Application>((app) =>
  createHrRouter(app),
);
