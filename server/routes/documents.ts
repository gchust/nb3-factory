import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationConditions,
  type DatabaseFieldFilter,
  type DatabaseFilter,
  type DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type ComparisonOperator,
  type Expression,
  type ExpressionBuilder,
  type QueryAdapter,
  type Row,
  type SqlBool,
} from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Readable } from 'node:stream';

import {
  ALLOWED_EXTENSIONS,
  DISCIPLINES,
  DOCUMENT_ACCESS_PATH,
  DOCUMENT_COLLECTION,
  DOCUMENT_DISK,
  DOCUMENT_RESOURCE,
  MAX_BATCH_BYTES,
  MAX_FILES,
  MAX_FILE_BYTES,
  STATUSES,
  contentUrl,
  isDiscipline,
  isStatus,
  nameFromFilename,
  parseContentFileParam,
  validateUploadSelection,
} from './document-policy.js';

type DocumentEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

type DocumentContext = Context<DocumentEnv>;

const LIST_LIMIT = 500;
const UPLOAD_BODY_LIMIT = MAX_BATCH_BYTES + 3 * 1024 * 1024;

const DOCUMENT_COLUMNS = [
  'id',
  'filename',
  'ext',
  'mimeType',
  'size',
  'drawingNumber',
  'name',
  'discipline',
  'version',
  'status',
  'uploadedById',
  'uploadedByName',
  'uploadedAt',
  'createdAt',
] as const;

const UPDATE_FIELDS = [
  'drawingNumber',
  'name',
  'discipline',
  'version',
  'status',
] as const;

/**
 * Business API for the document ledger. Every route installs its own authentication and authorization; the
 * middleware is scoped to `/document-library` so it cannot leak into contributions mounted later.
 */
export const documentApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    const routes = new Hono<DocumentEnv>();
    routes.use(
      '/document-library/*',
      auth.required(),
      authorization.middleware(),
    );

    routes.post('/document-library/context', async (context) => {
      const capabilities = await resolveCapabilities(context);
      if (!capabilities) return forbidden(context);
      return context.json({ data: capabilities });
    });

    routes.post('/document-library/list', async (context) => {
      const conditions = await requireConditions(context, 'read');
      if (!conditions) return forbidden(context);
      const input = await readJson(context);
      const database = app.container.resolve(databaseManagerToken);
      const rows = await listDocuments(database.query(), conditions, input);
      return context.json({ data: rows.map((row) => toDto(app, row)) });
    });

    routes.post(
      '/document-library/upload',
      bodyLimit({
        maxSize: UPLOAD_BODY_LIMIT,
        onError: (context) =>
          context.json(
            {
              code: 'BATCH_TOO_LARGE',
              message: `A single upload may not exceed ${MAX_BATCH_BYTES} bytes in total.`,
            },
            413,
          ),
      }),
      async (context) => {
        const conditions = await requireConditions(context, 'create');
        if (!conditions) return forbidden(context);

        let form: Record<string, unknown>;
        try {
          form = await context.req.parseBody({ all: true });
        } catch {
          return context.json(
            { code: 'INVALID_MULTIPART', message: 'Invalid multipart body.' },
            400,
          );
        }

        const files = collectFiles(form.file);
        const version = stringValue(form.version);
        const validation = validateUploadSelection({
          discipline: stringValue(form.discipline) ?? '',
          ...(version === undefined ? {} : { version }),
          files: files.map((file) => ({ name: file.name, size: file.size })),
        });
        if (!validation.ok) {
          return context.json(
            {
              code: validation.code,
              message: validation.message,
              ...validation.details,
            },
            400,
          );
        }

        const manager = app.container.resolve(serverFileRepositoryManagerToken);
        const repository = manager.repository(DOCUMENT_COLLECTION, {
          disk: DOCUMENT_DISK,
          accessPath: DOCUMENT_ACCESS_PATH,
        });
        const { records } = await repository.uploadMany({ files });

        const session = context.get('auth');
        const database = app.container.resolve(databaseManagerToken);
        const now = new Date();
        for (const record of records) {
          const label = nameFromFilename(record.filename);
          await database
            .query()
            .updateTable(DOCUMENT_COLLECTION)
            .set({
              drawingNumber: label,
              name: label,
              discipline: validation.value.discipline,
              version: validation.value.version,
              status: 'active',
              uploadedById: session?.user.id ?? null,
              uploadedByName: session?.user.name ?? null,
              // An ISO string keeps the stored value readable and consistent with the plugin's `createdAt`.
              uploadedAt: now.toISOString(),
              updatedAt: now.toISOString(),
            })
            .where('id', '=', record.id)
            .execute();
        }

        const created = await database
          .query()
          .selectFrom(DOCUMENT_COLLECTION)
          .select([...DOCUMENT_COLUMNS])
          .where(
            'id',
            'in',
            records.map((record) => record.id),
          )
          .execute();
        return context.json(
          { data: created.map((row) => toDto(app, row)) },
          201,
        );
      },
    );

    routes.post('/document-library/update', async (context) => {
      const conditions = await requireConditions(context, 'update');
      if (!conditions) return forbidden(context);
      const input = await readJson(context);
      const id = stringValue(input.id);
      if (!id) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'A document id is required.' },
          400,
        );
      }
      const values = parseUpdateValues(input.values);
      if (!values.ok) {
        return context.json(
          { code: values.code, message: values.message },
          400,
        );
      }
      if (Object.keys(values.value).length === 0) {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message: 'No supported fields were provided.',
          },
          400,
        );
      }

      const database = app.container.resolve(databaseManagerToken);
      const updated = await database
        .query()
        .updateTable(DOCUMENT_COLLECTION)
        .set({ ...values.value, updatedAt: new Date() })
        .where('id', '=', id)
        .where((expression) => compileFilter(expression, conditions.filter))
        .execute();
      if ((updated.updatedCount ?? 0) === 0) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Document not found.' },
          404,
        );
      }
      const row = await database
        .query()
        .selectFrom(DOCUMENT_COLLECTION)
        .select([...DOCUMENT_COLUMNS])
        .where('id', '=', id)
        .executeTakeFirst();
      return context.json({ data: row ? toDto(app, row) : null });
    });

    routes.post('/document-library/delete', async (context) => {
      const conditions = await requireConditions(context, 'delete');
      if (!conditions) return forbidden(context);
      const input = await readJson(context);
      const id = stringValue(input.id);
      if (!id) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'A document id is required.' },
          400,
        );
      }
      const database = app.container.resolve(databaseManagerToken);
      const deleted = await database
        .query()
        .deleteFrom(DOCUMENT_COLLECTION)
        .where('id', '=', id)
        .where((expression) => compileFilter(expression, conditions.filter))
        .execute();
      if ((deleted.deletedCount ?? 0) === 0) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Document not found.' },
          404,
        );
      }
      return context.json({ data: { id } });
    });

    routes.post('/document-library/stats', async (context) => {
      const conditions = await requireConditions(context, 'read');
      if (!conditions) return forbidden(context);
      const database = app.container.resolve(databaseManagerToken);
      const rows = await database
        .query()
        .selectFrom(DOCUMENT_COLLECTION)
        .select('discipline')
        .select((expression) => [
          expression.fn.count('id').as('count'),
          expression.fn.sum('size').as('totalSize'),
        ])
        .where((expression) => compileFilter(expression, conditions.filter))
        .groupBy('discipline')
        .execute();

      const groups = rows
        .map((row) => ({
          discipline: stringValue(row.discipline) ?? 'unknown',
          count: toNumber(row.count),
          totalSize: toNumber(row.totalSize),
        }))
        .sort((left, right) => left.discipline.localeCompare(right.discipline));
      const total = groups.reduce(
        (accumulator, group) => ({
          count: accumulator.count + group.count,
          totalSize: accumulator.totalSize + group.totalSize,
        }),
        { count: 0, totalSize: 0 },
      );
      return context.json({ data: { groups, total } });
    });

    router.route('/', routes);
    return router;
  });

/**
 * The file content route is mounted at the root, outside `/api`, so it installs its own authentication and
 * authorization. A signed-in visitor is refused; an engineer, archivist or administrator may stream the file.
 */
export const documentContentRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    const routes = new Hono<DocumentEnv>();
    routes.get(
      `${DOCUMENT_ACCESS_PATH}/:file`,
      auth.required(),
      authorization.middleware(),
      async (context) => {
        const conditions = await requireConditions(context, 'download');
        if (!conditions) return forbidden(context);

        const parsed = parseContentFileParam(context.req.param('file'));
        if (!parsed) return context.notFound();

        const database = app.container.resolve(databaseManagerToken);
        const record = await database
          .query()
          .selectFrom(DOCUMENT_COLLECTION)
          .select(['id', 'disk', 'key', 'ext', 'mimeType', 'size', 'filename'])
          .where('id', '=', parsed.id)
          .where((expression) => compileFilter(expression, conditions.filter))
          .executeTakeFirst();
        if (!record || String(record.ext) !== parsed.ext)
          return context.notFound();

        const disk = app.container
          .resolve(driveManagerToken)
          .use(String(record.disk));
        const key = String(record.key);
        if (!(await disk.exists(key))) return context.notFound();

        context.header('Cache-Control', 'private, no-store');
        context.header('Content-Type', String(record.mimeType));
        context.header('Content-Length', String(record.size));
        context.header('X-Content-Type-Options', 'nosniff');
        context.header(
          'Content-Security-Policy',
          "sandbox; default-src 'none'",
        );
        context.header(
          'Content-Disposition',
          attachmentDisposition(String(record.filename)),
        );
        return context.body(
          Readable.toWeb(await disk.getStream(key)) as ReadableStream,
        );
      },
    );

    router.route('/', routes);
    return router;
  });

async function resolveCapabilities(context: DocumentContext) {
  const [canRead, canUpload, canUpdate, canDelete, canDownload] =
    await Promise.all([
      allowed(context, 'read'),
      allowed(context, 'create'),
      allowed(context, 'update'),
      allowed(context, 'delete'),
      allowed(context, 'download'),
    ]);
  if (!canRead) return undefined;
  return {
    canRead,
    canUpload,
    canUpdate,
    canDelete,
    canDownload,
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      maxBatchBytes: MAX_BATCH_BYTES,
      maxFiles: MAX_FILES,
    },
    extensions: ALLOWED_EXTENSIONS,
    disciplines: DISCIPLINES,
    statuses: STATUSES,
  };
}

async function allowed(
  context: DocumentContext,
  action: string,
): Promise<boolean> {
  return (await requireConditions(context, action)) !== undefined;
}

async function requireConditions(
  context: DocumentContext,
  action: string,
): Promise<DatabaseAuthorizationConditions | undefined> {
  const decision = await context.get('authz').authorize({
    resource: DOCUMENT_RESOURCE,
    action,
  });
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    return undefined;
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

function forbidden(context: DocumentContext): Response {
  return context.json({ code: 'FORBIDDEN', message: 'Not allowed.' }, 403);
}

async function readJson(
  context: DocumentContext,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await context.req.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function collectFiles(value: unknown): File[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  return values.filter((item): item is File => item instanceof File);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseUpdateValues(
  input: unknown,
):
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly code: string; readonly message: string } {
  if (!isRecord(input)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'values must be an object.',
    };
  }
  const value: Record<string, unknown> = {};
  for (const field of UPDATE_FIELDS) {
    if (!(field in input)) continue;
    const raw = input[field];
    if (field === 'discipline') {
      if (raw === null || raw === '') continue;
      if (!isDiscipline(raw)) {
        return {
          ok: false,
          code: 'INVALID_DISCIPLINE',
          message: 'Unknown discipline.',
        };
      }
      value[field] = raw;
      continue;
    }
    if (field === 'status') {
      if (!isStatus(raw)) {
        return {
          ok: false,
          code: 'INVALID_STATUS',
          message: 'Unknown status.',
        };
      }
      value[field] = raw;
      continue;
    }
    if (raw === null) {
      value[field] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `${field} must be a string.`,
      };
    }
    if (raw.length > 255) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `${field} is too long.`,
      };
    }
    value[field] = raw.trim();
  }
  return { ok: true, value };
}

function listDocuments(
  query: QueryAdapter,
  conditions: DatabaseAuthorizationConditions,
  input: Record<string, unknown>,
): Promise<Row[]> {
  const discipline = stringValue(input.discipline);
  const drawingNumber = stringValue(input.drawingNumber);
  const name = stringValue(input.name);
  return query
    .selectFrom(DOCUMENT_COLLECTION)
    .select([...DOCUMENT_COLUMNS])
    .where((expression) => {
      const parts: Expression<SqlBool>[] = [];
      if (discipline && isDiscipline(discipline)) {
        parts.push(expression('discipline', '=', discipline));
      }
      if (drawingNumber) {
        parts.push(
          expression('drawingNumber', 'like', `%${escapeLike(drawingNumber)}%`),
        );
      }
      if (name) {
        parts.push(expression('name', 'like', `%${escapeLike(name)}%`));
      }
      return expression.and(parts);
    })
    .where((expression) => compileFilter(expression, conditions.filter))
    .orderBy('createdAt', 'desc')
    .limit(LIST_LIMIT)
    .execute();
}

function toDto(app: Application, row: Row): Record<string, unknown> {
  const id = text(row.id);
  const ext = text(row.ext);
  return {
    id,
    filename: text(row.filename),
    ext,
    mimeType: text(row.mimeType),
    size: toNumber(row.size),
    contentUrl: contentUrl(app.publicBasePath ?? '', { id, ext }),
    drawingNumber: row.drawingNumber ?? null,
    name: row.name ?? null,
    discipline: row.discipline ?? null,
    version: row.version ?? null,
    status: row.status ?? null,
    uploadedById: row.uploadedById ?? null,
    uploadedByName: row.uploadedByName ?? null,
    uploadedAt: row.uploadedAt ?? null,
    createdAt: row.createdAt ?? null,
  };
}

/** Stringifies only scalar column values; an unexpected object never leaks its default representation. */
function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return 0;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function attachmentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

const filterOperators: Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

/**
 * Compiles the authorization Filter AST into the query builder. The filter is always part of the same statement as
 * the record id or the list query; it is never applied in memory afterwards.
 */
function compileFilter(
  expression: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const parts = Object.entries(filter).map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      if (!isFilterList(value))
        throw new TypeError(`${field} must be an array`);
      const nested = value.map((item) => compileFilter(expression, item));
      return field === '$and' ? expression.and(nested) : expression.or(nested);
    }
    if (!isFieldFilter(value)) {
      throw new TypeError(`Invalid filter for ${field}`);
    }
    return expression.and(
      Object.entries(value).map(([operator, expected]) => {
        const comparison = filterOperators[operator as DatabaseFilterOperator];
        if (!comparison) {
          throw new TypeError(`Unknown filter operator: ${operator}`);
        }
        return expression(field, comparison, expected);
      }),
    );
  });
  return expression.and(parts);
}

function isFilterList(value: unknown): value is readonly DatabaseFilter[] {
  return Array.isArray(value);
}

function isFieldFilter(value: unknown): value is DatabaseFieldFilter {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
