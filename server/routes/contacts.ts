import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import {
  contactServiceToken,
  isContactDepartment,
  normalizeContactInput,
  type ContactDepartment,
} from '../providers/contacts.js';

function parseContactId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Address book REST endpoints under `/api/contacts`.
 *
 * Authentication is installed on an isolated sub-router mounted at the exact
 * prefix, so it covers every operation here and leaks into no other route. The
 * contacts service owns validation and data access; this layer only speaks HTTP.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const contacts = app.container.resolve(contactServiceToken);

    const contactsRouter = new Hono();
    contactsRouter.use('*', auth.required());

    contactsRouter.get('/', async (context) => {
      const search = context.req.query('search');
      const departmentParam = context.req.query('department');

      let department: ContactDepartment | undefined;
      if (departmentParam) {
        if (!isContactDepartment(departmentParam)) {
          return context.json({ code: 'CONTACT_DEPARTMENT_INVALID' }, 400);
        }
        department = departmentParam;
      }

      const data = await contacts.list({ search, department });
      return context.json({ data });
    });

    contactsRouter.post('/', async (context) => {
      const parsed = normalizeContactInput(
        await context.req.json().catch(() => null),
      );
      if (!parsed.ok) return context.json({ code: parsed.code }, 400);

      const contact = await contacts.create(parsed.value);
      return context.json({ data: contact }, 201);
    });

    contactsRouter.get('/:contactId', async (context) => {
      const id = parseContactId(context.req.param('contactId'));
      if (id === undefined) {
        return context.json({ code: 'CONTACT_NOT_FOUND' }, 404);
      }

      const contact = await contacts.get(id);
      if (!contact) return context.json({ code: 'CONTACT_NOT_FOUND' }, 404);
      return context.json({ data: contact });
    });

    contactsRouter.patch('/:contactId', async (context) => {
      const id = parseContactId(context.req.param('contactId'));
      if (id === undefined) {
        return context.json({ code: 'CONTACT_NOT_FOUND' }, 404);
      }

      const parsed = normalizeContactInput(
        await context.req.json().catch(() => null),
      );
      if (!parsed.ok) return context.json({ code: parsed.code }, 400);

      const contact = await contacts.update(id, parsed.value);
      if (!contact) return context.json({ code: 'CONTACT_NOT_FOUND' }, 404);
      return context.json({ data: contact });
    });

    contactsRouter.delete('/:contactId', async (context) => {
      const id = parseContactId(context.req.param('contactId'));
      if (id === undefined) {
        return context.json({ code: 'CONTACT_NOT_FOUND' }, 404);
      }

      const removed = await contacts.remove(id);
      if (!removed) return context.json({ code: 'CONTACT_NOT_FOUND' }, 404);
      return context.body(null, 204);
    });

    router.route('/contacts', contactsRouter);
    return router;
  },
);
