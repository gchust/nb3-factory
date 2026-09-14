import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  type AuthEnv,
  authenticationToken,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
  type AuthorizationScope,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import type { RetailService } from '../providers/retail/service.js';
import { retailServiceToken } from '../providers/retail/tokens.js';
import {
  RetailError,
  type CreateOrderInput,
  type OrderStatus,
  type ProductCategory,
  type ProductInput,
  type ProductListFilters,
  type ProductStatus,
  type PurchaseInput,
} from '../providers/retail/types.js';

const PRODUCT_PUBLIC_FIELDS = [
  'id',
  'name',
  'barcode',
  'category',
  'price',
  'stock',
  'status',
  'images',
  'createdAt',
  'updatedAt',
] as const;

const PRODUCT_FULL_FIELDS = [...PRODUCT_PUBLIC_FIELDS, 'cost'] as const;

const ORDER_FIELDS = [
  'id',
  'orderNumber',
  'storeName',
  'cashierId',
  'cashierName',
  'originalAmount',
  'discountPercent',
  'discountAmount',
  'payableAmount',
  'paymentMethod',
  'status',
  'soldAt',
  'returnedAt',
  'createdAt',
] as const;

const PURCHASE_FIELDS = [
  'id',
  'productId',
  'productName',
  'quantity',
  'unitCost',
  'supplier',
  'purchaseDate',
  'createdById',
  'createdByName',
  'createdAt',
] as const;

const ORDER_CREATE_INPUT = [
  'storeName',
  'paymentMethod',
  'discountPercent',
] as const;
const ORDER_CREATE_OUTPUT = [
  'id',
  'orderNumber',
  'storeName',
  'originalAmount',
  'discountPercent',
  'discountAmount',
  'payableAmount',
  'paymentMethod',
  'status',
  'soldAt',
] as const;
const ITEM_CREATE_INPUT = ['productId', 'quantity'] as const;
const PURCHASE_CREATE_INPUT = [
  'productId',
  'quantity',
  'unitCost',
  'supplier',
  'purchaseDate',
] as const;

type RetailVariables = AuthorizationEnv['Variables'] & AuthEnv['Variables'];
type RetailEnv = { Variables: RetailVariables };
type RetailContext = Context<RetailEnv>;
type Handler = (context: RetailContext) => Promise<Response>;

type Decision = {
  effect: string;
  conditions?: { type?: string; [key: string]: unknown };
};

const COLLECTION_PREFIX = 'main.';

export const retailApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<RetailEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization =
      app.container.resolve<AppAuthorization>(authorizationToken);
    const service = app.container.resolve<RetailService>(retailServiceToken);

    // This sub-router only owns `/retail`, so the wildcard below cannot leak into another route.
    routes.use(
      '*',
      auth.required() as unknown as MiddlewareHandler<RetailEnv>,
      authorization.middleware() as unknown as MiddlewareHandler<RetailEnv>,
    );

    routes.get(
      '/products',
      handle(async (context) =>
        context.json({
          data: await service.listProducts(
            readProductFilters(context),
            await requireConditions(context, 'retailProducts', 'read', {
              output: [...PRODUCT_PUBLIC_FIELDS],
            }),
          ),
        }),
      ),
    );

    // Carries the cost price, so it is a separate route a cashier is not authorized for.
    routes.get(
      '/products/manage',
      handle(async (context) =>
        context.json({
          data: await service.listProducts(
            readProductFilters(context),
            await requireConditions(context, 'retailProducts', 'read', {
              output: [...PRODUCT_FULL_FIELDS],
            }),
          ),
        }),
      ),
    );

    routes.post(
      '/products',
      handle(async (context) => {
        const input = await context.req.json<ProductInput>();
        const conditions = await authorize(
          context,
          'retailProducts',
          'create',
          { input: Object.keys(input ?? {}), output: ['id'] },
        );
        return context.json(
          { data: await service.createProduct(input, conditions) },
          201,
        );
      }),
    );

    routes.patch(
      '/products/:id',
      handle(async (context) => {
        const id = requireId(context);
        const input = await context.req.json<Partial<ProductInput>>();
        const conditions = await authorize(
          context,
          'retailProducts',
          'update',
          { input: Object.keys(input ?? {}), output: ['id'] },
        );
        return context.json({
          data: await service.updateProduct(id, input, conditions),
        });
      }),
    );

    routes.get(
      '/sales-orders',
      handle(async (context) => {
        const conditions = await requireConditions(
          context,
          'retailSalesOrders',
          'read',
          { output: [...ORDER_FIELDS] },
        );
        const search = context.req.query();
        return context.json({
          data: await service.listOrders(
            {
              ...(search.from ? { from: search.from } : {}),
              ...(search.to ? { to: search.to } : {}),
              ...(search.status
                ? { status: search.status as OrderStatus }
                : {}),
              ...(search.limit ? { limit: Number(search.limit) } : {}),
            },
            conditions,
          ),
        });
      }),
    );

    routes.post(
      '/sales-orders',
      handle(async (context) => {
        const input = await context.req.json<CreateOrderInput>();
        const orderConditions = await authorize(
          context,
          'retailSalesOrders',
          'create',
          {
            input: [...ORDER_CREATE_INPUT],
            output: [...ORDER_CREATE_OUTPUT],
          },
        );
        const itemConditions = await authorize(
          context,
          'retailSalesOrderItems',
          'create',
          { input: [...ITEM_CREATE_INPUT], output: ['id'] },
        );
        const created = await service.createOrder(
          input,
          principal(context),
          orderConditions,
          itemConditions,
        );
        return context.json({ data: created }, 201);
      }),
    );

    routes.post(
      '/sales-orders/:id/return',
      handle(async (context) => {
        const id = requireId(context);
        const orderConditions = await authorize(
          context,
          'retailSalesOrders',
          'update',
          { input: ['status', 'returnedAt'], output: ['id', 'status'] },
        );
        const productConditions = await authorize(
          context,
          'retailProducts',
          'update',
          { input: ['stock'], output: ['id'] },
        );
        return context.json({
          data: await service.returnOrder(
            id,
            orderConditions,
            productConditions,
          ),
        });
      }),
    );

    routes.get(
      '/purchases',
      handle(async (context) =>
        context.json({
          data: await service.listPurchases(
            await requireConditions(context, 'retailPurchaseOrders', 'read', {
              output: [...PURCHASE_FIELDS],
            }),
          ),
        }),
      ),
    );

    routes.post(
      '/purchases',
      handle(async (context) => {
        const input = await context.req.json<PurchaseInput>();
        const purchaseConditions = await authorize(
          context,
          'retailPurchaseOrders',
          'create',
          { input: [...PURCHASE_CREATE_INPUT], output: ['id'] },
        );
        const productConditions = await authorize(
          context,
          'retailProducts',
          'update',
          { input: ['stock'], output: ['id'] },
        );
        return context.json(
          {
            data: await service.createPurchase(
              input,
              principal(context),
              purchaseConditions,
              productConditions,
            ),
          },
          201,
        );
      }),
    );

    routes.get(
      '/reports/daily',
      handle(async (context) =>
        context.json({
          data: await service.dailyReport(
            context.req.query('date'),
            await requireConditions(context, 'retailSalesOrders', 'read', {
              output: [...ORDER_FIELDS],
            }),
          ),
        }),
      ),
    );

    // Capabilities drive which actions the interface offers. The server stays the authority:
    // every mutating route re-checks the same permission.
    routes.get(
      '/access',
      handle(async (context) => {
        const scope = context.get('authz');
        const [
          createOrder,
          manageProducts,
          registerPurchase,
          returnOrder,
          viewSales,
          viewReports,
        ] = await Promise.all([
          canPerform(scope, 'retailSalesOrders', 'create'),
          canPerform(scope, 'retailProducts', 'update'),
          canPerform(scope, 'retailPurchaseOrders', 'create'),
          canPerform(scope, 'retailSalesOrders', 'update'),
          scope.can({
            resource: { type: 'page', id: 'sales' },
            action: 'access',
          }),
          scope.can({
            resource: { type: 'page', id: 'reports' },
            action: 'access',
          }),
        ]);
        return context.json({
          data: {
            createOrder,
            manageProducts,
            registerPurchase,
            returnOrder,
            viewSales,
            viewReports,
          },
        });
      }),
    );

    router.route('/retail', routes);
    return router;
  });

function collection(name: string): { type: string; id: string } {
  return { type: 'database.collection', id: `${COLLECTION_PREFIX}${name}` };
}

/**
 * A database authorization decision is `conditional` when allowed and `deny` when not, so asking
 * `can()` (which expects `permit`) would always answer false. This reports whether the action is
 * not denied.
 */
async function canPerform(
  scope: AuthorizationScope,
  resource: string,
  action: string,
): Promise<boolean> {
  const decision = await scope.authorize({
    resource: collection(resource),
    action,
  });
  return decision.effect !== 'deny';
}

function readProductFilters(context: RetailContext): ProductListFilters {
  const query = context.req.query();
  return {
    ...(query.category ? { category: query.category as ProductCategory } : {}),
    ...(query.status ? { status: query.status as ProductStatus } : {}),
    ...(query.search ? { search: query.search } : {}),
    ...(query.onSaleOnly === 'true' ? { onSaleOnly: true } : {}),
  };
}

async function authorize(
  context: RetailContext,
  resource: string,
  action: string,
  fields: { input?: readonly string[]; output?: readonly string[] },
): Promise<DatabaseAuthorizationConditions> {
  const decision = await context.get('authz').authorize({
    resource: collection(resource),
    action,
    params: { fields: { ...fields } },
  } as never);
  return requireDatabaseConditions(decision);
}

async function requireConditions(
  context: RetailContext,
  resource: string,
  action: string,
  fields: { input?: readonly string[]; output?: readonly string[] },
): Promise<DatabaseAuthorizationConditions> {
  return authorize(context, resource, action, fields);
}

function requireDatabaseConditions(
  decision: Decision,
): DatabaseAuthorizationConditions {
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    throw new RetailError(
      'AUTHORIZATION_DENIED',
      'You are not allowed to perform this action.',
      403,
    );
  }
  return decision.conditions as unknown as DatabaseAuthorizationConditions;
}

function principal(context: RetailContext): { id: string; name: string } {
  const identity = context.get('authz').identity;
  const session = context.get('auth') as
    | { user?: { name?: string; username?: string; email?: string } }
    | null
    | undefined;
  const name =
    session?.user?.name ??
    session?.user?.username ??
    session?.user?.email ??
    identity.principal.id;
  return { id: identity.principal.id, name: String(name) };
}

function requireId(context: RetailContext): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new RetailError('VALIDATION_ERROR', 'Invalid record id.', 400);
  }
  return id;
}

/** Turns a domain failure into its stable error code and status; anything else is a real error. */
function handle(handler: Handler): Handler {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (error instanceof RetailError) {
        return context.json(
          {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
          error.status as never,
        );
      }
      if (error instanceof SyntaxError) {
        return context.json(
          { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' },
          400,
        );
      }
      throw error;
    }
  };
}
