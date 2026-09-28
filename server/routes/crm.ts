import {
  crmServiceToken,
  CrmError,
  type ContactInput,
  type CrmService,
  type CustomerInput,
  type OpportunityInput,
  type OpportunityStage,
} from '../providers/index.js';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Auth } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

interface CrmDependencies {
  readonly auth: Auth;
  readonly crm: CrmService;
}

/** Turn a domain failure into its HTTP response; anything else keeps propagating. */
async function guard(
  context: Context,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CrmError) {
      return context.json(
        {
          code: error.code,
          message: error.message,
          errors: error.details ?? null,
        },
        error.code === 'NOT_FOUND' ? 404 : 400,
      );
    }
    throw error;
  }
}

/** A body that is not valid JSON reads as an empty object, so each field's own validation reports it. */
async function readBody<T extends object>(context: Context): Promise<T> {
  return context.req.json<T>().catch(() => ({}) as T);
}

function createCustomerRoutes({ auth, crm }: CrmDependencies): Hono {
  const router = new Hono();
  // Every path this router owns requires a session; the middleware is scoped to
  // this sub-router so it cannot leak into another contribution.
  router.use('*', auth.required());

  router.get('/', (context) =>
    guard(context, async () =>
      context.json({ data: await crm.listCustomers() }),
    ),
  );

  router.post('/', (context) =>
    guard(context, async () =>
      context.json(
        {
          data: await crm.createCustomer(
            await readBody<CustomerInput>(context),
          ),
        },
        201,
      ),
    ),
  );

  router.get('/:id', (context) =>
    guard(context, async () =>
      context.json({
        data: await crm.getCustomer(Number(context.req.param('id'))),
      }),
    ),
  );

  router.patch('/:id', (context) =>
    guard(context, async () =>
      context.json({
        data: await crm.updateCustomer(
          Number(context.req.param('id')),
          await readBody<Partial<CustomerInput>>(context),
        ),
      }),
    ),
  );

  return router;
}

function createContactRoutes({ auth, crm }: CrmDependencies): Hono {
  const router = new Hono();
  router.use('*', auth.required());

  router.get('/', (context) => {
    const customerId = context.req.query('customerId');
    return guard(context, async () =>
      context.json({
        data: await crm.listContacts(
          customerId === undefined ? undefined : Number(customerId),
        ),
      }),
    );
  });

  router.post('/', (context) =>
    guard(context, async () =>
      context.json(
        {
          data: await crm.createContact(await readBody<ContactInput>(context)),
        },
        201,
      ),
    ),
  );

  router.patch('/:id', (context) =>
    guard(context, async () =>
      context.json({
        data: await crm.updateContact(
          Number(context.req.param('id')),
          await readBody<Partial<ContactInput>>(context),
        ),
      }),
    ),
  );

  return router;
}

function createOpportunityRoutes({ auth, crm }: CrmDependencies): Hono {
  const router = new Hono();
  router.use('*', auth.required());

  router.get('/', (context) => {
    const stage = context.req.query('stage');
    return guard(context, async () =>
      context.json({
        data: await crm.listOpportunities(
          stage as OpportunityStage | undefined,
        ),
      }),
    );
  });

  router.post('/', (context) =>
    guard(context, async () =>
      context.json(
        {
          data: await crm.createOpportunity(
            await readBody<OpportunityInput>(context),
          ),
        },
        201,
      ),
    ),
  );

  router.patch('/:id', (context) =>
    guard(context, async () =>
      context.json({
        data: await crm.updateOpportunity(
          Number(context.req.param('id')),
          await readBody<Partial<OpportunityInput>>(context),
        ),
      }),
    ),
  );

  return router;
}

export function createCrmApiRoutes(dependencies: CrmDependencies): Hono {
  const router = new Hono();
  router.route('/customers', createCustomerRoutes(dependencies));
  router.route('/contacts', createContactRoutes(dependencies));
  router.route('/opportunities', createOpportunityRoutes(dependencies));
  return router;
}

export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const crm = app.container.resolve(crmServiceToken);
    return createCrmApiRoutes({ auth, crm });
  });

export default crmApiRoutes;
