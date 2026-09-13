import { Readable } from 'node:stream';

import {
  authenticationToken,
  UserAdministrationError,
  userAdministrationServiceToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import { Hono, type Context } from 'hono';

import {
  ProcurementError,
  procurementServiceToken,
  type ProcurementActor,
  type ProcurementCapabilities,
  type ProcurementService,
  type RequestInput,
  type SupplierInput,
} from '../providers/procurement.js';

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const procurement = app.container.resolve<ProcurementService>(
      procurementServiceToken,
    );
    // File and storage services are resolved lazily: only the attachment
    // endpoints need them, and resolving eagerly would couple every route to
    // the file plugin being installed.
    let fileRepository: ServerFileRepository | undefined;
    const files = (): ServerFileRepository => {
      fileRepository ??= app.container
        .resolve(serverFileRepositoryManagerToken)
        .repository('procurementFiles', {
          connection: 'main',
          disk: 'local',
          accessPath: '/uploads/procurement',
        });
      return fileRepository;
    };

    const routes = new Hono<AuthEnv>();

    const handleError = (error: Error, context: Context): Response => {
      if (error instanceof ProcurementError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      if (error instanceof TypeError) {
        return context.json(
          { code: 'INVALID_INPUT', message: error.message },
          400,
        );
      }
      throw error;
    };
    routes.onError(handleError);
    router.onError(handleError);

    // Public by design: self-registration cannot present a session. It only
    // creates a credential account; roles are never accepted from the caller,
    // and the new user inherits the authenticated baseline.
    router.post('/procurement/register', async (context) => {
      const body = await context.req.json<RegistrationInput>();
      const name = String(body.name ?? '').trim();
      const username = String(body.username ?? '').trim();
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      if (!name || !username || !EMAIL_PATTERN.test(email)) {
        throw new ProcurementError(
          'INVALID_REGISTRATION',
          'Name, username and a valid email are required.',
        );
      }
      if (password.length < 8) {
        throw new ProcurementError(
          'WEAK_PASSWORD',
          'Password must be at least 8 characters.',
        );
      }
      try {
        const users = app.container.resolve(userAdministrationServiceToken);
        const created = await users.create({ name, username, email, password });
        return context.json(
          {
            data: {
              id: created.id,
              name: created.name,
              username: created.username ?? username,
              email: created.email,
            },
          },
          201,
        );
      } catch (error) {
        if (error instanceof UserAdministrationError) {
          throw new ProcurementError(
            error.code,
            error.message,
            error.code.endsWith('_CONFLICT') ? 409 : 400,
          );
        }
        throw error;
      }
    });

    // Every procurement endpoint below authenticates here; none relies on
    // another contribution's middleware or on registration order.
    routes.use('*', authentication.required());

    const actorOf = (context: {
      get: (key: 'auth') => AuthEnv['Variables']['auth'];
    }): ProcurementActor => {
      const session = context.get('auth');
      if (!session) {
        throw new ProcurementError('UNAUTHENTICATED', 'Sign in required.', 401);
      }
      return { id: session.user.id, name: session.user.name ?? '' };
    };

    const capabilitiesOf = async (
      actor: ProcurementActor,
    ): Promise<ProcurementCapabilities> => procurement.capabilities(actor);

    const requireCapability = (allowed: boolean): void => {
      if (!allowed) {
        throw new ProcurementError('FORBIDDEN', 'Not allowed.', 403);
      }
    };

    routes.get('/me', async (context) => {
      const actor = actorOf(context);
      return context.json({
        data: { ...actor, capabilities: await capabilitiesOf(actor) },
      });
    });

    // Suppliers: maintained by administrators and buyers.
    routes.get('/suppliers', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.manageSuppliers);
      return context.json({
        data: await procurement.listSuppliers({
          category: context.req.query('category'),
          search: context.req.query('search'),
        }),
      });
    });

    routes.post('/suppliers', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      const input = await context.req.json<SupplierInput>();
      return context.json(
        { data: await procurement.createSupplier(input, actor, capabilities) },
        201,
      );
    });

    routes.get('/suppliers/:id', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.manageSuppliers);
      return context.json({
        data: await procurement.getSupplier(
          numberParam(context.req.param('id')),
        ),
      });
    });

    routes.patch('/suppliers/:id', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      const input = await context.req.json<SupplierInput>();
      return context.json({
        data: await procurement.updateSupplier(
          numberParam(context.req.param('id')),
          input,
          capabilities,
        ),
      });
    });

    // Purchase requests: every signed-in user may create and read their own.
    routes.get('/requests', async (context) => {
      const actor = actorOf(context);
      return context.json({
        data: await procurement.listRequests(
          actor,
          await capabilitiesOf(actor),
        ),
      });
    });

    routes.post('/requests', async (context) => {
      const actor = actorOf(context);
      const input = await context.req.json<RequestInput>();
      return context.json(
        { data: await procurement.createRequest(input, actor) },
        201,
      );
    });

    routes.get('/requests/:id', async (context) => {
      const actor = actorOf(context);
      return context.json({
        data: await procurement.getRequest(
          numberParam(context.req.param('id')),
          actor,
          await capabilitiesOf(actor),
        ),
      });
    });

    routes.patch('/requests/:id', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      const input = await context.req.json<RequestInput>();
      return context.json({
        data: await procurement.updateRequest(
          numberParam(context.req.param('id')),
          input,
          actor,
          capabilities,
        ),
      });
    });

    routes.post('/requests/:id/submit', async (context) => {
      const actor = actorOf(context);
      return context.json({
        data: await procurement.submitRequest(
          numberParam(context.req.param('id')),
          actor,
          await capabilitiesOf(actor),
        ),
      });
    });

    routes.post('/requests/:id/approve', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.canApprove);
      return context.json({
        data: await procurement.approveRequest(
          numberParam(context.req.param('id')),
          actor,
        ),
      });
    });

    routes.post('/requests/:id/reject', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.canApprove);
      const body = await context.req.json<{ reason?: string }>();
      return context.json({
        data: await procurement.rejectRequest(
          numberParam(context.req.param('id')),
          actor,
          body.reason ?? '',
        ),
      });
    });

    // Orders and receipts: maintained by administrators and buyers.
    routes.get('/orders', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.manageOrders);
      return context.json({ data: await procurement.listOrders() });
    });

    routes.post('/orders', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.manageOrders);
      const body = await context.req.json<{
        requestId?: number;
        supplierId?: number;
        orderDate?: string;
      }>();
      return context.json(
        {
          data: await procurement.createOrderFromRequest(
            {
              requestId: numberParam(body.requestId),
              supplierId: numberParam(body.supplierId),
              orderDate: String(body.orderDate ?? ''),
            },
            actor,
          ),
        },
        201,
      );
    });

    routes.get('/orders/:id', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.manageOrders);
      return context.json({
        data: await procurement.getOrder(numberParam(context.req.param('id'))),
      });
    });

    routes.post('/orders/:id/receipts', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      requireCapability(capabilities.manageOrders);
      const body = await context.req.json<{
        quantity?: number;
        receivedDate?: string;
      }>();
      return context.json(
        {
          data: await procurement.createReceipt(
            numberParam(context.req.param('id')),
            {
              quantity: Number(body.quantity),
              receivedDate: String(body.receivedDate ?? ''),
            },
            actor,
          ),
        },
        201,
      );
    });

    // Statistics: readable by every signed-in user.
    routes.get('/statistics', async (context) => {
      actorOf(context);
      return context.json({ data: await procurement.statistics() });
    });

    // Attachments. Uploads land in the file repository, then a link row binds
    // the stored file to its supplier or request.
    routes.post('/attachments', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      const body = await context.req.parseBody();
      const file = body.file;
      const ownerType = formText(body.ownerType);
      const ownerId = formText(body.ownerId);
      if (!(file instanceof File)) {
        throw new ProcurementError('INVALID_FILE', 'A file is required.', 400);
      }
      if (ownerType === 'supplier') {
        requireCapability(capabilities.manageSuppliers);
      } else if (ownerType === 'request') {
        await procurement.getRequest(numberParam(ownerId), actor, capabilities);
      } else {
        throw new ProcurementError(
          'INVALID_ATTACHMENT_OWNER',
          'Unknown attachment owner.',
          400,
        );
      }
      const repository = files();
      await repository.validateCollection();
      const { record } = await repository.uploadOne({ file });
      const attachment = await procurement.addAttachment(
        ownerType,
        ownerId,
        String(record.id),
      );
      return context.json({ data: attachment }, 201);
    });

    routes.get('/attachments/:id/content', async (context) => {
      const actor = actorOf(context);
      const capabilities = await capabilitiesOf(actor);
      const attachment = await procurement.getAttachment(
        numberParam(context.req.param('id')),
      );
      // A file inherits the access rule of what it is attached to.
      if (attachment.ownerType === 'supplier') {
        requireCapability(capabilities.manageSuppliers);
      } else if (attachment.ownerType === 'request') {
        await procurement.getRequest(
          numberParam(attachment.ownerId),
          actor,
          capabilities,
        );
      }
      const record = await app.container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('procurementFiles')
        .selectAll()
        .where('id', '=', attachment.fileId)
        .executeTakeFirst();
      if (!record) {
        throw new ProcurementError('FILE_NOT_FOUND', 'File not found.', 404);
      }
      const disk = app.container
        .resolve(driveManagerToken)
        .use(String(record.disk));
      const key = String(record.key);
      if (!(await disk.exists(key))) {
        throw new ProcurementError('FILE_NOT_FOUND', 'File not found.', 404);
      }
      const filename = textOf(record.filename, 'download');
      context.header(
        'Content-Type',
        textOf(record.mimeType, 'application/octet-stream'),
      );
      context.header('Content-Length', textOf(record.size));
      context.header('X-Content-Type-Options', 'nosniff');
      context.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      return context.body(Readable.toWeb(await disk.getStream(key)));
    });

    router.route('/procurement', routes);
    return router;
  },
);

function numberParam(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ProcurementError(
      'INVALID_IDENTIFIER',
      'Invalid identifier.',
      400,
    );
  }
  return parsed;
}

/** Read a multipart text field without stringifying uploaded files or arrays. */
function formText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Read a database column as text without stringifying objects. */
function textOf(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

interface RegistrationInput {
  readonly name?: string;
  readonly username?: string;
  readonly email?: string;
  readonly password?: string;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
