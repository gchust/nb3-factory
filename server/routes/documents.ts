import { randomUUID } from 'node:crypto';

import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  serverFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import type { Context } from 'hono';

import {
  DOCUMENT_ATTACHMENT_ACCESS_PATH,
  DOCUMENT_ATTACHMENT_DISK,
  DOCUMENT_ATTACHMENT_FILES_COLLECTION,
} from './document-attachments.js';

const DOCUMENTS_COLLECTION = 'documents';
const TITLE_MAX_LENGTH = 200;

/** The `attachmentId` sentinel for a value that names no stored file. */
const INVALID_ATTACHMENT = Symbol('invalid-attachment');

/**
 * The business half of the attachment feature (#252): read the two documents,
 * create one, and attach or detach an uploaded file. The file bytes themselves
 * belong to the File plugin's routes; this route only stores the association.
 */
export const documentsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);
    const documents = database.repository(DOCUMENTS_COLLECTION);
    const files = app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository(DOCUMENT_ATTACHMENT_FILES_COLLECTION, {
        disk: DOCUMENT_ATTACHMENT_DISK,
        accessPath: DOCUMENT_ATTACHMENT_ACCESS_PATH,
        policy: { read: true, create: false, update: false, delete: false },
      });
    const basePath = (app.publicBasePath ?? '').replace(/\/$/, '');
    const contentUrl = (record: Pick<FileRecord, 'id' | 'ext'>): string =>
      `${basePath}${files.getUrl(record)}`;
    const attachmentView = (record: FileRecord | undefined) =>
      record ? { ...record, contentUrl: contentUrl(record) } : null;

    const resolveAttachmentId = async (
      value: unknown,
    ): Promise<string | null | typeof INVALID_ATTACHMENT> => {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value !== 'string') return INVALID_ATTACHMENT;
      const exists = await files.exists({ filter: { id: value } });
      return exists ? value : INVALID_ATTACHMENT;
    };

    const decorate = async (record: Record<string, unknown> | undefined) => {
      if (!record) return null;
      const attachmentId =
        typeof record.attachmentId === 'string'
          ? record.attachmentId
          : undefined;
      const attachment = attachmentId
        ? await files.findOne({ filter: { id: attachmentId } })
        : undefined;
      return { ...record, attachment: attachmentView(attachment) };
    };

    const router = new Hono();
    router.use('/documents', auth.required());
    router.use('/documents/*', auth.required());

    router.get('/documents', async (context) => {
      const records = await documents.findMany({
        sort: (sort) => sort.field('createdAt').asc(),
      });
      const attachmentIds = records
        .map((record) => record.attachmentId)
        .filter((value): value is string => typeof value === 'string');
      const attachments = attachmentIds.length
        ? await files.findMany({
            filter: (filter) =>
              filter.or(attachmentIds.map((id) => filter.string('id').eq(id))),
          })
        : [];
      const attachmentsById = new Map(
        attachments.map((record) => [record.id, record]),
      );
      return context.json({
        data: records.map((record) => {
          const attachmentId =
            typeof record.attachmentId === 'string'
              ? record.attachmentId
              : undefined;
          return {
            ...record,
            attachment: attachmentView(
              attachmentId ? attachmentsById.get(attachmentId) : undefined,
            ),
          };
        }),
      });
    });

    router.post('/documents', async (context) => {
      const body = await readJsonObject(context);
      if (!body)
        return badRequest(context, 'INVALID_BODY', 'A JSON body is required.');
      const title = normalizeTitle(body.title);
      if (!title) {
        return badRequest(
          context,
          'INVALID_TITLE',
          `A title of at most ${TITLE_MAX_LENGTH} characters is required.`,
        );
      }
      const attachmentId = await resolveAttachmentId(body.attachmentId);
      if (attachmentId === INVALID_ATTACHMENT) {
        return badRequest(
          context,
          'INVALID_ATTACHMENT',
          'The attachment does not exist.',
        );
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      await documents.createOne({
        values: { id, title, attachmentId, createdAt: now, updatedAt: now },
      });
      const created = await documents.findOne({ filter: { id } });
      return context.json({ data: await decorate(created) }, 201);
    });

    router.patch('/documents/:id', async (context) => {
      const id = context.req.param('id');
      const existing = await documents.findOne({ filter: { id } });
      if (!existing) {
        return context.json(
          { code: 'NOT_FOUND', message: 'The document does not exist.' },
          404,
        );
      }
      const body = await readJsonObject(context);
      if (!body)
        return badRequest(context, 'INVALID_BODY', 'A JSON body is required.');

      const values: Record<string, string | null> = {};
      if ('title' in body) {
        const title = normalizeTitle(body.title);
        if (!title) {
          return badRequest(
            context,
            'INVALID_TITLE',
            `A title of at most ${TITLE_MAX_LENGTH} characters is required.`,
          );
        }
        values.title = title;
      }
      if ('attachmentId' in body) {
        const attachmentId = await resolveAttachmentId(body.attachmentId);
        if (attachmentId === INVALID_ATTACHMENT) {
          return badRequest(
            context,
            'INVALID_ATTACHMENT',
            'The attachment does not exist.',
          );
        }
        values.attachmentId = attachmentId;
      }
      if (!('title' in body) && !('attachmentId' in body)) {
        return badRequest(
          context,
          'NO_CHANGES',
          'Provide a title or an attachmentId to update.',
        );
      }
      values.updatedAt = new Date().toISOString();
      await documents.updateOne({ filter: { id }, values });
      const updated = await documents.findOne({ filter: { id } });
      return context.json({ data: await decorate(updated) });
    });

    return router;
  });

function normalizeTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = value.trim();
  return title.length > 0 && title.length <= TITLE_MAX_LENGTH
    ? title
    : undefined;
}

async function readJsonObject(
  context: Context,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await context.req.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function badRequest(context: Context, code: string, message: string) {
  return context.json({ code, message }, 400);
}
