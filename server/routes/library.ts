import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { Hono } from 'hono';
import { libraryServiceToken } from '../providers/library.js';
import {
  LibraryError,
  SHARING_RULES_SETTINGS,
  type LibraryActor,
  type LibraryDocumentInput,
} from '../library/service.js';

/** The session and the resolved authorization context, both on the request. */
type LibraryEnv = AuthEnv & AuthorizationEnv;

/**
 * The internal library's own HTTP surface.
 *
 * Every path is mounted under `/api/library`, but mounting authenticates
 * nothing: this router installs the session middleware and the authorization
 * middleware itself, and the sharing endpoints additionally require the
 * built-in sharing-rules settings permission. Record scopes and field
 * allowlists are enforced one layer down, by the authorization-bound
 * Repository the service uses, not by anything here.
 */
export const apiRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono();
  const routes = new Hono<LibraryEnv>();
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const library = app.container.resolve(libraryServiceToken);

  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError) {
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    }
    if (error instanceof LibraryError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    throw error;
  });

  routes.use('*', authentication.required(), authorization.middleware());

  const actorOf = (authz: LibraryActor['authz']): LibraryActor => ({
    userId: authz.identity.principal.id,
    authz,
  });

  const requireSharingAction = async (
    authz: LibraryActor['authz'],
    action: 'read' | 'create' | 'delete',
  ): Promise<void> => {
    await authz.require({
      resource: { type: 'settings', id: SHARING_RULES_SETTINGS },
      action,
    });
  };

  const documentId = (value: string): number => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new LibraryError(
        'INVALID_ID',
        'A numeric document id is required',
        400,
      );
    }
    return id;
  };

  const body = async (request: {
    json: () => Promise<unknown>;
  }): Promise<Record<string, unknown>> => {
    try {
      const value = await request.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new LibraryError(
          'INVALID_BODY',
          'A JSON object is required',
          400,
        );
      }
      return value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof LibraryError) throw error;
      throw new LibraryError('INVALID_BODY', 'A JSON object is required', 400);
    }
  };

  const stringId = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return '';
  };

  routes.get('/documents', async (context) => {
    return context.json({
      data: await library.listDocuments(actorOf(context.get('authz'))),
    });
  });

  routes.get('/documents/:id', async (context) => {
    return context.json({
      data: await library.getDocument(
        actorOf(context.get('authz')),
        documentId(context.req.param('id')),
      ),
    });
  });

  routes.post('/documents', async (context) => {
    const input = (await body(context.req)) as unknown as LibraryDocumentInput;
    return context.json(
      {
        data: await library.createDocument(
          actorOf(context.get('authz')),
          input,
        ),
      },
      201,
    );
  });

  routes.patch('/documents/:id', async (context) => {
    const input = (await body(
      context.req,
    )) as unknown as Partial<LibraryDocumentInput>;
    return context.json({
      data: await library.updateDocument(
        actorOf(context.get('authz')),
        documentId(context.req.param('id')),
        input,
      ),
    });
  });

  routes.delete('/documents/:id', async (context) => {
    await library.deleteDocument(
      actorOf(context.get('authz')),
      documentId(context.req.param('id')),
    );
    return context.body(null, 204);
  });

  routes.get('/recipients', async (context) => {
    await requireSharingAction(context.get('authz'), 'read');
    return context.json({
      data: await library.listRecipients(actorOf(context.get('authz'))),
    });
  });

  routes.get('/shares', async (context) => {
    await requireSharingAction(context.get('authz'), 'read');
    return context.json({
      data: await library.listShares(actorOf(context.get('authz'))),
    });
  });

  routes.post('/shares', async (context) => {
    await requireSharingAction(context.get('authz'), 'create');
    const input = await body(context.req);
    const target = Number(input.documentId);
    const recipients = Array.isArray(input.recipientIds)
      ? input.recipientIds.map(stringId)
      : input.recipientId !== undefined
        ? [stringId(input.recipientId)]
        : [];
    return context.json(
      {
        data: await library.createShare(
          actorOf(context.get('authz')),
          Number.isInteger(target) ? target : 0,
          recipients,
        ),
      },
      201,
    );
  });

  routes.delete('/shares/:key', async (context) => {
    await requireSharingAction(context.get('authz'), 'delete');
    await library.deleteShare(
      actorOf(context.get('authz')),
      context.req.param('key'),
    );
    return context.body(null, 204);
  });

  router.route('/library', routes);
  return router;
});
