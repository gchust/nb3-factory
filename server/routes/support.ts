import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type AuthorizationScope,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { Readable } from 'node:stream';

import {
  ATTACHMENT_ACCESS_PATH,
  ATTACHMENT_DISK,
  ATTACHMENT_REQUEST_LIMIT_BYTES,
  DEFAULT_TICKET_PRIORITY,
  SUPPORT_ATTACHMENT_COLLECTION,
  SUPPORT_REPORT_ACTION,
  SUPPORT_REPORT_RESOURCE,
  SUPPORT_STAFF_ACTION,
  SUPPORT_STAFF_RESOURCE,
  SUPPORT_TICKET_COLLECTION,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from '../providers/support/constants.js';
import { validateAttachmentFile } from '../providers/support/files.js';
import { containsNoRecordsFilter } from '../providers/support/filter.js';
import { SupportService } from '../providers/support/service.js';
import {
  isTicketStatusAction,
  resolveStatusTransition,
  TICKET_STATUS_ACTIONS,
} from '../providers/support/status.js';

type SupportEnv = AuthEnv & AuthorizationEnv;

/** Errors the route turns into a JSON body with a stable code. */
class SupportRouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SupportRouteError';
    this.status = status;
    this.code = code;
  }
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => createSupportRouter(app),
);

/**
 * Builds the support desk API. Every path lives under `/support` and installs
 * its own authentication and authorization, so the module never depends on
 * middleware contributed by another route.
 */
export function createSupportRouter(app: Application): Hono {
  const router = new Hono();
  const secure = new Hono<SupportEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const database = app.container.resolve(databaseManagerToken);
  const fileRepositories = app.container.resolve(
    serverFileRepositoryManagerToken,
  );
  const drive = app.container.resolve(driveManagerToken);
  const files = fileRepositories.repository('support_attachments', {
    disk: ATTACHMENT_DISK,
    accessPath: ATTACHMENT_ACCESS_PATH,
  });
  const service = new SupportService({ database, files });

  // Scoped to this module's prefix only: a wildcard at the router root would
  // leak into contributions mounted after this one.
  secure.use(
    '/support/*',
    auth.required() as unknown as MiddlewareHandler<SupportEnv>,
  );
  secure.use(
    '/support/*',
    authorization.middleware() as unknown as MiddlewareHandler<SupportEnv>,
  );

  secure.onError((error, context) => {
    if (error instanceof SupportRouteError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        error.status as 400,
      );
    }
    if (error instanceof HTTPException) return error.getResponse();
    throw error;
  });

  secure.get('/support/tickets', async (context) => {
    const conditions = await requireDatabaseConditions(
      context,
      SUPPORT_TICKET_COLLECTION,
      'read',
    );
    return context.json({ data: await service.listTickets(conditions) });
  });

  secure.post('/support/tickets', async (context) => {
    const input = parseTicketInput(await readJson(context));
    await requireDatabaseConditions(
      context,
      SUPPORT_TICKET_COLLECTION,
      'create',
    );
    const created = await service.createTicket(
      input,
      context.get('authz').identity.principal.id,
    );
    return context.json({ data: created }, 201);
  });

  secure.get('/support/tickets/:id', async (context) => {
    const id = requireTicketId(context.req.param('id'));
    const ticketConditions = await requireDatabaseConditions(
      context,
      SUPPORT_TICKET_COLLECTION,
      'read',
    );
    const ticket = await service.findTicket(id, ticketConditions);
    if (!ticket) throw notFound('Ticket not found.');

    const attachmentConditions = await requireDatabaseConditions(
      context,
      SUPPORT_ATTACHMENT_COLLECTION,
      'read',
    );
    const attachments = await service.listAttachments(id, attachmentConditions);

    // The client renders only the transitions this viewer may perform, so the
    // same state machine that guards the write decides what the buttons offer.
    const scope = context.get('authz');
    const status = isTicketStatus(ticket.status) ? ticket.status : null;
    const isStaff = await canUseStaffResource(scope);
    const isCustomer = scope.identity.principal.id === ticket.customerId;
    const actions = status
      ? TICKET_STATUS_ACTIONS.filter(
          (action) =>
            resolveStatusTransition({
              action,
              status,
              isStaff,
              isCustomer,
            }) !== null,
        )
      : [];
    return context.json({ data: { ticket, attachments, actions } });
  });

  secure.post(
    '/support/tickets/:id/attachments',
    bodyLimit({
      maxSize: ATTACHMENT_REQUEST_LIMIT_BYTES,
      onError: (context) =>
        context.json(
          {
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'The upload request body is too large.',
            },
          },
          413,
        ),
    }),
    async (context) => {
      const id = requireTicketId(context.req.param('id'));
      const ticketConditions = await requireDatabaseConditions(
        context,
        SUPPORT_TICKET_COLLECTION,
        'read',
      );
      const ticket = await service.findTicket(id, ticketConditions);
      if (!ticket) throw notFound('Ticket not found.');

      await requireDatabaseConditions(
        context,
        SUPPORT_ATTACHMENT_COLLECTION,
        'create',
      );

      const uploads = await readUploads(context);
      for (const file of uploads) {
        const result = validateAttachmentFile({
          filename: file.name,
          size: file.size,
          mimeType: file.type,
        });
        if (!result.ok) {
          const status =
            result.code === 'FILE_TOO_LARGE'
              ? 413
              : result.code === 'UNSUPPORTED_FILE_TYPE'
                ? 415
                : 400;
          throw new SupportRouteError(status, result.code, result.message);
        }
      }

      const scope = context.get('authz');
      const isStaff = await canUseStaffResource(scope);
      const attachments = await service.uploadAttachments({
        files: uploads,
        ticketId: id,
        customerId: ticket.customerId,
        uploadedById: scope.identity.principal.id,
        uploaderRole: isStaff ? 'agent' : 'customer',
      });
      return context.json({ data: attachments }, 201);
    },
  );

  secure.get('/support/attachments/:id/content', async (context) => {
    const id = context.req.param('id');
    const conditions = await requireDatabaseConditions(
      context,
      SUPPORT_ATTACHMENT_COLLECTION,
      'read',
    );
    const record = await service.findAttachment(id, conditions);
    if (!record) throw notFound('Attachment not found.');

    const disk = drive.use(record.disk);
    if (!(await disk.exists(record.key))) {
      throw notFound('Attachment not found.');
    }
    context.header('Cache-Control', 'private, no-store');
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Content-Security-Policy', "sandbox; default-src 'none'");
    context.header(
      'Content-Type',
      record.mimeType || 'application/octet-stream',
    );
    context.header('Content-Length', String(record.size));
    context.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    );
    return context.body(Readable.toWeb(await disk.getStream(record.key)));
  });

  secure.post('/support/tickets/:id/status', async (context) => {
    const id = requireTicketId(context.req.param('id'));
    const body = await readJson(context);
    const action = body?.action;
    if (!isTicketStatusAction(action)) {
      throw new SupportRouteError(
        400,
        'INVALID_ACTION',
        'Unknown status action.',
      );
    }

    const ticketConditions = await requireDatabaseConditions(
      context,
      SUPPORT_TICKET_COLLECTION,
      'read',
    );
    const ticket = await service.findTicket(id, ticketConditions);
    if (!ticket) throw notFound('Ticket not found.');

    const scope = context.get('authz');
    const isStaff = await canUseStaffResource(scope);
    const isCustomer = scope.identity.principal.id === ticket.customerId;
    if (!isTicketStatus(ticket.status)) {
      throw new SupportRouteError(
        409,
        'INVALID_TRANSITION',
        'The ticket is in an unknown status.',
      );
    }
    const transition = resolveStatusTransition({
      action,
      status: ticket.status,
      isStaff,
      isCustomer,
    });
    if (!transition) {
      throw new SupportRouteError(
        409,
        'INVALID_TRANSITION',
        'This status change is not allowed for the current ticket.',
      );
    }

    const updateConditions = await requireDatabaseConditions(
      context,
      SUPPORT_TICKET_COLLECTION,
      'update',
    );
    const updated = await service.updateTicketStatus(
      id,
      {
        status: transition.status,
        ...(transition.assignToSelf
          ? { assigneeId: scope.identity.principal.id }
          : {}),
      },
      updateConditions,
    );
    if (updated === 0) throw notFound('Ticket not found.');

    const fresh = await service.findTicket(id, ticketConditions);
    if (!fresh) throw notFound('Ticket not found.');
    return context.json({ data: fresh });
  });

  secure.get('/support/stats', async (context) => {
    const allowed = await context.get('authz').can({
      resource: { type: SUPPORT_REPORT_RESOURCE, id: '*' },
      action: SUPPORT_REPORT_ACTION,
    });
    if (!allowed) {
      throw new SupportRouteError(
        403,
        'FORBIDDEN',
        'Only support staff may view ticket statistics.',
      );
    }
    return context.json({ data: await service.stats() });
  });

  router.route('/', secure);
  return router;
}

async function requireDatabaseConditions(
  context: Context<SupportEnv>,
  collection: string,
  action: string,
): Promise<DatabaseAuthorizationConditions> {
  const decision = await context.get('authz').authorize({
    resource: { type: 'database.collection', id: collection },
    action,
  });
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    throw new SupportRouteError(
      403,
      'FORBIDDEN',
      'You do not have access to this resource.',
    );
  }
  const conditions = decision.conditions as DatabaseAuthorizationConditions;
  // A filter that can never match is a denial, not an unrestricted query.
  if (containsNoRecordsFilter(conditions.filter)) {
    throw new SupportRouteError(
      403,
      'FORBIDDEN',
      'You do not have access to this resource.',
    );
  }
  return conditions;
}

async function canUseStaffResource(
  scope: AuthorizationScope,
): Promise<boolean> {
  return scope.can({
    resource: { type: SUPPORT_STAFF_RESOURCE, id: '*' },
    action: SUPPORT_STAFF_ACTION,
  });
}

async function readJson(
  context: Context<SupportEnv>,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await context.req.json();
    return isRecord(value) ? value : null;
  } catch {
    throw new SupportRouteError(
      400,
      'INVALID_JSON',
      'A JSON body is required.',
    );
  }
}

async function readUploads(
  context: Context<SupportEnv>,
): Promise<readonly File[]> {
  const contentType = context.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new SupportRouteError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Expected multipart/form-data.',
    );
  }
  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await context.req.parseBody({ all: true });
  } catch {
    throw new SupportRouteError(
      400,
      'INVALID_MULTIPART',
      'Invalid multipart body.',
    );
  }
  const raw = body['file'];
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const uploads = values.filter(
    (value): value is File => value instanceof File,
  );
  if (uploads.length === 0) {
    throw new SupportRouteError(
      400,
      'INVALID_FILE',
      'At least one file is required.',
    );
  }
  return uploads;
}

function parseTicketInput(raw: Record<string, unknown> | null): {
  readonly title: string;
  readonly description: string | null;
  readonly priority: TicketPriority;
} {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  if (!title || title.length > 255) {
    throw new SupportRouteError(
      400,
      'INVALID_TITLE',
      'A title of at most 255 characters is required.',
    );
  }
  const descriptionValue = raw?.description;
  const description =
    typeof descriptionValue === 'string' && descriptionValue.trim()
      ? descriptionValue.trim()
      : null;
  if (description && description.length > 4000) {
    throw new SupportRouteError(
      400,
      'INVALID_DESCRIPTION',
      'The description is too long.',
    );
  }
  const priorityValue = raw?.priority;
  const priority =
    typeof priorityValue === 'string' && isTicketPriority(priorityValue)
      ? priorityValue
      : DEFAULT_TICKET_PRIORITY;
  return { title, description, priority };
}

function requireTicketId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new SupportRouteError(400, 'INVALID_TICKET_ID', 'Invalid ticket id.');
  }
  return id;
}

function isTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

function notFound(message: string): SupportRouteError {
  return new SupportRouteError(404, 'NOT_FOUND', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
