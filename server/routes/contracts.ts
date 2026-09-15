import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';

import {
  CONTRACT_FIELDS,
  ContractsValidationError,
  contractsServiceToken,
  type ContractActor,
  type ContractAttachmentRow,
  type ContractsService,
  type ContractVersionRow,
} from '../providers/contracts.js';

const CONTRACTS_RESOURCE = {
  type: 'database.collection',
  id: 'main.contracts',
} as const;

/** Fields the application may write on create/update; the authorization grant must allow each one. */
const WRITABLE_FIELDS = [
  'contractNo',
  'name',
  'counterparty',
  'type',
  'signedDate',
  'effectiveDate',
  'expiryDate',
  'amount',
  'status',
] as const;

/** Enforced on the server; also published to the client so the upload control matches it. */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'doc',
  'docx',
];
export const MAX_UPLOAD_BYTES: number = 10 * 1024 * 1024;
/** Whole multipart body limit, including multipart overhead. */
const UPLOAD_BODY_LIMIT = MAX_UPLOAD_BYTES + 2 * 1024 * 1024;

/** Fields the caller declares for an authorization request. */
interface AuthzFields {
  readonly input?: readonly string[];
  readonly output?: readonly string[];
}

export const contractsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const api = new Hono();
    const contracts = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const service: ContractsService = app.container.resolve(
      contractsServiceToken,
    );

    contracts.use('*', auth.required(), authorization.middleware());

    contracts.onError((error, context) => {
      if (error instanceof ContractsValidationError) {
        return context.json({ code: error.code, message: error.message }, 400);
      }
      if (isUniqueViolation(error)) {
        return context.json(
          {
            code: 'CONTRACT_NO_CONFLICT',
            message: 'A contract with this number already exists.',
          },
          409,
        );
      }
      return context.json(
        { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' },
        500,
      );
    });

    // Static paths must be registered before the dynamic `/:id` route.
    contracts.get('/capabilities', async (context) => {
      return context.json({
        data: {
          canCreate: await can(context, 'create'),
          upload: {
            allowedExtensions: [...ALLOWED_UPLOAD_EXTENSIONS],
            maxBytes: MAX_UPLOAD_BYTES,
          },
        },
      });
    });

    contracts.get('/stats', async (context) => {
      const conditions = await readConditions(context);
      if (conditions instanceof Response) return conditions;
      return context.json({ data: await service.statistics(conditions) });
    });

    contracts.get('/', async (context) => {
      const conditions = await readConditions(context);
      if (conditions instanceof Response) return conditions;
      const expiringDays = parsePositiveInt(context.req.query('expiringDays'));
      const rows = await service.list(conditions, {
        ...(context.req.query('type')
          ? { type: context.req.query('type') }
          : {}),
        ...(context.req.query('status')
          ? { status: context.req.query('status') }
          : {}),
        ...(context.req.query('search')
          ? { search: context.req.query('search') }
          : {}),
        ...(expiringDays !== undefined ? { expiringDays } : {}),
      });
      return context.json({ data: rows });
    });

    contracts.post('/', async (context) => {
      const body = (await readJson(context)) ?? {};
      const actor = await resolveActor(context, service);
      const conditions = await authorize(context, 'create', {
        input: [...WRITABLE_FIELDS],
      });
      if (conditions instanceof Response) return conditions;
      const id = await service.create(body, actor, conditions);
      return context.json({ data: { id } }, 201);
    });

    contracts.patch('/:id', async (context) => {
      const body = (await readJson(context)) ?? {};
      const conditions = await authorize(context, 'update', {
        input: [...WRITABLE_FIELDS],
      });
      if (conditions instanceof Response) return conditions;
      const updated = await service.update(
        context.req.param('id'),
        body,
        conditions,
      );
      if (updated === 0) return notFound(context);
      return context.json({ data: { updated } });
    });

    contracts.get('/:id', async (context) => {
      const id = context.req.param('id');
      const conditions = await readConditions(context);
      if (conditions instanceof Response) return conditions;
      const contract = await service.findById(id, conditions);
      if (!contract) return notFound(context);

      const [canDownload, canManage, versions, attachments] = await Promise.all(
        [
          canActOnContract(context, service, 'download', id),
          canActOnContract(context, service, 'update', id),
          service.listVersions(id),
          service.listAttachments(id),
        ],
      );

      return context.json({
        data: {
          contract,
          capabilities: { canDownload, canManage },
          ...groupVersions(versions, attachments),
        },
      });
    });

    contracts.post('/:id/versions', async (context) => {
      const id = context.req.param('id');
      const conditions = await updateConditions(context);
      if (conditions instanceof Response) return conditions;
      const contract = await service.findById(id, conditions);
      if (!contract) return notFound(context);

      const body = (await readJson(context)) ?? {};
      const versionNo = stringField(body.versionNo);
      if (!versionNo) {
        return context.json(
          {
            code: 'MISSING_VERSION_NO',
            message: 'Version number is required.',
          },
          400,
        );
      }
      const description = stringField(body.description);
      const actor = await resolveActor(context, service);
      const versionId = await service.createVersion(
        id,
        { versionNo, ...(description ? { description } : {}) },
        actor,
      );
      return context.json({ data: { id: versionId } }, 201);
    });

    contracts.post(
      '/:id/attachments',
      bodyLimit({
        maxSize: UPLOAD_BODY_LIMIT,
        onError: (context) =>
          context.json(
            {
              code: 'BODY_TOO_LARGE',
              message: 'The uploaded file is too large.',
            },
            413,
          ),
      }),
      async (context) => {
        const id = context.req.param('id');
        const conditions = await updateConditions(context);
        if (conditions instanceof Response) return conditions;
        const contract = await service.findById(id, conditions);
        if (!contract) return notFound(context);

        const contentType = context.req.header('content-type') ?? '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
          return context.json(
            {
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message: 'Expected multipart/form-data with a file field.',
            },
            415,
          );
        }

        let body: Record<string, string | File | (string | File)[]>;
        try {
          body = await context.req.parseBody({ all: true });
        } catch {
          return context.json(
            { code: 'INVALID_MULTIPART', message: 'Invalid multipart body.' },
            400,
          );
        }

        const file = body.file;
        if (!(file instanceof File)) {
          return context.json(
            { code: 'INVALID_FILE', message: 'A file upload is required.' },
            400,
          );
        }
        const rejection = validateUpload(file);
        if (rejection) return context.json(rejection.body, rejection.status);

        const versionId = stringField(body.versionId);
        if (versionId) {
          const versions = await service.listVersions(id);
          if (!versions.some((version) => version.id === versionId)) {
            return context.json(
              {
                code: 'INVALID_VERSION',
                message:
                  'The selected version does not belong to this contract.',
              },
              400,
            );
          }
        }

        const repository = service.fileRepository();
        const { record } = await repository.uploadOne({ file });
        const actor = await resolveActor(context, service);
        await service.linkAttachment(record.id, {
          contractId: id,
          versionId: versionId ?? null,
          ownerId: contract.ownerId,
          actor,
        });
        const attachment = await service.findAttachment(record.id);
        if (!attachment) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Attachment not found.' },
            404,
          );
        }
        return context.json({ data: toClientAttachment(attachment) }, 201);
      },
    );

    contracts.get(
      '/:id/attachments/:attachmentId/download',
      async (context) => {
        const id = context.req.param('id');
        const conditions = await downloadConditions(context);
        if (conditions instanceof Response) return conditions;
        const contract = await service.findById(id, conditions);
        if (!contract) return forbidden(context);

        const attachment = await service.findAttachment(
          context.req.param('attachmentId'),
        );
        if (!attachment || attachment.contractId !== id) {
          return notFound(context);
        }

        const file = await service.openAttachment(attachment);
        context.header(
          'Content-Type',
          file.mimeType || 'application/octet-stream',
        );
        context.header('Content-Length', String(file.size));
        context.header('X-Content-Type-Options', 'nosniff');
        context.header('Cache-Control', 'private, no-store');
        context.header(
          'Content-Security-Policy',
          "sandbox; default-src 'none'",
        );
        context.header(
          'Content-Disposition',
          contentDisposition(file.filename),
        );
        return context.body(file.stream);
      },
    );

    api.route('/contracts', contracts);
    return api;
  });

/** Group scans under the version they belong to; scans without a version are returned separately. */
/** An attachment as the browser needs it: no storage disk or object key leaves the server. */
interface ClientAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contractId: string | null;
  readonly versionId: string | null;
  readonly uploadedById: string | null;
  readonly uploadedByName: string | null;
  readonly createdAt: string;
}

function toClientAttachment(row: ContractAttachmentRow): ClientAttachment {
  return {
    id: row.id,
    filename: row.filename,
    ext: row.ext,
    mimeType: row.mimeType,
    size: row.size,
    contractId: row.contractId,
    versionId: row.versionId,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedByName,
    createdAt: row.createdAt,
  };
}

function groupVersions(
  versions: readonly ContractVersionRow[],
  attachments: readonly ContractAttachmentRow[],
): {
  versions: {
    version: ContractVersionRow;
    attachments: ClientAttachment[];
  }[];
  unassigned: ClientAttachment[];
} {
  const known = new Set(versions.map((version) => version.id));
  const clientAttachments = attachments.map(toClientAttachment);
  return {
    versions: versions.map((version) => ({
      version,
      attachments: clientAttachments.filter(
        (attachment) => attachment.versionId === version.id,
      ),
    })),
    unassigned: clientAttachments.filter(
      (attachment) => !attachment.versionId || !known.has(attachment.versionId),
    ),
  };
}

async function readConditions(
  context: Context<AuthorizationEnv>,
): Promise<DatabaseAuthorizationConditions | Response> {
  return authorize(context, 'read', { output: [...CONTRACT_FIELDS] });
}

async function updateConditions(
  context: Context<AuthorizationEnv>,
): Promise<DatabaseAuthorizationConditions | Response> {
  return authorize(context, 'update', { input: [...WRITABLE_FIELDS] });
}

async function downloadConditions(
  context: Context<AuthorizationEnv>,
): Promise<DatabaseAuthorizationConditions | Response> {
  return authorize(context, 'download', {});
}

async function can(
  context: Context<AuthorizationEnv>,
  action: string,
): Promise<boolean> {
  const conditions = await authorize(context, action, {});
  return !(conditions instanceof Response);
}

/** True when the caller's action grant also covers this specific contract. */
async function canActOnContract(
  context: Context<AuthorizationEnv>,
  service: ContractsService,
  action: 'download' | 'update',
  contractId: string,
): Promise<boolean> {
  const conditions = await authorize(context, action, {});
  if (conditions instanceof Response) return false;
  return Boolean(await service.findById(contractId, conditions));
}

/**
 * Authorize one action and hand back the database conditions.
 *
 * The File/DB authorization API resolves `params` through a conditional type, so the request body is typed
 * explicitly here rather than relying on inference.
 */
async function authorize(
  context: Context<AuthorizationEnv>,
  action: string,
  fields: AuthzFields,
): Promise<DatabaseAuthorizationConditions | Response> {
  const decision = await context
    .get('authz')
    .authorize<{ fields: AuthzFields }>({
      resource: CONTRACTS_RESOURCE,
      action,
      params: { fields },
    });
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    return forbidden(context);
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

function forbidden(context: Context<AuthorizationEnv>): Response {
  return context.json(
    { code: 'FORBIDDEN', message: 'You may not access this contract.' },
    403,
  );
}

function notFound(context: Context<AuthorizationEnv>): Response {
  return context.json(
    { code: 'NOT_FOUND', message: 'Contract not found.' },
    404,
  );
}

async function readJson(
  context: Context<AuthorizationEnv>,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body = (await context.req.json()) as unknown;
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function resolveActor(
  context: Context<AuthorizationEnv>,
  service: ContractsService,
): Promise<ContractActor> {
  const id = context.get('authz').identity.principal.id;
  return { id, name: await service.displayNameFor(id) };
}

function validateUpload(
  file: File,
): { status: 400 | 413; body: { code: string; message: string } } | undefined {
  const extension = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (!extension || !ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) {
    return {
      status: 400,
      body: {
        code: 'UNSUPPORTED_FILE_TYPE',
        message: `File type ".${extension}" is not allowed.`,
      },
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      status: 413,
      body: {
        code: 'FILE_TOO_LARGE',
        message: `The file exceeds the ${Math.round(
          MAX_UPLOAD_BYTES / (1024 * 1024),
        )} MB limit.`,
      },
    };
  }
  return undefined;
}

function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(
    Buffer.from(filename).toString('utf8'),
  ).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

function stringField(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT');
}

export default contractsApiRoutes;
