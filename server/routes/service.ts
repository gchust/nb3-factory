import { Hono, type Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import type { AppApiRouteContribution } from '@nocobase/app-server/router';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
  type SelectQuery,
} from '@nocobase/db';
import {
  authenticationToken,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import {
  ServiceError,
  serviceAccessToken,
  type ServiceIdentity,
} from '../service/access.js';
import { serviceAssistantToken } from '../service/assistant.js';
import { serviceAttachmentToken } from '../service/attachments.js';
import { serviceInspectionToken } from '../service/inspections.js';
import { serviceIntegrationToken } from '../service/integration.js';
import { serviceNotificationToken } from '../service/notifications.js';
import { serviceTicketToken, type TicketAction } from '../service/tickets.js';

/** A database-layer select query over untyped rows; every chain stays a `SelectQuery`. */
type ServiceQuery = SelectQuery;

/**
 * The after-sales service HTTP surface.
 *
 * Every path below `/service` requires a session, and every handler resolves
 * the caller's own business identity before reading or writing. Visibility is
 * narrowed in SQL through `ServiceAccessService`, never by returning rows and
 * filtering them in the browser.
 */
export const serviceRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const container = app.container;
    const auth = container.resolve(authenticationToken);

    router.onError((error, context) => {
      if (error instanceof ServiceError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      throw error;
    });

    router.use('/service/*', auth.required());

    const access = () => container.resolve(serviceAccessToken);
    const database = (): DatabaseManager =>
      container.resolve(databaseManagerToken);

    const identityOf = async (context: Context): Promise<ServiceIdentity> => {
      const session = context.get('auth') as AuthSession;
      if (!session?.user) {
        throw new ServiceError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      }
      return access().identityFor(String(session.user.id));
    };

    const actorOf = (context: Context) => {
      const session = context.get('auth') as AuthSession;
      const user = session?.user;
      return {
        id: String(user?.id ?? ''),
        name: user?.name ?? null,
        role: null,
      };
    };

    /** Runs a list query and the matching count without repeating the filters. */
    const paginate = async (
      table: string,
      apply: (query: ServiceQuery) => ServiceQuery | Promise<ServiceQuery>,
      page: number,
      pageSize: number,
      order: { column: string; direction: 'asc' | 'desc' } = {
        column: 'id',
        direction: 'asc',
      },
    ): Promise<{ rows: Row[]; total: number }> => {
      const filtered = await apply(database().query().selectFrom(table));
      const rows = await filtered
        .selectAll()
        .orderBy(order.column, order.direction)
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();
      const countRow = await filtered
        .select(({ fn }) => [fn.countAll().as('count')])
        .executeTakeFirst();
      return { rows, total: Number(countRow?.count ?? 0) };
    };

    const pageParams = (context: Context) => {
      const page = positiveInt(context.req.query('page'), 1);
      const pageSize = Math.min(
        positiveInt(context.req.query('pageSize'), 20),
        100,
      );
      return { page, pageSize };
    };

    /**
     * Device ids an identity may see when it is not entitled to the whole
     * register: `null` means "all", an empty list means "none".
     */
    const visibleDeviceIds = async (
      identity: ServiceIdentity,
    ): Promise<number[] | null> => {
      if (identity.devices === 'all') return null;
      const linked = await access().linkedDeviceIds(identity);
      const query = await access().scopeRegionQuery(
        database().query().selectFrom('service_devices').select(['id']),
        identity,
        identity.devices,
        linked,
      );
      const rows = await query.execute<{ id: number | string }>();
      return rows.map((row) => Number(row.id));
    };

    /** Ticket scope columns, read from a loaded row. */
    const scopeOf = (row: Row) => ({
      id: Number(row.id),
      region: (row.region as string | null) ?? null,
      assigneeId: (row.assigneeId as string | null) ?? null,
      reporterId: (row.reporterId as string | null) ?? null,
      confidential: row.confidential,
    });

    // --- Caller ------------------------------------------------------------

    router.get('/service/me', async (context) => {
      const identity = await identityOf(context);
      return context.json({ data: identity });
    });

    router.get('/service/teams', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const teams = await database()
        .query()
        .selectFrom('service_teams')
        .selectAll()
        .orderBy('id', 'asc')
        .execute<Row>();
      const members = await database()
        .query()
        .selectFrom('service_team_members')
        .selectAll()
        .orderBy('id', 'asc')
        .execute<Row>();
      return context.json({
        data: teams.map((team) => ({
          ...team,
          members: members.filter(
            (member) => Number(member.teamId) === Number(team.id),
          ),
        })),
      });
    });

    router.get('/service/accounts', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const rows = await database()
        .query()
        .selectFrom('user')
        .select(['id', 'name', 'email'])
        .orderBy('id', 'asc')
        .execute<Row>();
      return context.json({ data: rows });
    });

    // --- Dashboard ---------------------------------------------------------

    router.get('/service/dashboard', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const dashboard = await container
        .resolve(serviceInspectionToken)
        .dashboard(identity);
      return context.json({ data: dashboard });
    });

    // --- Customers ---------------------------------------------------------

    router.get('/service/customers', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const { page, pageSize } = pageParams(context);
      const search = context.req.query('search')?.trim();
      const region = context.req.query('region')?.trim();
      const status = context.req.query('status')?.trim();

      const apply = async (query: ServiceQuery) => {
        let scoped = await access().scopeRegionQuery(
          query,
          identity,
          identity.customers,
          await access().linkedCustomerIds(identity),
        );
        if (search) {
          scoped = scoped.where((eb) =>
            eb.or([
              eb('name', 'like', `%${search}%`),
              eb('code', 'like', `%${search}%`),
              eb('contactName', 'like', `%${search}%`),
            ]),
          );
        }
        if (region) scoped = scoped.where('region', '=', region);
        if (status) scoped = scoped.where('status', '=', status);
        return scoped;
      };

      const { rows, total } = await paginate(
        'service_customers',
        apply,
        page,
        pageSize,
      );
      return context.json({ data: rows, meta: { page, pageSize, total } });
    });

    router.get('/service/customers/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const id = numericParam(context, 'id');
      const row = await database()
        .query()
        .selectFrom('service_customers')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      if (
        !row ||
        !access().canReadCustomer(identity, (row.region as string) ?? null)
      ) {
        throw new ServiceError(
          404,
          'CUSTOMER_NOT_FOUND',
          'Customer not found.',
        );
      }
      const devices = await database()
        .query()
        .selectFrom('service_devices')
        .selectAll()
        .where('customerId', '=', id)
        .orderBy('id', 'asc')
        .execute<Row>();
      const tickets = container.resolve(serviceTicketToken);
      const ticketRows = await (
        await access().scopeTicketQuery(
          database()
            .query()
            .selectFrom('service_tickets')
            .selectAll()
            .where('customerId', '=', id)
            .orderBy('id', 'desc')
            .limit(20),
          identity,
        )
      ).execute<Row>();
      return context.json({
        data: {
          ...row,
          devices,
          tickets: ticketRows.map((ticket) =>
            tickets.sanitizeFor(identity, ticket),
          ),
        },
      });
    });

    // --- Devices -----------------------------------------------------------

    router.get('/service/devices', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const { page, pageSize } = pageParams(context);
      const search = context.req.query('search')?.trim();
      const region = context.req.query('region')?.trim();
      const status = context.req.query('status')?.trim();
      const customerId = positiveInt(context.req.query('customerId'), 0);
      const linked = await access().linkedDeviceIds(identity);

      const apply = async (query: ServiceQuery) => {
        let scoped = await access().scopeRegionQuery(
          query,
          identity,
          identity.devices,
          linked,
        );
        if (search) {
          scoped = scoped.where((eb) =>
            eb.or([
              eb('name', 'like', `%${search}%`),
              eb('serialNumber', 'like', `%${search}%`),
              eb('model', 'like', `%${search}%`),
            ]),
          );
        }
        if (region) scoped = scoped.where('region', '=', region);
        if (status) scoped = scoped.where('status', '=', status);
        if (customerId > 0)
          scoped = scoped.where('customerId', '=', customerId);
        return scoped;
      };

      const { rows, total } = await paginate(
        'service_devices',
        apply,
        page,
        pageSize,
      );
      return context.json({ data: rows, meta: { page, pageSize, total } });
    });

    router.get('/service/devices/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const id = numericParam(context, 'id');
      const row = await database()
        .query()
        .selectFrom('service_devices')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      if (
        !row ||
        !access().canReadDevice(identity, (row.region as string) ?? null)
      ) {
        throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'Device not found.');
      }
      const customer = await database()
        .query()
        .selectFrom('service_customers')
        .select(['id', 'code', 'name', 'region'])
        .where('id', '=', Number(row.customerId))
        .executeTakeFirst<Row>();
      const tickets = container.resolve(serviceTicketToken);
      const ticketRows = await (
        await access().scopeTicketQuery(
          database()
            .query()
            .selectFrom('service_tickets')
            .selectAll()
            .where('deviceId', '=', id)
            .orderBy('id', 'desc')
            .limit(20),
          identity,
        )
      ).execute<Row>();
      const inspections = await database()
        .query()
        .selectFrom('service_inspection_tasks')
        .selectAll()
        .where('deviceId', '=', id)
        .orderBy('id', 'desc')
        .limit(10)
        .execute<Row>();
      return context.json({
        data: {
          ...row,
          customer: customer ?? null,
          tickets: ticketRows.map((ticket) =>
            tickets.sanitizeFor(identity, ticket),
          ),
          inspections,
        },
      });
    });

    // --- Tickets -----------------------------------------------------------

    router.get('/service/tickets', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const { page, pageSize } = pageParams(context);
      const status = context.req.query('status')?.trim();
      const region = context.req.query('region')?.trim();
      const priority = context.req.query('priority')?.trim();
      const assigneeId = context.req.query('assigneeId')?.trim();
      const customerId = positiveInt(context.req.query('customerId'), 0);
      const deviceId = positiveInt(context.req.query('deviceId'), 0);
      const search = context.req.query('search')?.trim();
      const confidential = context.req.query('confidential');
      const overdue = context.req.query('overdue');

      const apply = async (query: ServiceQuery) => {
        let scoped = await access().scopeTicketQuery(query, identity);
        if (status) scoped = scoped.where('status', '=', status);
        if (region) scoped = scoped.where('region', '=', region);
        if (priority) scoped = scoped.where('priority', '=', priority);
        if (assigneeId) scoped = scoped.where('assigneeId', '=', assigneeId);
        if (customerId > 0)
          scoped = scoped.where('customerId', '=', customerId);
        if (deviceId > 0) scoped = scoped.where('deviceId', '=', deviceId);
        if (confidential === 'true')
          scoped = scoped.where('confidential', '=', true);
        if (confidential === 'false')
          scoped = scoped.where('confidential', '=', false);
        if (overdue === 'true') scoped = scoped.where('overdue', '=', true);
        if (search) {
          scoped = scoped.where((eb) =>
            eb.or([
              eb('serial', 'like', `%${search}%`),
              eb('title', 'like', `%${search}%`),
              eb('customerName', 'like', `%${search}%`),
              eb('deviceSerial', 'like', `%${search}%`),
            ]),
          );
        }
        return scoped;
      };

      const { rows, total } = await paginate(
        'service_tickets',
        apply,
        page,
        pageSize,
        { column: 'id', direction: 'desc' },
      );
      const tickets = container.resolve(serviceTicketToken);
      return context.json({
        data: rows.map((row) => tickets.sanitizeFor(identity, row)),
        meta: { page, pageSize, total },
      });
    });

    router.get('/service/tickets/:id', async (context) => {
      const identity = await identityOf(context);
      const tickets = container.resolve(serviceTicketToken);
      const id = numericParam(context, 'id');
      const ticket = await tickets.loadTicket(id);
      const scope = scopeOf(ticket);
      await access().requireTicketRead(identity, scope);
      const logs = await tickets.logsFor(id);
      const shares = await tickets.sharesFor(id);
      const canManageShares =
        identity.manageAll || access().canShareTicket(identity, scope);
      const attachments = await database()
        .query()
        .selectFrom('service_attachments')
        .selectAll()
        .where('ticketId', '=', id)
        .orderBy('id', 'asc')
        .execute<Row>();
      return context.json({
        data: {
          ...tickets.sanitizeFor(identity, ticket),
          logs: logs.map((log) => tickets.sanitizeLog(log)),
          shares: canManageShares
            ? shares
            : shares.filter((share) => share.userId === identity.userId),
          canShare: canManageShares,
          canSeeInternalFields: access().canSeeInternalFields(identity, scope),
          attachments,
        },
      });
    });

    router.post('/service/tickets', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const body = await readJson(context);
      const values = { ...((body.values as Record<string, unknown>) ?? {}) };
      if (!values.region) values.region = identity.regions[0] ?? 'east';
      const tickets = container.resolve(serviceTicketToken);
      const ticket = await tickets.create({ values, actor: actorOf(context) });
      return context.json({ data: tickets.sanitizeFor(identity, ticket) });
    });

    router.patch('/service/tickets/:id', async (context) => {
      const identity = await identityOf(context);
      const id = numericParam(context, 'id');
      const body = await readJson(context);
      const tickets = container.resolve(serviceTicketToken);
      const ticket = await tickets.updateDraft({
        ticketId: id,
        values: (body.values as Record<string, unknown>) ?? {},
        actor: actorOf(context),
        identity,
      });
      return context.json({ data: tickets.sanitizeFor(identity, ticket) });
    });

    router.post('/service/tickets/:id/actions', async (context) => {
      const identity = await identityOf(context);
      const id = numericParam(context, 'id');
      const body = await readJson(context);
      const tickets = container.resolve(serviceTicketToken);
      const result = await tickets.applyAction({
        ticketId: id,
        action: bodyText(body.action) as TicketAction,
        payload: (body.payload as Record<string, unknown>) ?? {},
        requestKey: (body.idempotencyKey as string | undefined) ?? null,
        actor: actorOf(context),
        identity,
      });
      return context.json({
        data: {
          replayed: result.replayed,
          warnings: result.warnings,
          ticket: tickets.sanitizeFor(identity, result.ticket),
          logs: result.logs.map((log) => tickets.sanitizeLog(log)),
        },
      });
    });

    router.post('/service/tickets/:id/shares', async (context) => {
      const identity = await identityOf(context);
      const id = numericParam(context, 'id');
      const body = await readJson(context);
      await container.resolve(serviceTicketToken).share({
        ticketId: id,
        userId: bodyText(body.userId),
        userName: bodyText(body.userName),
        reason: body.reason as string | undefined,
        actor: actorOf(context),
        identity,
      });
      return context.json({ data: { ok: true } });
    });

    router.delete('/service/tickets/:id/shares/:userId', async (context) => {
      const identity = await identityOf(context);
      const id = numericParam(context, 'id');
      await container.resolve(serviceTicketToken).unshare({
        ticketId: id,
        userId: String(context.req.param('userId')),
        identity,
      });
      return context.json({ data: { ok: true } });
    });

    // --- Knowledge ---------------------------------------------------------

    router.get('/service/knowledge', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const { page, pageSize } = pageParams(context);
      const canWrite = identity.manageKnowledge;
      const search = context.req.query('search')?.trim();
      const category = context.req.query('category')?.trim();
      const status = context.req.query('status')?.trim();

      const apply = (query: ServiceQuery) => {
        let scoped = query;
        if (!canWrite) scoped = scoped.where('status', '=', 'published');
        else if (status) scoped = scoped.where('status', '=', status);
        if (category) scoped = scoped.where('category', '=', category);
        if (search) {
          scoped = scoped.where((eb) =>
            eb.or([
              eb('title', 'like', `%${search}%`),
              eb('summary', 'like', `%${search}%`),
              eb('content', 'like', `%${search}%`),
            ]),
          );
        }
        return scoped;
      };

      const { rows, total } = await paginate(
        'service_knowledge_articles',
        apply,
        page,
        pageSize,
        { column: 'id', direction: 'desc' },
      );
      return context.json({ data: rows, meta: { page, pageSize, total } });
    });

    router.get('/service/knowledge/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const id = numericParam(context, 'id');
      const row = await database()
        .query()
        .selectFrom('service_knowledge_articles')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      if (!row) {
        throw new ServiceError(
          404,
          'ARTICLE_NOT_FOUND',
          'Knowledge article not found.',
        );
      }
      if (String(row.status) !== 'published' && !identity.manageKnowledge) {
        throw new ServiceError(
          404,
          'ARTICLE_NOT_FOUND',
          'Knowledge article not found.',
        );
      }
      const attachments = await database()
        .query()
        .selectFrom('service_attachments')
        .selectAll()
        .where('knowledgeArticleId', '=', id)
        .orderBy('id', 'asc')
        .execute<Row>();
      return context.json({ data: { ...row, attachments } });
    });

    router.post('/service/knowledge', async (context) => {
      const identity = await identityOf(context);
      access().requireKnowledgeWrite(identity);
      const body = await readJson(context);
      const values = (body.values as Record<string, unknown>) ?? {};
      const title = bodyText(values.title).trim();
      if (!title) {
        throw new ServiceError(
          400,
          'TITLE_REQUIRED',
          'A knowledge title is required.',
        );
      }
      const now = new Date().toISOString();
      const result = await database()
        .query()
        .insertInto('service_knowledge_articles')
        .values({
          slug: `${slugify(title)}-${Date.now().toString(36)}`,
          title,
          summary: values.summary ?? null,
          content: values.content ?? null,
          category: bodyText(values.category, 'general'),
          status: 'draft',
          tags: values.tags ?? null,
          authorId: identity.userId,
          authorName: values.authorName ?? null,
          publishedAt: null,
          viewCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return context.json({ data: { id: Number(result.insertId ?? 0) } });
    });

    router.patch('/service/knowledge/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireKnowledgeWrite(identity);
      const id = numericParam(context, 'id');
      const body = await readJson(context);
      const values = (body.values as Record<string, unknown>) ?? {};
      const changes: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      for (const key of ['title', 'summary', 'content', 'category', 'tags']) {
        if (values[key] !== undefined) changes[key] = values[key];
      }
      await database()
        .query()
        .updateTable('service_knowledge_articles')
        .set(changes)
        .where('id', '=', id)
        .execute();
      return context.json({ data: { ok: true } });
    });

    router.post('/service/knowledge/:id/publish', async (context) => {
      const identity = await identityOf(context);
      access().requireKnowledgeWrite(identity);
      const id = numericParam(context, 'id');
      const body = await readJson(context);
      const publish = body.publish !== false;
      const now = new Date().toISOString();
      await database()
        .query()
        .updateTable('service_knowledge_articles')
        .set({
          status: publish ? 'published' : 'draft',
          publishedAt: publish ? now : null,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      return context.json({
        data: { ok: true, status: publish ? 'published' : 'draft' },
      });
    });

    // --- Inspections -------------------------------------------------------

    router.get('/service/inspections/plans', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const rows = await database()
        .query()
        .selectFrom('service_inspection_plans')
        .selectAll()
        .orderBy('id', 'asc')
        .execute<Row>();
      return context.json({ data: rows });
    });

    router.get('/service/inspections', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const { page, pageSize } = pageParams(context);
      const status = context.req.query('status')?.trim();
      const runDate = context.req.query('runDate')?.trim();
      const deviceId = positiveInt(context.req.query('deviceId'), 0);
      const visible = await visibleDeviceIds(identity);

      const apply = (query: ServiceQuery) => {
        let scoped = query;
        if (status) scoped = scoped.where('status', '=', status);
        if (runDate) scoped = scoped.where('runDate', '=', runDate);
        if (deviceId > 0) scoped = scoped.where('deviceId', '=', deviceId);
        if (visible) {
          scoped = scoped.where(
            'deviceId',
            'in',
            visible.length > 0 ? visible : [-1],
          );
        }
        return scoped;
      };

      const { rows, total } = await paginate(
        'service_inspection_tasks',
        apply,
        page,
        pageSize,
        { column: 'id', direction: 'desc' },
      );
      return context.json({ data: rows, meta: { page, pageSize, total } });
    });

    router.post('/service/inspections/run', async (context) => {
      const identity = await identityOf(context);
      access().requireInspectionWrite(identity);
      const body = await readJson(context);
      const result = await container
        .resolve(serviceInspectionToken)
        .runInspectionTasks({
          runDate: body.runDate as string | undefined,
          planId:
            body.planId === undefined || body.planId === null
              ? undefined
              : Number(body.planId),
          triggeredBy: 'manual',
        });
      return context.json({ data: result });
    });

    router.patch('/service/inspections/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireInspectionWrite(identity);
      const id = numericParam(context, 'id');
      const body = await readJson(context);
      const values = (body.values as Record<string, unknown>) ?? {};
      const now = new Date().toISOString();
      const changes: Record<string, unknown> = { updatedAt: now };
      if (values.status !== undefined) changes.status = values.status;
      if (values.result !== undefined) changes.result = values.result;
      if (values.status === 'done') changes.finishedAt = now;
      if (values.status === 'in_progress') changes.startedAt = now;
      await database()
        .query()
        .updateTable('service_inspection_tasks')
        .set(changes)
        .where('id', '=', id)
        .execute();
      return context.json({ data: { ok: true } });
    });

    // --- Attachments -------------------------------------------------------

    router.post('/service/attachments', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const form = await context.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) {
        throw new ServiceError(
          400,
          'FILE_REQUIRED',
          'Attach a file to upload.',
        );
      }
      const ticketId = optionalId(form.ticketId);
      const knowledgeArticleId = optionalId(form.knowledgeArticleId);
      if (ticketId) {
        const ticket = await container
          .resolve(serviceTicketToken)
          .loadTicket(ticketId);
        await access().requireTicketWrite(identity, scopeOf(ticket));
      }
      const attachment = await container
        .resolve(serviceAttachmentToken)
        .upload({
          file,
          identity,
          ticketId,
          knowledgeArticleId,
        });
      return context.json({ data: attachment });
    });

    router.get('/service/attachments', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const ticketId = optionalId(context.req.query('ticketId'));
      const knowledgeArticleId = optionalId(
        context.req.query('knowledgeArticleId'),
      );
      if (ticketId) {
        const ticket = await container
          .resolve(serviceTicketToken)
          .loadTicket(ticketId);
        await access().requireTicketRead(identity, scopeOf(ticket));
      } else if (!knowledgeArticleId) {
        throw new ServiceError(
          400,
          'FILTER_REQUIRED',
          'List attachments for one ticket or one knowledge article.',
        );
      }
      const rows = await container.resolve(serviceAttachmentToken).list({
        ticketId,
        knowledgeArticleId,
      });
      return context.json({ data: rows });
    });

    router.get('/service/attachments/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const { attachment, bytes } = await container
        .resolve(serviceAttachmentToken)
        .read(context.req.param('id'), identity);
      return context.body(new Uint8Array(bytes), 200, {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(
          attachment.filename,
        )}`,
        'Cache-Control': 'private, no-store',
      });
    });

    router.delete('/service/attachments/:id', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      await container
        .resolve(serviceAttachmentToken)
        .remove(context.req.param('id'), identity);
      return context.json({ data: { ok: true } });
    });

    // --- Messages ----------------------------------------------------------

    router.get('/service/messages/count', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const notifications = container.resolve(serviceNotificationToken);
      return context.json({
        data: {
          unread: await notifications.unreadCount(identity.userId),
          status: notifications.status(),
        },
      });
    });

    router.get('/service/messages/deliveries', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const ticketId = optionalId(context.req.query('ticketId'));
      const notifications = container.resolve(serviceNotificationToken);
      const rows = await notifications.listDeliveries({ ticketId });
      return context.json({
        data: identity.manageAll
          ? rows
          : rows.filter((row) => row.recipientId === identity.userId),
        meta: { status: notifications.status() },
      });
    });

    router.post('/service/messages/deliveries/:id/retry', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const notifications = container.resolve(serviceNotificationToken);
      const delivery = await notifications.retry(
        Number(context.req.param('id')),
      );
      if (!identity.manageAll && delivery.recipientId !== identity.userId) {
        throw new ServiceError(
          404,
          'DELIVERY_NOT_FOUND',
          'Delivery record not found.',
        );
      }
      return context.json({ data: delivery });
    });

    router.get('/service/messages', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const limit = Math.min(positiveInt(context.req.query('limit'), 20), 100);
      const unreadOnly = context.req.query('unreadOnly') === 'true';
      const beforeCreatedAt = context.req.query('beforeCreatedAt');
      const beforeId = context.req.query('beforeId');
      const notifications = container.resolve(serviceNotificationToken);
      const items = await notifications.inbox(identity.userId, {
        unreadOnly,
        limit,
        before:
          beforeCreatedAt && beforeId
            ? { createdAt: beforeCreatedAt, id: beforeId }
            : undefined,
      });
      return context.json({
        data: items,
        meta: { unread: await notifications.unreadCount(identity.userId) },
      });
    });

    router.post('/service/messages/actions', async (context) => {
      const identity = await identityOf(context);
      access().requireMember(identity);
      const body = await readJson(context);
      const notifications = container.resolve(serviceNotificationToken);
      const action = bodyText(body.action);
      if (action === 'mark-all-read') {
        const count = await notifications.markAllRead(identity.userId);
        return context.json({ data: { updated: count } });
      }
      const id = bodyText(body.id);
      if (!id || !['read', 'unread', 'delete'].includes(action)) {
        throw new ServiceError(400, 'INVALID_ACTION', 'Unknown inbox action.');
      }
      const item = await notifications.updateInbox(
        identity.userId,
        id,
        action as 'read' | 'unread' | 'delete',
      );
      if (!item) {
        throw new ServiceError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
      }
      return context.json({ data: item });
    });

    // --- Assistant ---------------------------------------------------------

    router.get('/service/assistant/status', async (context) => {
      const identity = await identityOf(context);
      access().requireAssistant(identity);
      return context.json({
        data: container.resolve(serviceAssistantToken).status(),
      });
    });

    router.post('/service/assistant/ask', async (context) => {
      const identity = await identityOf(context);
      const body = await readJson(context);
      const answer = await container.resolve(serviceAssistantToken).ask({
        identity,
        question: bodyText(body.question),
        ticketId:
          body.ticketId === undefined || body.ticketId === null
            ? null
            : Number(body.ticketId),
      });
      return context.json({ data: answer });
    });

    router.post('/service/assistant/actions/confirm', async (context) => {
      const identity = await identityOf(context);
      const body = await readJson(context);
      const result = await container.resolve(serviceAssistantToken).confirm({
        identity,
        proposal: body.proposal as never,
        acknowledge: body.acknowledge === true,
      });
      return context.json({ data: result });
    });

    // --- Integration -------------------------------------------------------

    router.get('/service/integration/events', async (context) => {
      const identity = await identityOf(context);
      const rows = await container
        .resolve(serviceIntegrationToken)
        .listEvents(identity, positiveInt(context.req.query('limit'), 50));
      return context.json({ data: rows });
    });

    router.post('/service/integration/events', async (context) => {
      const identity = await identityOf(context);
      const body = await readJson(context);
      const result = await container.resolve(serviceIntegrationToken).ingest({
        identity,
        actor: actorOf(context),
        event: {
          idempotencyKey: bodyText(body.idempotencyKey),
          eventType: bodyText(body.eventType),
          deviceSerial: (body.deviceSerial as string | undefined) ?? null,
          ticketSerial: (body.ticketSerial as string | undefined) ?? null,
          payload:
            (body.payload as Record<string, unknown> | undefined) ?? null,
        },
      });
      return context.json({
        data: {
          replayed: result.replayed,
          message: result.message,
          ticketId: result.ticketId ?? null,
          event: result.event,
        },
      });
    });

    return router;
  });

function numericParam(context: Context, name: string): number {
  const value = Number(context.req.param(name));
  if (!Number.isFinite(value) || value <= 0) {
    throw new ServiceError(400, 'INVALID_ID', `Invalid ${name}.`);
  }
  return value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function optionalId(
  value: string | File | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value instanceof File)
    return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** A string from an untyped JSON body, without letting an object reach a template. */
function bodyText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug.slice(0, 100) : 'article';
}
