import {
  authenticationToken,
  userAdministrationServiceToken,
  UserAdministrationError,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ASSIGNABLE_ROLES,
  isAssignableRole,
  ProductionError,
  TEAM_LEADER_ROLE,
  type Actor,
} from '../providers/production-domain.js';
import { productionServiceToken } from '../providers/production-provider.js';
import { ensureApplicationRoles } from '../providers/production-roles.js';
import type { ProductionService } from '../providers/production-service.js';

type JsonObject = Record<string, unknown>;

/** Coerces an untyped request value to text without ever stringifying an object. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function optionalText(value: unknown): string | null {
  const result = text(value).trim();
  return result ? result : null;
}

function numeric(value: unknown): number {
  return typeof value === 'number' ? value : Number(text(value));
}

interface SessionUser {
  readonly id: string;
  readonly name?: string | null;
  readonly username?: string | null;
}

const statusByUserError: Record<string, number> = {
  USER_EMAIL_CONFLICT: 409,
  USER_USERNAME_CONFLICT: 409,
  USER_IDENTITY_CONFLICT: 409,
  PASSWORD_TOO_SHORT: 400,
  PASSWORD_TOO_LONG: 400,
  USER_NOT_FOUND: 404,
};

function respondError(context: Context, error: unknown): Response {
  if (error instanceof ProductionError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof UserAdministrationError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      (statusByUserError[error.code] ?? 400) as ContentfulStatusCode,
    );
  }
  throw error;
}

async function handle(
  context: Context,
  action: () => Promise<unknown>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    const data = await action();
    return context.json({ data }, status);
  } catch (error) {
    return respondError(context, error);
  }
}

async function body(context: Context): Promise<JsonObject> {
  try {
    const parsed: unknown = await context.req.json();
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new ProductionError(
        'INVALID_INPUT',
        'Request body must be an object',
      );
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof ProductionError) throw error;
    throw new ProductionError(
      'INVALID_INPUT',
      'Request body must be valid JSON',
    );
  }
}

async function currentActor(
  context: Context,
  production: ProductionService,
): Promise<Actor> {
  const session = context.get('auth') as { user?: SessionUser } | undefined;
  const user = session?.user;
  if (!user?.id) {
    throw new ProductionError('UNAUTHENTICATED', 'Sign in is required', 401);
  }
  const displayName = user.name?.trim() || user.username?.trim() || user.id;
  return production.resolveActor(user.id, displayName);
}

function idParam(context: Context): number {
  const value = Number(context.req.param('id'));
  if (!Number.isInteger(value) || value <= 0) {
    throw new ProductionError('NOT_FOUND', 'Record not found', 404);
  }
  return value;
}

export const productionApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const production = app.container.resolve(productionServiceToken);
    const database = app.container.has(databaseManagerToken)
      ? app.container.resolve(databaseManagerToken)
      : undefined;
    const authorization = app.container.has(authorizationToken)
      ? app.container.resolve<AppAuthorization>(authorizationToken)
      : undefined;
    const userAdministration = app.container.has(userAdministrationServiceToken)
      ? app.container.resolve(userAdministrationServiceToken)
      : undefined;

    const authenticated = new Hono();
    authenticated.use('*', auth.required());

    authenticated.get('/me', (context) =>
      handle(context, async () => {
        const actor = await currentActor(context, production);
        return { ...actor, capabilities: production.capabilitiesFor(actor) };
      }),
    );

    authenticated.get('/products', (context) =>
      handle(context, async () => {
        await currentActor(context, production);
        return production.listProducts();
      }),
    );

    authenticated.post('/products', (context) =>
      handle(
        context,
        async () => {
          const actor = await currentActor(context, production);
          const capabilities = production.capabilitiesFor(actor);
          if (!capabilities.canManageWorkOrders) {
            throw new ProductionError(
              'FORBIDDEN',
              'Only a production supervisor can manage products',
              403,
            );
          }
          const input = await body(context);
          return production.createProduct({
            code: text(input.code),
            name: text(input.name),
            specification: optionalText(input.specification),
            unit: input.unit === undefined ? undefined : text(input.unit),
            standardMinutes: numeric(input.standardMinutes),
          });
        },
        201,
      ),
    );

    authenticated.get('/teams', (context) =>
      handle(context, async () => {
        await currentActor(context, production);
        return production.listTeams();
      }),
    );

    authenticated.get('/work-orders', (context) =>
      handle(context, async () => {
        const actor = await currentActor(context, production);
        return production.listWorkOrders(production.scopeFor(actor));
      }),
    );

    authenticated.post('/work-orders', (context) =>
      handle(
        context,
        async () => {
          const actor = await currentActor(context, production);
          const input = await body(context);
          return production.createWorkOrder(
            {
              code: input.code === undefined ? undefined : text(input.code),
              productId: numeric(input.productId),
              plannedQuantity: numeric(input.plannedQuantity),
              plannedStartDate: optionalText(input.plannedStartDate),
              plannedEndDate: optionalText(input.plannedEndDate),
              teamId: numeric(input.teamId),
              processes: Array.isArray(input.processes)
                ? input.processes.map((process) => {
                    const record = (process ?? {}) as JsonObject;
                    return {
                      name: text(record.name),
                      plannedQuantity: numeric(record.plannedQuantity),
                      sequence:
                        record.sequence === undefined
                          ? undefined
                          : numeric(record.sequence),
                    };
                  })
                : [],
            },
            actor,
          );
        },
        201,
      ),
    );

    authenticated.get('/work-orders/:id', (context) =>
      handle(context, async () => {
        const actor = await currentActor(context, production);
        return production.getWorkOrderDetail(idParam(context), actor);
      }),
    );

    authenticated.patch('/work-orders/:id/status', (context) =>
      handle(context, async () => {
        const actor = await currentActor(context, production);
        const input = await body(context);
        await production.updateWorkOrderStatus(
          idParam(context),
          input.status,
          actor,
        );
        return { updated: true };
      }),
    );

    authenticated.post('/work-orders/:id/reports', (context) =>
      handle(
        context,
        async () => {
          const actor = await currentActor(context, production);
          const input = await body(context);
          return production.createWorkReport(
            idParam(context),
            {
              processId: numeric(input.processId),
              quantity: numeric(input.quantity),
              qualifiedQuantity: numeric(input.qualifiedQuantity),
              defectQuantity: numeric(input.defectQuantity),
              reportedAt: optionalText(input.reportedAt),
            },
            actor,
          );
        },
        201,
      ),
    );

    authenticated.post('/work-orders/:id/defects', (context) =>
      handle(
        context,
        async () => {
          const actor = await currentActor(context, production);
          const input = await body(context);
          return production.createDefectRecord(
            idParam(context),
            {
              workReportId: numeric(input.workReportId),
              quantity: numeric(input.quantity),
              reason: text(input.reason),
              disposition: text(input.disposition),
            },
            actor,
          );
        },
        201,
      ),
    );

    authenticated.get('/defects', (context) =>
      handle(context, async () => {
        const actor = await currentActor(context, production);
        return production.listDefectRecords(production.scopeFor(actor));
      }),
    );

    authenticated.get('/statistics', (context) =>
      handle(context, async () => {
        const actor = await currentActor(context, production);
        return production.getStatistics(production.scopeFor(actor));
      }),
    );

    router.route('/production', authenticated);

    /**
     * Public registration options: the roles a visitor may self-assign and the teams they may join.
     * Read-only reference data with no personal information.
     */
    router.get('/staff/registration-options', (context) =>
      handle(context, async () => {
        const teams = await production.listTeams();
        return {
          roles: [...ASSIGNABLE_ROLES],
          teams,
        };
      }),
    );

    /**
     * Self-registration. Deliberately public: a visitor with no session creates their own account and
     * picks one of the non-administrative workshop roles. It can never grant the protected administrator
     * role, and a team leader must name an existing team.
     */
    router.post('/staff/register', async (context) => {
      return handle(
        context,
        async () => {
          if (!userAdministration || !authorization || !database) {
            throw new ProductionError(
              'REGISTRATION_UNAVAILABLE',
              'Registration is not available',
              503,
            );
          }
          const input = await body(context);
          const name = text(input.name).trim();
          const username = text(input.username).trim();
          const email = text(input.email).trim();
          const password = text(input.password);
          const role = text(input.role);
          if (!name || !username || !email || !password) {
            throw new ProductionError(
              'INVALID_INPUT',
              'Name, username, email and password are required',
            );
          }
          if (!isAssignableRole(role)) {
            throw new ProductionError(
              'ROLE_NOT_ASSIGNABLE',
              'The requested role cannot be self-assigned',
              403,
            );
          }
          let teamId: number | null = null;
          if (role === TEAM_LEADER_ROLE) {
            teamId = Number(input.teamId);
            if (!Number.isInteger(teamId) || teamId <= 0) {
              throw new ProductionError(
                'TEAM_REQUIRED',
                'A team leader must belong to a team',
              );
            }
            await production.assertTeamExists(teamId);
          }

          await ensureApplicationRoles(authorization);

          await database.transaction(async (connection) => {
            const user = await userAdministration
              .withConnection(connection)
              .create({ name, username, email, password });
            await authorization.permissionSets
              .withConnection(connection)
              .assign({
                permissionSet: role,
                subject: { type: 'user', id: user.id },
              });
            await production.insertStaffProfile(
              connection,
              user.id,
              role,
              teamId,
            );
          });

          return { registered: true, role };
        },
        201,
      );
    });

    return router;
  });

export default productionApiRoutes;
