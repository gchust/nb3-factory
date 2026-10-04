import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import {
  OPPORTUNITY_STAGES,
  SalesNotFoundError,
  SalesValidationError,
  salesServiceToken,
} from '../providers/sales-service.js';

const stageSchema = z.enum(OPPORTUNITY_STAGES);

const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  industry: z.string().trim().max(64).nullish(),
});
const customerUpdateSchema = customerCreateSchema.partial();

const contactCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  phone: z.string().trim().max(32).nullish(),
  email: z.string().trim().max(128).nullish(),
  customerId: z.number().int().positive(),
});
const contactUpdateSchema = contactCreateSchema.partial();

const opportunityCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  customerId: z.number().int().positive(),
  // Non-negative: the requirement the interface also states.
  amount: z.number().min(0).max(99_999_999_999.99),
  stage: stageSchema,
});
const opportunityUpdateSchema = opportunityCreateSchema.partial();

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function parseId(context: Context): number | undefined {
  const value = Number(context.req.param('id'));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Runs a handler and turns a domain failure into its HTTP response. Keeping it
 * here means each route reads as the one operation it performs, while the
 * status mapping stays in one place.
 */
async function respond<T>(
  context: Context,
  run: () => Promise<T>,
  status: 200 | 201 = 200,
): Promise<Response> {
  try {
    return context.json({ data: await run() }, status);
  } catch (error) {
    if (error instanceof SalesNotFoundError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        404,
      );
    }
    if (error instanceof SalesValidationError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        400,
      );
    }
    throw error;
  }
}

/**
 * Authenticated JSON API for customers, contacts and opportunities.
 *
 * Every path under `/sales` carries its own sign-in check; mounting the route
 * under `/api` authenticates nothing on its own. The domain logic lives in the
 * sales service, so these handlers only parse, delegate and map errors.
 */
export const salesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const sales = () => app.container.resolve(salesServiceToken);

    routes.use('*', auth.required());

    // Customers

    routes.get('/customers', (context) =>
      respond(context, () => sales().listCustomers()),
    );

    routes.get('/customers/:id', (context) =>
      respond(context, async () => {
        const id = parseId(context);
        if (id === undefined) throw new SalesValidationError('Invalid id.');
        const detail = await sales().getCustomerDetail(id);
        if (!detail) throw new SalesNotFoundError('customer');
        return detail;
      }),
    );

    routes.post('/customers', (context) =>
      respond(
        context,
        async () => {
          const parsed = customerCreateSchema.safeParse(
            await readJson(context),
          );
          if (!parsed.success) throw new SalesValidationError('Invalid input.');
          return await sales().createCustomer(parsed.data);
        },
        201,
      ),
    );

    routes.patch('/customers/:id', (context) =>
      respond(context, async () => {
        const id = parseId(context);
        if (id === undefined) throw new SalesValidationError('Invalid id.');
        const parsed = customerUpdateSchema.safeParse(await readJson(context));
        if (!parsed.success) throw new SalesValidationError('Invalid input.');
        return await sales().updateCustomer(id, parsed.data);
      }),
    );

    // Contacts

    routes.get('/contacts', (context) =>
      respond(context, async () => {
        const raw = context.req.query('customerId');
        if (raw === undefined) return await sales().listContacts();
        const customerId = Number(raw);
        if (!(Number.isInteger(customerId) && customerId > 0)) {
          throw new SalesValidationError('Invalid customerId.');
        }
        return await sales().listContacts(customerId);
      }),
    );

    routes.get('/contacts/:id', (context) =>
      respond(context, async () => {
        const id = parseId(context);
        if (id === undefined) throw new SalesValidationError('Invalid id.');
        const contact = await sales().getContact(id);
        if (!contact) throw new SalesNotFoundError('contact');
        return contact;
      }),
    );

    routes.post('/contacts', (context) =>
      respond(
        context,
        async () => {
          const parsed = contactCreateSchema.safeParse(await readJson(context));
          if (!parsed.success) throw new SalesValidationError('Invalid input.');
          return await sales().createContact(parsed.data);
        },
        201,
      ),
    );

    routes.patch('/contacts/:id', (context) =>
      respond(context, async () => {
        const id = parseId(context);
        if (id === undefined) throw new SalesValidationError('Invalid id.');
        const parsed = contactUpdateSchema.safeParse(await readJson(context));
        if (!parsed.success) throw new SalesValidationError('Invalid input.');
        return await sales().updateContact(id, parsed.data);
      }),
    );

    // Opportunities

    routes.get('/opportunities', (context) =>
      respond(context, async () => {
        const raw = context.req.query('stage');
        if (raw === undefined) return await sales().listOpportunities();
        const parsed = stageSchema.safeParse(raw);
        if (!parsed.success) {
          throw new SalesValidationError('Unknown stage.');
        }
        return await sales().listOpportunities(parsed.data);
      }),
    );

    routes.get('/opportunities/:id', (context) =>
      respond(context, async () => {
        const id = parseId(context);
        if (id === undefined) throw new SalesValidationError('Invalid id.');
        const opportunity = await sales().getOpportunity(id);
        if (!opportunity) throw new SalesNotFoundError('opportunity');
        return opportunity;
      }),
    );

    routes.post('/opportunities', (context) =>
      respond(
        context,
        async () => {
          const parsed = opportunityCreateSchema.safeParse(
            await readJson(context),
          );
          if (!parsed.success) throw new SalesValidationError('Invalid input.');
          return await sales().createOpportunity(parsed.data);
        },
        201,
      ),
    );

    routes.patch('/opportunities/:id', (context) =>
      respond(context, async () => {
        const id = parseId(context);
        if (id === undefined) throw new SalesValidationError('Invalid id.');
        const parsed = opportunityUpdateSchema.safeParse(
          await readJson(context),
        );
        if (!parsed.success) throw new SalesValidationError('Invalid input.');
        return await sales().updateOpportunity(id, parsed.data);
      }),
    );

    router.route('/sales', routes);
    return router;
  });
