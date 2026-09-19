import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiExposure,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  EXPENSE_FILE_ACCESS_PATH,
  EXPENSE_FILE_COLLECTION,
  EXPENSE_FILE_DISK,
  expenseServiceToken,
  type ExpenseService,
} from '../providers/expense.js';

/** One receipt is at most 5 MB, and a single picker selection is at most 5 files. */
export const EXPENSE_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const EXPENSE_FILE_MAX_FILES = 5;
/** Allow for multipart boundaries and headers on top of the raw file bytes. */
const BATCH_BODY_LIMIT =
  EXPENSE_FILE_MAX_BYTES * EXPENSE_FILE_MAX_FILES + 1024 * 1024;

const UPLOAD_PATHS: readonly string[] = [
  `/${EXPENSE_FILE_COLLECTION}:uploadOne`,
  `/${EXPENSE_FILE_COLLECTION}:uploadMany`,
];
const CONTENT_PREFIX = `${EXPENSE_FILE_ACCESS_PATH}/*`;

interface FilePrincipal {
  readonly userId: string;
  readonly name: string;
}

type FileRouteContributions = ReturnType<
  typeof defineFileRepositoryApiRoutes<FilePrincipal>
>;
type FileApiContribution = Extract<
  FileRouteContributions[number],
  { scope: 'api' }
>;
type FileRootContribution = Extract<
  FileRouteContributions[number],
  { scope: 'root' }
>;

/**
 * Receipt and supporting-document routes.
 *
 * The File Repository owns storage, metadata and byte serving; this application
 * owns authentication and authorization around them. Uploads are gated on a
 * session and stamp the uploader onto the row, while the byte route is guarded
 * per file by the reimbursement's own visibility rules, so holding a file URL is
 * never enough. The metadata CRUD routes are deliberately not exposed.
 */
export const expenseFileRoutes: readonly AppRouteContribution<Application>[] =
  buildRoutes();

function buildRoutes(): readonly AppRouteContribution<Application>[] {
  const exposure: FileRepositoryApiExposure<FilePrincipal> = {
    name: EXPENSE_FILE_COLLECTION,
    collection: EXPENSE_FILE_COLLECTION,
    connection: 'main',
    disk: EXPENSE_FILE_DISK,
    accessPath: EXPENSE_FILE_ACCESS_PATH,
    accessMode: 'stream',
    policy: (principal) => policyFor(principal),
    actions: {
      uploadOne: { maxSize: EXPENSE_FILE_MAX_BYTES },
      uploadMany: { maxSize: BATCH_BODY_LIMIT },
    },
  };
  const contributions = defineFileRepositoryApiRoutes<FilePrincipal>({
    repositories: [exposure],
    principal: (context) => {
      const principal = readPrincipal(context as Context<AuthEnv>);
      // The upload path refuses the request itself when this resolves nothing;
      // the plugin's resolver type simply does not model the missing principal.
      return principal as FilePrincipal;
    },
  });
  const apiContribution = contributions.find(
    (item): item is FileApiContribution => item.scope === 'api',
  );
  const contentContribution = contributions.find(
    (item): item is FileRootContribution => item.scope === 'root',
  );
  if (!apiContribution || !contentContribution) {
    throw new Error('The file repository routes were not created.');
  }
  return [
    withUploadAuthentication(apiContribution),
    withContentAccessGuard(contentContribution),
  ];
}

/**
 * The upload route resolves its principal from the session, so the session
 * middleware must run first — and an anonymous request is refused before any
 * bytes are read.
 */
function withUploadAuthentication(
  contribution: FileApiContribution,
): AppRouteContribution<Application> {
  return defineApiRoutes(async (app) => {
    const router = new Hono();
    const guarded = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    for (const path of UPLOAD_PATHS) {
      guarded.use(path, auth.required());
    }
    guarded.route('/', await contribution.createRouter(app));
    router.route('/', guarded);
    return router;
  });
}

/**
 * The content route is a public byte route by default. The guard in front of it
 * only reaches `<accessPath>/*`, leaving every other contribution untouched.
 */
function withContentAccessGuard(
  contribution: FileRootContribution,
): AppRouteContribution<Application> {
  return defineRootRoutes(async (app) => {
    const router = new Hono();
    const guarded = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(expenseServiceToken);
    guarded.use(CONTENT_PREFIX, auth.required());
    guarded.use(CONTENT_PREFIX, createExpenseFileAccessMiddleware(service));
    guarded.route('/', await contribution.createRouter(app));
    router.route('/', guarded);
    return router;
  });
}

/**
 * Per-file access check for the content route. Authentication is applied
 * separately; this middleware only decides whether the signed-in actor may read
 * the bytes. Exported so the decision can be exercised without a storage disk.
 */
export function createExpenseFileAccessMiddleware(
  service: ExpenseService,
): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    const fileId = parseFileId(context.req.path);
    if (!fileId) {
      return context.json(
        { code: 'INVALID_FILE_PATH', message: 'Invalid file path.' },
        404,
      );
    }
    const session = context.get('auth');
    if (!session) {
      return context.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        401,
      );
    }
    const actor = await service.resolveActor(
      session.user.id,
      session.user.name ?? '',
    );
    if (!(await service.canAccessFile(actor, fileId))) {
      return context.json(
        { code: 'FORBIDDEN', message: 'You cannot access this file.' },
        403,
      );
    }
    await next();
  };
}

function readPrincipal(context: Context<AuthEnv>): FilePrincipal | undefined {
  const session = context.get('auth');
  if (!session) return undefined;
  return { userId: session.user.id, name: session.user.name ?? '' };
}

function policyFor(principal: FilePrincipal): RepositoryPolicy {
  return {
    read: {
      scope: true,
      fields: [
        'id',
        'filename',
        'ext',
        'mimeType',
        'size',
        'ownerId',
        'createdAt',
        'updatedAt',
      ],
    },
    // Uploads compose their own values; the uploader is stamped as a default so an
    // unlinked upload still belongs to the employee who made it.
    create: { scope: true, defaults: { ownerId: principal.userId } },
    update: false,
    delete: { scope: true },
  };
}

function parseFileId(path: string): string | undefined {
  const match =
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]{1,32})?$/i.exec(
      path,
    );
  return match?.[1];
}
