import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  itAccessToken,
  type ItAccessService,
  type ItRole,
} from '../providers/it-access.js';
import {
  ItError,
  itServiceToken,
  type ItService,
} from '../providers/it-service.js';

/**
 * HTTP boundary for the IT operations suite.
 *
 * Every path is authenticated and every mutating path is role-checked on the server; the client-side
 * page access rules and hidden navigation are convenience only. Ticket reads are scoped for the
 * employee role inside `listWorkOrders`/`getWorkOrder`, not by filtering the response afterwards.
 */

const ENGINEER_ROLES: readonly ItRole[] = ['administrator', 'engineer'];
const ANY_ROLE: readonly ItRole[] = ['administrator', 'engineer', 'employee'];

interface AssetBody {
  assetCode?: string;
  name?: string;
  category?: string;
  brandModel?: string | null;
  purchaseDate?: string | null;
  purchaseAmount?: number | string | null;
  status?: string;
  currentHolder?: string | null;
  fileIds?: readonly string[];
}

interface AssignmentBody {
  assetId?: number;
  employeeName?: string;
  assignedAt?: string | null;
  note?: string | null;
}

interface WorkOrderBody {
  assetId?: number | null;
  location?: string | null;
  description?: string;
  priority?: string;
  fileIds?: readonly string[];
}

export const itApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const access = app.container.resolve<ItAccessService>(itAccessToken);
    const it = app.container.resolve<ItService>(itServiceToken);
    const router = new Hono<AuthEnv>();

    router.use('/it/*', auth.required());

    const currentUser = (context: Context<AuthEnv>) => {
      const session = context.get('auth');
      if (!session) {
        throw new ItError('UNAUTHENTICATED', '请先登录。', 401);
      }
      return session.user;
    };

    const roleOf = async (context: Context<AuthEnv>): Promise<ItRole> =>
      access.roleOf(String(currentUser(context).id));

    const guard = (role: ItRole, allowed: readonly ItRole[]): void => {
      if (!allowed.includes(role)) {
        throw new ItError('FORBIDDEN', '当前账号没有执行该操作的权限。', 403);
      }
    };

    const handle = async (
      context: Context<AuthEnv>,
      action: () => Promise<Response>,
    ): Promise<Response> => {
      try {
        return await action();
      } catch (error) {
        if (error instanceof ItError) {
          return context.json(
            { code: error.code, message: error.message },
            error.status as ContentfulStatusCode,
          );
        }
        throw error;
      }
    };

    // Who the caller is and what they may do; the client uses this for role-aware navigation.
    router.get('/it/me', (context) =>
      handle(context, async () => {
        const user = currentUser(context);
        const role = await roleOf(context);
        return context.json({
          data: {
            id: String(user.id),
            name: userName(user),
            role,
            canManageAssets: ENGINEER_ROLES.includes(role),
            canHandleWorkOrders: ENGINEER_ROLES.includes(role),
          },
        });
      }),
    );

    router.get('/it/assets', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        const data = await it.listAssets({
          category: context.req.query('category') || undefined,
          status: context.req.query('status') || undefined,
          search: context.req.query('search') || undefined,
        });
        return context.json({ data });
      }),
    );

    router.get('/it/assets/:id', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        return context.json({
          data: await it.getAsset(Number(context.req.param('id'))),
        });
      }),
    );

    router.post('/it/assets', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        const body = await context.req.json<AssetBody>();
        return context.json(
          { data: await it.createAsset(normalizeAsset(body)) },
          201,
        );
      }),
    );

    router.patch('/it/assets/:id', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        const body = await context.req.json<AssetBody>();
        return context.json({
          data: await it.updateAsset(
            Number(context.req.param('id')),
            normalizeAsset(body),
          ),
        });
      }),
    );

    router.delete('/it/assets/:id', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        await it.deleteAsset(Number(context.req.param('id')));
        return context.json({ data: { deleted: true } });
      }),
    );

    router.get('/it/asset-assignments', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        const assetId = context.req.query('assetId');
        return context.json({
          data: await it.listAssignments(
            assetId ? { assetId: Number(assetId) } : undefined,
          ),
        });
      }),
    );

    router.post('/it/asset-assignments', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        const body = await context.req.json<AssignmentBody>();
        if (typeof body.assetId !== 'number') {
          throw new ItError('INVALID_INPUT', '必须选择资产。');
        }
        return context.json(
          {
            data: await it.createAssignment({
              assetId: body.assetId,
              employeeName: body.employeeName ?? '',
              assignedAt: body.assignedAt ?? null,
              note: body.note ?? null,
            }),
          },
          201,
        );
      }),
    );

    router.post('/it/asset-assignments/:id/return', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        const body = await context.req
          .json<{ returnedAt?: string | null }>()
          .catch(() => ({ returnedAt: null }));
        return context.json({
          data: await it.returnAssignment(
            Number(context.req.param('id')),
            body.returnedAt ?? null,
          ),
        });
      }),
    );

    router.get('/it/work-orders', (context) =>
      handle(context, async () => {
        const role = await roleOf(context);
        guard(role, ANY_ROLE);
        const user = currentUser(context);
        const data = await it.listWorkOrders(
          role === 'employee' ? { reporterId: String(user.id) } : undefined,
        );
        return context.json({ data });
      }),
    );

    router.post('/it/work-orders', (context) =>
      handle(context, async () => {
        const role = await roleOf(context);
        guard(role, ANY_ROLE);
        const user = currentUser(context);
        const body = await context.req.json<WorkOrderBody>();
        return context.json(
          {
            data: await it.createWorkOrder({
              reporterName: userName(user),
              reporterId: String(user.id),
              assetId: body.assetId ?? null,
              location: body.location ?? null,
              description: body.description ?? '',
              priority: body.priority ?? '',
              fileIds: body.fileIds ?? [],
            }),
          },
          201,
        );
      }),
    );

    router.get('/it/work-orders/:id', (context) =>
      handle(context, async () => {
        const role = await roleOf(context);
        guard(role, ANY_ROLE);
        const user = currentUser(context);
        const order = await it.getWorkOrder(Number(context.req.param('id')));
        if (role === 'employee' && order.reporterId !== String(user.id)) {
          return context.json(
            { code: 'FORBIDDEN', message: '无权查看他人的工单。' },
            403,
          );
        }
        return context.json({ data: order });
      }),
    );

    router.post('/it/work-orders/:id/transition', (context) =>
      handle(context, async () => {
        const role = await roleOf(context);
        guard(role, ENGINEER_ROLES);
        const body = await context.req.json<{ status?: string }>();
        return context.json({
          data: await it.transitionWorkOrder(
            Number(context.req.param('id')),
            body.status ?? '',
            userName(currentUser(context)),
          ),
        });
      }),
    );

    router.post('/it/work-orders/:id/logs', (context) =>
      handle(context, async () => {
        const role = await roleOf(context);
        guard(role, ENGINEER_ROLES);
        const body = await context.req.json<{ content?: string }>();
        return context.json(
          {
            data: await it.addWorkOrderLog(
              Number(context.req.param('id')),
              body.content ?? '',
              userName(currentUser(context)),
            ),
          },
          201,
        );
      }),
    );

    router.get('/it/dashboard', (context) =>
      handle(context, async () => {
        guard(await roleOf(context), ENGINEER_ROLES);
        return context.json({ data: await it.dashboard() });
      }),
    );

    return router as unknown as import('hono').Hono;
  });

function normalizeAsset(body: AssetBody) {
  return {
    assetCode: body.assetCode,
    name: body.name,
    category: body.category,
    brandModel: body.brandModel,
    purchaseDate: body.purchaseDate,
    purchaseAmount:
      body.purchaseAmount === null || body.purchaseAmount === undefined
        ? null
        : Number(body.purchaseAmount),
    status: body.status,
    currentHolder: body.currentHolder,
    fileIds: body.fileIds,
  } as Parameters<ItService['createAsset']>[0];
}

function userName(user: {
  name?: string | null;
  email?: string | null;
  username?: string | null;
}): string {
  return user.name || user.username || user.email || 'User';
}
