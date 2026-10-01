import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { RepositoryPolicy } from '@nocobase/db';
import {
  accessServiceToken,
  ticketServiceToken,
} from '../services/contracts.js';
import { validateAttachmentContent } from '../services/attachment-content.js';
import {
  asString,
  asText,
  forbidApiKeyActor,
  readJsonBody,
  readOptionalBody,
  requireActor,
  route,
  toNumber,
} from './helpers.js';

/** The upload path composes every column itself, so the policy only guards the rows. */
const FILE_POLICY: RepositoryPolicy = {
  read: true,
  create: true,
  update: true,
  delete: true,
};

/**
 * Ticket lifecycle, collaboration shares and attachments.
 *
 * Every mutating action is idempotent in the service, so a retried request is
 * safe. Attachment bytes are streamed only after the same read check the
 * ticket detail uses, never through a public URL.
 */
export function createTicketRouter(app: Application): Hono {
  const router = new Hono();
  const tickets = () => app.container.resolve(ticketServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.get(
    '/tickets',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const result = await tickets().listTickets(actor, {
        status: context.req.query('status') || undefined,
        priority: context.req.query('priority') || undefined,
        customerId: toNumber(context.req.query('customerId')),
        assigneeId: context.req.query('assigneeId') || undefined,
        keyword: context.req.query('keyword') || undefined,
        page: toNumber(context.req.query('page')),
        pageSize: toNumber(context.req.query('pageSize')),
      });
      return context.json(result);
    }),
  );

  router.post(
    '/tickets',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const externalEventNo = asString(body.externalEventNo);
      // Replaying the same external event is idempotent: the original ticket
      // is returned with a 200 instead of opening a second one.
      if (externalEventNo) {
        const existing = await tickets().getTicketByExternalEvent(
          actor.id,
          externalEventNo,
        );
        if (existing) {
          return context.json({ data: existing, deduplicated: true }, 200);
        }
      }
      const created = await tickets().createTicket(actor, {
        title: asText(body.title),
        description: asString(body.description),
        customerId:
          body.customerId === null || body.customerId === undefined
            ? undefined
            : Number(body.customerId),
        deviceId:
          body.deviceId === null || body.deviceId === undefined
            ? undefined
            : Number(body.deviceId),
        priority: asString(body.priority),
        confidential:
          body.confidential === true || body.confidential === 'true',
        assigneeId: asString(body.assigneeId),
        dueAt: asString(body.dueAt),
        externalEventNo,
      });
      return context.json({ data: created }, 201);
    }),
  );

  router.get(
    '/tickets/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const ticket = await tickets().getTicket(
        actor,
        Number(context.req.param('id')),
      );
      return context.json({ data: ticket });
    }),
  );

  router.post(
    '/tickets/:id/accept',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readOptionalBody(context);
      const ticketId = Number(context.req.param('id'));
      const note = asString(body.note);

      // Acceptance is orchestrated by the ticket-acceptance workflow, which
      // branches on urgency. A deployment may leave it disabled, so the
      // idempotent service call always runs too: the effect is immediate and
      // the workflow, when enabled, records the branch it took. The shared
      // `ticket-accept:<id>` idempotency key keeps the message single.
      const current = await tickets().getTicket(actor, ticketId);
      let workflow: string = 'unavailable';
      const engine = app.container.has(workflowServiceToken)
        ? app.container.resolve(workflowServiceToken)
        : undefined;
      if (engine) {
        try {
          // The definition is source-managed and a deployment may leave it
          // disabled until an administrator enables it. Running it as a manual,
          // completed run makes the acceptance go through the workflow's
          // priority branch regardless of the stored enable flag, and
          // `waitForCompletion` keeps the HTTP response immediate.
          const receipt = await engine.trigger(
            'ticket-acceptance',
            {
              ticketId,
              operatorId: actor.id,
              priority: current.priority === 'urgent' ? 'urgent' : 'normal',
              ...(note ? { acceptNote: note } : {}),
            },
            { manually: true, waitForCompletion: true },
          );
          if (receipt.status === 'accepted') {
            workflow = 'executed';
            const after = await tickets().getTicket(actor, ticketId);
            if (after.status !== 'pending_acceptance') {
              return context.json({
                data: after,
                changed: after.status !== current.status,
                workflow,
              });
            }
          } else {
            workflow = `skipped:${receipt.reason}`;
          }
        } catch {
          workflow = 'skipped:error';
        }
      }

      const result = await tickets().acceptTicket(actor, ticketId, note);
      return context.json({
        data: result.ticket,
        changed: result.changed,
        workflow,
      });
    }),
  );

  router.post(
    '/tickets/:id/start',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readOptionalBody(context);
      const ticket = await tickets().startProcessing(
        actor,
        Number(context.req.param('id')),
        asString(body.note),
      );
      return context.json({ data: ticket });
    }),
  );

  router.post(
    '/tickets/:id/submit',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const ticket = await tickets().submitResult(
        actor,
        Number(context.req.param('id')),
        {
          resultNote: asText(body.resultNote),
          processNote: asString(body.processNote),
        },
      );
      return context.json({ data: ticket });
    }),
  );

  router.post(
    '/tickets/:id/confirm',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readOptionalBody(context);
      const ticket = await tickets().confirmTicket(
        actor,
        Number(context.req.param('id')),
        asString(body.note),
      );
      return context.json({ data: ticket });
    }),
  );

  router.post(
    '/tickets/:id/return',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const ticket = await tickets().returnTicket(
        actor,
        Number(context.req.param('id')),
        asText(body.reason),
      );
      return context.json({ data: ticket });
    }),
  );

  router.post(
    '/tickets/:id/reaccept',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const ticket = await tickets().requestReacceptance(
        actor,
        Number(context.req.param('id')),
        asText(body.reason),
      );
      return context.json({ data: ticket });
    }),
  );

  router.get(
    '/tickets/:id/shares',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const shares = await tickets().listShares(
        actor,
        Number(context.req.param('id')),
      );
      return context.json({ data: shares });
    }),
  );

  router.post(
    '/tickets/:id/shares',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const share = await tickets().shareTicket(
        actor,
        Number(context.req.param('id')),
        {
          engineerId: asText(body.engineerId),
          expiresAt: asString(body.expiresAt) ?? null,
        },
      );
      return context.json({ data: share }, 201);
    }),
  );

  router.delete(
    '/tickets/:id/shares/:shareId',
    route(async (context) => {
      const actor = await requireActor(context, access());
      await tickets().revokeShare(
        actor,
        Number(context.req.param('id')),
        Number(context.req.param('shareId')),
      );
      return context.json({ data: { revoked: true } });
    }),
  );

  router.get(
    '/tickets/:id/attachments',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const attachments = await tickets().listAttachments(
        actor,
        Number(context.req.param('id')),
      );
      return context.json({ data: attachments });
    }),
  );

  router.post(
    '/tickets/:id/attachments',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const form = await context.req.formData();
      const value = form.get('file');
      if (
        !value ||
        typeof value === 'string' ||
        typeof value.arrayBuffer !== 'function'
      ) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Attach one file.' },
          400,
        );
      }
      const manager = app.container.resolve(serverFileRepositoryManagerToken);
      const declaredKind =
        form.get('kind') === 'photo'
          ? 'photo'
          : form.get('kind') === 'report'
            ? 'report'
            : undefined;
      const problem = validateAttachmentContent(
        new Uint8Array(await value.arrayBuffer()),
        declaredKind,
      );
      if (problem) {
        return context.json(problem, 400);
      }
      const repository = manager.repository('serviceTicketFiles', {
        disk: 'local',
        accessPath: '/service/attachments',
        policy: FILE_POLICY,
      });
      const uploaded = await repository.uploadOne({ file: value });
      const attachment = await tickets().attachFile(
        actor,
        Number(context.req.param('id')),
        uploaded.record.id,
      );
      return context.json({ data: attachment }, 201);
    }),
  );

  router.delete(
    '/tickets/:id/attachments/:attachmentId',
    route(async (context) => {
      const actor = await requireActor(context, access());
      await tickets().removeAttachment(
        actor,
        Number(context.req.param('id')),
        Number(context.req.param('attachmentId')),
      );
      return context.json({ data: { removed: true } });
    }),
  );

  router.get(
    '/tickets/:id/attachments/:attachmentId/content',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const resolved = await tickets().resolveAttachmentFile(
        actor,
        Number(context.req.param('id')),
        Number(context.req.param('attachmentId')),
      );
      const drive = app.container.resolve(driveManagerToken);
      const stream = await drive
        .use(resolved.file.disk)
        .getStream(resolved.file.key);
      const body = Readable.toWeb(stream) as unknown as ReadableStream;
      return new Response(body, {
        headers: {
          'content-type': resolved.file.mimeType || 'application/octet-stream',
          'content-length': String(resolved.file.size),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(resolved.file.filename)}`,
        },
      });
    }),
  );

  return router;
}
