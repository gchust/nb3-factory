import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  DocumentAccessError,
  documentsServiceToken,
  type DocumentAccessLevel,
  type DocumentPrincipal,
} from '../providers/documents.js';

/** Reads a JSON request body without trusting its shape. */
const readJsonBody = async (
  context: Context,
): Promise<Record<string, unknown>> => {
  const body: unknown = await context.req.json().catch(() => undefined);
  return body !== null && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : {};
};

/** Reads a string property, or `undefined` when it is absent or not a string. */
const readString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Application-owned HTTP surface for the internal documents.
 *
 * Every route owns its own authentication. The document service enforces the
 * read limit for a regular colleague: `GET /api/documents` returns only
 * `public` rows and `GET /api/documents/:id` refuses a `supervisor` document
 * with 403, so a direct API read cannot bypass the page.
 */
export const documentsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const documents = app.container.resolve(documentsServiceToken);

    const principalOf = (context: Context): DocumentPrincipal => {
      const session = context.get('auth') as
        { user?: { id?: unknown } } | null | undefined;
      const userId = session?.user?.id;
      if (typeof userId !== 'string' && typeof userId !== 'number') {
        throw new DocumentAccessError(401, 'Authentication is required.');
      }
      // The `root` permission-set assignment is checked in the service, so an
      // administrator is treated as a supervisor without trusting a header.
      return { userId: String(userId), isRoot: false };
    };

    const failure = (context: Context, error: unknown) => {
      if (error instanceof DocumentAccessError) {
        return context.json(
          { error: { message: error.message } },
          error.status as ContentfulStatusCode,
        );
      }
      throw error;
    };

    const authenticate = auth.required();

    router.get('/documents', authenticate, async (context) => {
      try {
        const result = await documents.list(principalOf(context));
        return context.json({
          data: result.documents,
          canManage: result.canManage,
        });
      } catch (error) {
        return failure(context, error);
      }
    });

    router.post('/documents', authenticate, async (context) => {
      try {
        const body = await readJsonBody(context);
        const title = (readString(body, 'title') ?? '').trim();
        const content = readString(body, 'content') ?? '';
        if (!title || !content.trim()) {
          return context.json(
            { error: { message: 'Both title and content are required.' } },
            400,
          );
        }
        const accessLevel: DocumentAccessLevel =
          readString(body, 'accessLevel') === 'supervisor'
            ? 'supervisor'
            : 'public';
        const record = await documents.create(principalOf(context), {
          title,
          content,
          accessLevel,
        });
        return context.json({ data: record }, 201);
      } catch (error) {
        return failure(context, error);
      }
    });

    router.get('/documents/:id', authenticate, async (context) => {
      try {
        const record = await documents.get(
          principalOf(context),
          context.req.param('id'),
        );
        return context.json({ data: record });
      } catch (error) {
        return failure(context, error);
      }
    });

    router.patch('/documents/:id', authenticate, async (context) => {
      try {
        const body = await readJsonBody(context);
        const patch: {
          title?: string;
          content?: string;
          accessLevel?: DocumentAccessLevel;
        } = {};
        const title = readString(body, 'title');
        const content = readString(body, 'content');
        const accessLevel = readString(body, 'accessLevel');
        if (title !== undefined) patch.title = title;
        if (content !== undefined) patch.content = content;
        if (accessLevel === 'supervisor' || accessLevel === 'public') {
          patch.accessLevel = accessLevel;
        }
        const record = await documents.update(
          principalOf(context),
          context.req.param('id'),
          patch,
        );
        return context.json({ data: record });
      } catch (error) {
        return failure(context, error);
      }
    });

    return router;
  });

export default documentsApiRoutes;
