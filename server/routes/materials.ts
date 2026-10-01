import { Hono } from 'hono';
import type { Context } from 'hono';
import { RepositoryError } from '@nocobase/db';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';

import {
  MaterialsNotPermittedError,
  materialsServiceToken,
  type MaterialsService,
} from '../materials/service.js';

type MaterialsEnv = {
  Variables: AuthorizationEnv['Variables'] & AuthEnv['Variables'];
};

type MaterialsContext = Context<MaterialsEnv>;

interface WriteBody {
  title?: unknown;
  content?: unknown;
}

function parseWriteBody(
  body: WriteBody,
): { ok: true; values: { title: string; content: string } } | { ok: false } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content : '';
  if (!title || !content.trim()) {
    return { ok: false };
  }
  return { ok: true, values: { title, content } };
}

function parseId(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

function forbidden(context: MaterialsContext, message: string) {
  return context.json({ code: 'FORBIDDEN', message }, 403);
}

function notFound(context: MaterialsContext) {
  return context.json({ code: 'NOT_FOUND' }, 404);
}

async function readJson<T>(context: MaterialsContext): Promise<T | undefined> {
  try {
    return await context.req.json<T>();
  } catch {
    return undefined;
  }
}

function writeError(context: MaterialsContext, error: unknown) {
  if (error instanceof MaterialsNotPermittedError) {
    return forbidden(context, error.message);
  }
  if (error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND') {
    return notFound(context);
  }
  throw error;
}

export default defineApiRoutes<Application>((app) => {
  const router = new Hono<MaterialsEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const materials = app.container.resolve<MaterialsService>(
    materialsServiceToken,
  );

  // Every path this router owns authenticates and resolves an identity. The
  // middleware is scoped to `/materials` paths so it never reaches another
  // contribution mounted later.
  router.use('/materials', auth.required(), authz.middleware());
  router.use('/materials/:id', auth.required(), authz.middleware());

  router.get('/materials', async (context) => {
    const policy = await materials.viewPolicy(context.get('authz'));
    if (policy.read === false) {
      return forbidden(context, 'No materials view permission');
    }
    const limit = Number(context.req.query('limit') ?? '') || undefined;
    const offset = Number(context.req.query('offset') ?? '') || undefined;
    const data = await materials.list(context.get('authz'), { limit, offset });
    return context.json({ data });
  });

  router.get('/materials/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return notFound(context);
    }
    const policy = await materials.viewPolicy(context.get('authz'));
    if (policy.read === false) {
      return forbidden(context, 'No materials view permission');
    }
    const material = await materials.get(context.get('authz'), id);
    return material ? context.json({ data: material }) : notFound(context);
  });

  router.post('/materials', async (context) => {
    const body = await readJson<WriteBody>(context);
    const parsed = parseWriteBody(body ?? {});
    if (!parsed.ok) {
      return context.json({ code: 'INVALID_INPUT' }, 400);
    }
    try {
      const data = await materials.create(context.get('authz'), parsed.values);
      return context.json({ data }, 201);
    } catch (error) {
      return writeError(context, error);
    }
  });

  router.patch('/materials/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return notFound(context);
    }
    const body = await readJson<WriteBody>(context);
    const parsed = parseWriteBody(body ?? {});
    if (!parsed.ok) {
      return context.json({ code: 'INVALID_INPUT' }, 400);
    }
    try {
      const data = await materials.update(
        context.get('authz'),
        id,
        parsed.values,
      );
      return data ? context.json({ data }) : notFound(context);
    } catch (error) {
      return writeError(context, error);
    }
  });

  router.delete('/materials/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return notFound(context);
    }
    try {
      const removed = await materials.remove(context.get('authz'), id);
      return removed ? context.body(null, 204) : notFound(context);
    } catch (error) {
      return writeError(context, error);
    }
  });

  return router as unknown as Hono;
});
