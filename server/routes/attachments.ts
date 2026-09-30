import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import {
  serviceAttachmentServiceToken,
  serviceKnowledgeServiceToken,
} from '../providers/tokens.js';
import {
  AttachmentError,
  ServiceAttachmentService,
} from '../providers/attachment-service.js';
import type { ServiceKnowledgeService } from '../providers/knowledge-service.js';
import {
  authorizeAction,
  errorCode,
  requirePolicy,
  type ServiceEnv,
} from './service-shared.js';

type Owner = { kind: 'ticket' | 'manual'; id: number };

function attachmentError(error: unknown): HTTPException | undefined {
  if (error instanceof AttachmentError) {
    const status = error.code === 'storage_failure' ? 500 : 400;
    return new HTTPException(status, { message: error.message });
  }
  return undefined;
}

async function parentVisible(
  database: DatabaseManager,
  policy: RepositoryPolicy,
  collection: string,
  id: number,
): Promise<boolean> {
  const record = await database
    .repository(collection)
    .withPolicy(policy)
    .findOne({ filter: { id } });
  return Boolean(record);
}

/** Authenticated attachment upload, download and removal. */
export function createAttachmentRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const database: DatabaseManager = app.container.resolve(databaseManagerToken);
  const attachments: ServiceAttachmentService = app.container.resolve(
    serviceAttachmentServiceToken,
  );
  const knowledge = app.container.resolve(serviceKnowledgeServiceToken);
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.post('/', async (context) => {
    const body = await context.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: 'A file field is required' });
    }
    const ticketId = integerValue(body.ticketId);
    const manualId = integerValue(body.manualId);
    const owner: Owner | undefined =
      ticketId !== undefined
        ? { kind: 'ticket', id: ticketId }
        : manualId !== undefined
          ? { kind: 'manual', id: manualId }
          : undefined;
    if (!owner) {
      throw new HTTPException(400, {
        message: 'ticketId or manualId is required',
      });
    }
    if (!ServiceAttachmentService.isAccepted(file, owner)) {
      throw new HTTPException(400, {
        message:
          owner.kind === 'manual'
            ? 'Only PNG images, DOCX documents and Markdown files can be attached'
            : 'Only PNG images and DOCX documents can be attached',
      });
    }

    if (owner.kind === 'ticket') {
      const policies = await authorizeAction(
        context,
        'service.tickets',
        'process',
      );
      const policy = requirePolicy(policies, 'serviceTickets');
      if (
        !(await parentVisible(database, policy, 'serviceTickets', owner.id))
      ) {
        throw new HTTPException(404, { message: 'Not found' });
      }
    } else {
      const policies = await authorizeAction(
        context,
        'service.manuals',
        'manage',
      );
      const policy = requirePolicy(policies, 'serviceManuals');
      if (
        !(await parentVisible(database, policy, 'serviceManuals', owner.id))
      ) {
        throw new HTTPException(404, { message: 'Not found' });
      }
    }

    try {
      const record = await attachments.upload({
        file,
        category: typeof body.category === 'string' ? body.category : undefined,
        owner,
        uploadedById: context.get('auth')!.user.id,
      });
      if (owner.kind === 'manual') {
        await ingestManualDocument(knowledge, owner.id, file, record);
      }
      return context.json({ data: record }, 201);
    } catch (error) {
      throw attachmentError(error) ?? error;
    }
  });

  routes.get('/', async (context) => {
    const ticketId = integerValue(context.req.query('ticketId'));
    const manualId = integerValue(context.req.query('manualId'));
    if (ticketId === undefined && manualId === undefined) {
      throw new HTTPException(400, {
        message: 'ticketId or manualId is required',
      });
    }
    const owner: Owner =
      ticketId !== undefined
        ? { kind: 'ticket', id: ticketId }
        : { kind: 'manual', id: manualId as number };
    await requireOwnerView(context, database, owner);
    const data =
      owner.kind === 'ticket'
        ? await attachments.listForTicket(owner.id)
        : await attachments.listForManual(owner.id);
    return context.json({ data });
  });

  routes.get('/:id', async (context) => {
    const id = context.req.param('id');
    const record = await attachments.get(id);
    if (!record) throw new HTTPException(404, { message: 'Not found' });
    const owner = ownerOf(record);
    await requireOwnerView(context, database, owner);
    const stream = await attachments.open(record);
    const disposition =
      stream.mimeType === 'image/png' ? 'inline' : 'attachment';
    const filename = stream.filename.replace(/["\r\n]/g, '_');
    const web = Readable.toWeb(stream.stream) as unknown as ReadableStream;
    return new Response(web, {
      status: 200,
      headers: {
        'content-type': stream.mimeType,
        'content-length': String(stream.size),
        'content-disposition': `${disposition}; filename="${filename}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  });

  routes.delete('/:id', async (context) => {
    const id = context.req.param('id');
    const record = await attachments.get(id);
    if (!record) throw new HTTPException(404, { message: 'Not found' });
    const owner = ownerOf(record);
    if (owner.kind === 'ticket') {
      const policies = await authorizeAction(
        context,
        'service.tickets',
        'process',
      );
      const policy = requirePolicy(policies, 'serviceTickets');
      if (
        !(await parentVisible(database, policy, 'serviceTickets', owner.id))
      ) {
        throw new HTTPException(404, { message: 'Not found' });
      }
    } else {
      const policies = await authorizeAction(
        context,
        'service.manuals',
        'manage',
      );
      const policy = requirePolicy(policies, 'serviceManuals');
      if (
        !(await parentVisible(database, policy, 'serviceManuals', owner.id))
      ) {
        throw new HTTPException(404, { message: 'Not found' });
      }
    }
    try {
      await attachments.remove(record);
      return context.json({ data: { id, removed: true } });
    } catch (error) {
      if (errorCode(error) === 'recordNotFound') {
        throw new HTTPException(404, { message: 'Not found' });
      }
      throw error;
    }
  });

  return routes;
}

async function ingestManualDocument(
  knowledge: ServiceKnowledgeService,
  manualId: number,
  file: File,
  record: { mimeType: string },
): Promise<void> {
  // A Markdown manual is plain text: read the bytes we just stored straight
  // into the manual body so its procedure becomes searchable. Other formats
  // stay attachments, and the index state still reflects the real services.
  if (record.mimeType === 'text/markdown') {
    const text = await file.text();
    await knowledge.setManualContent(manualId, text.slice(0, 200_000));
  }
  await knowledge.reconcileManualIndex(manualId);
}

async function requireOwnerView(
  context: Parameters<typeof authorizeAction>[0],
  database: DatabaseManager,
  owner: Owner,
): Promise<void> {
  if (owner.kind === 'ticket') {
    const policies = await authorizeAction(context, 'service.tickets', 'view');
    const policy = requirePolicy(policies, 'serviceTickets');
    if (!(await parentVisible(database, policy, 'serviceTickets', owner.id))) {
      throw new HTTPException(404, { message: 'Not found' });
    }
    return;
  }
  const policies = await authorizeAction(context, 'service.manuals', 'view');
  const policy = requirePolicy(policies, 'serviceManuals');
  if (!(await parentVisible(database, policy, 'serviceManuals', owner.id))) {
    throw new HTTPException(404, { message: 'Not found' });
  }
}

function ownerOf(record: Record<string, unknown>): Owner {
  const ticketId = record.ticketId;
  if (ticketId !== null && ticketId !== undefined) {
    return { kind: 'ticket', id: Number(ticketId) };
  }
  const manualId = record.manualId;
  if (manualId !== null && manualId !== undefined) {
    return { kind: 'manual', id: Number(manualId) };
  }
  throw new HTTPException(404, { message: 'Not found' });
}

function integerValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: 'Invalid numeric id' });
  }
  return parsed;
}
