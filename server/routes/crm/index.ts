import { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
  type DatabaseAuthorizationConditions,
  type DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  userManagementServiceToken,
  type UserManagementService,
} from '@nocobase/app-plugin-users/server/tokens';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  crmServiceToken,
  type CrmService,
  CRM_RESOURCES,
  type OpportunityRecord,
} from '../../providers/crm/index.js';
import {
  asObject,
  badRequest,
  CrmError,
  optionalDate,
  optionalEnum,
  optionalString,
  parseContactInput,
  parseCustomerInput,
  parseFollowUpInput,
  parseOpportunityInput,
  requiredEnum,
  requiredId,
  requiredString,
  ATTACHMENT_TARGETS,
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  COMPANY_SIZES,
  FOLLOW_UP_METHODS,
  type JsonObject,
} from '../../providers/crm/domain.js';
import { canManage, resolveCrmRoles } from '../../providers/crm/roles.js';

const CUSTOMER_FIELDS = [
  'id',
  'name',
  'industry',
  'companySize',
  'source',
  'status',
  'ownerId',
  'notes',
  'createdAt',
  'updatedAt',
] as const;
const CONTACT_FIELDS = [
  'id',
  'customerId',
  'name',
  'title',
  'phone',
  'email',
  'isPrimary',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
const OPPORTUNITY_FIELDS = [
  'id',
  'name',
  'customerId',
  'amount',
  'stage',
  'expectedCloseDate',
  'ownerId',
  'wonAmount',
  'lostReason',
  'createdAt',
  'updatedAt',
] as const;
const FOLLOW_UP_FIELDS = [
  'id',
  'customerId',
  'opportunityId',
  'method',
  'summary',
  'nextStep',
  'followedAt',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
const ATTACHMENT_FIELDS = [
  'id',
  'targetType',
  'targetId',
  'fileId',
  'ownerId',
  'createdAt',
] as const;

interface CrmDisk {
  exists(key: string): Promise<boolean>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
}

interface CrmDrive {
  use(name: string): CrmDisk;
}

interface CrmFileRepository {
  validateCollection(): Promise<void>;
  uploadOne(input: { file: File }): Promise<{
    record: { id: string; filename: string; size: number; mimeType: string };
  }>;
  findOne(options: { filter: { id: string } }): Promise<
    | {
        id: string;
        disk: string;
        key: string;
        filename: string;
        ext: string;
        mimeType: string;
        size: number;
      }
    | undefined
  >;
}

interface CrmRouteDependencies {
  readonly auth: Auth;
  readonly authorization: AppAuthorization;
  readonly service: CrmService;
  readonly users: UserManagementService;
  readonly files: CrmFileRepository;
  readonly drive: CrmDrive;
}

export function createCrmRoutes(
  dependencies: CrmRouteDependencies,
): Hono<AuthorizationEnv> {
  const { auth, authorization, service, users, files, drive } = dependencies;
  const router = new Hono<AuthorizationEnv>();

  router.onError((error, context) => {
    if (error instanceof CrmError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as 400,
      );
    }
    throw error;
  });

  router.use(
    '*',
    auth.required() as unknown as MiddlewareHandler<AuthorizationEnv>,
    authorization.middleware(),
  );

  const authorize = async (
    context: Context<AuthorizationEnv>,
    resource: string,
    action: string,
    fields?: DatabaseAuthorizationParams['fields'],
  ): Promise<DatabaseAuthorizationConditions> => {
    const decision = await context
      .get('authz')
      .authorize<DatabaseAuthorizationParams>({
        resource: { type: 'database.collection', id: resource },
        action,
        params: { ...(fields ? { fields } : {}) },
      });
    if (
      decision.effect !== 'conditional' ||
      decision.conditions?.type !== 'database'
    ) {
      throw new CrmError('FORBIDDEN', 403, 'You are not allowed to do that.');
    }
    return decision.conditions as DatabaseAuthorizationConditions;
  };

  const readConditions = (
    context: Context<AuthorizationEnv>,
    resource: string,
    fields: readonly string[],
  ) => authorize(context, resource, 'read', { output: [...fields] });

  const currentUserId = (context: Context<AuthorizationEnv>): string =>
    context.get('authz').identity.principal.id;

  const requireManager = async (
    context: Context<AuthorizationEnv>,
  ): Promise<void> => {
    const roles = await resolveCrmRoles(authorization, currentUserId(context));
    if (!canManage(roles)) {
      throw new CrmError('FORBIDDEN', 403, 'Only a sales manager can do that.');
    }
  };

  const notFound = (message: string): CrmError =>
    new CrmError('NOT_FOUND', 404, message);

  const resolveTargetOwner = async (
    context: Context<AuthorizationEnv>,
    targetType: string,
    targetId: number,
  ): Promise<string> => {
    if (targetType === 'customer') {
      const conditions = await readConditions(
        context,
        CRM_RESOURCES.customers,
        CUSTOMER_FIELDS,
      );
      const customer = await service.getCustomer(targetId, conditions);
      if (!customer) throw notFound('Customer not found.');
      return customer.ownerId;
    }
    if (targetType === 'opportunity') {
      const conditions = await readConditions(
        context,
        CRM_RESOURCES.opportunities,
        OPPORTUNITY_FIELDS,
      );
      const opportunity = await service.getOpportunity(targetId, conditions);
      if (!opportunity) throw notFound('Opportunity not found.');
      return opportunity.ownerId;
    }
    throw badRequest('INVALID_TARGET', 'Unsupported attachment target.');
  };

  // --- session -----------------------------------------------------------

  router.get('/me', async (context) => {
    const userId = currentUserId(context);
    const roles = await resolveCrmRoles(authorization, userId);
    return context.json({ data: { userId, roles } });
  });

  router.get('/owners', async (context) => {
    await requireManager(context);
    const page = await users.list({ page: 1, pageSize: 200 });
    return context.json({
      data: page.items.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
      })),
    });
  });

  // --- customers ---------------------------------------------------------

  router.get('/customers', async (context) => {
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.customers,
      CUSTOMER_FIELDS,
    );
    const search = optionalString(context.req.query('search')) ?? undefined;
    const status = context.req.query('status')?.trim() || undefined;
    return context.json({
      data: await service.listCustomers(conditions, { search, status }),
    });
  });

  router.post('/customers', async (context) => {
    const body = asObject(await context.req.json());
    const input = parseCustomerInput(body, { requireName: true });
    const roles = await resolveCrmRoles(authorization, currentUserId(context));
    const requestedOwner = optionalString(body.ownerId);
    const ownerId =
      canManage(roles) && requestedOwner
        ? requestedOwner
        : currentUserId(context);
    await authorize(context, CRM_RESOURCES.customers, 'create', {
      input: Object.keys(input),
    });
    const id = await service.createCustomer(input, ownerId);
    return context.json({ data: { id } }, 201);
  });

  router.get('/customers/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.customers,
      CUSTOMER_FIELDS,
    );
    const customer = await service.getCustomer(id, conditions);
    if (!customer) throw notFound('Customer not found.');
    return context.json({ data: customer });
  });

  router.patch('/customers/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const body = asObject(await context.req.json());
    const input = customerUpdate(body);
    const conditions = await authorize(
      context,
      CRM_RESOURCES.customers,
      'update',
      { input: Object.keys(input) },
    );
    const updated = await service.updateCustomer(id, input, conditions);
    if (updated === 0) throw notFound('Customer not found.');
    return context.json({ data: { updated } });
  });

  router.delete('/customers/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await authorize(
      context,
      CRM_RESOURCES.customers,
      'delete',
    );
    const deleted = await service.deleteCustomer(id, conditions);
    if (deleted === 0) throw notFound('Customer not found.');
    return context.json({ data: { deleted } });
  });

  router.post('/customers/:id/assign', async (context) => {
    await requireManager(context);
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const body = asObject(await context.req.json());
    const ownerId = requiredString(
      body.ownerId,
      'OWNER_REQUIRED',
      'A new owner is required.',
    );
    const read = await readConditions(
      context,
      CRM_RESOURCES.customers,
      CUSTOMER_FIELDS,
    );
    const customer = await service.getCustomer(id, read);
    if (!customer) throw notFound('Customer not found.');
    const conditions = await authorize(
      context,
      CRM_RESOURCES.customers,
      'update',
      { input: ['ownerId'] },
    );
    const updated = await service.reassignCustomer(
      id,
      customer.ownerId,
      ownerId,
      conditions,
    );
    if (updated === 0) throw notFound('Customer not found.');
    return context.json({ data: { updated } });
  });

  // --- contacts ----------------------------------------------------------

  router.get('/customers/:id/contacts', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.contacts,
      CONTACT_FIELDS,
    );
    return context.json({ data: await service.listContacts(id, conditions) });
  });

  router.post('/customers/:id/contacts', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const body = asObject(await context.req.json());
    const input = parseContactInput(body, id);
    const customerConditions = await readConditions(
      context,
      CRM_RESOURCES.customers,
      CUSTOMER_FIELDS,
    );
    const customer = await service.getCustomer(id, customerConditions);
    if (!customer) throw notFound('Customer not found.');
    await authorize(context, CRM_RESOURCES.contacts, 'create', {
      input: Object.keys(input),
    });
    const contactId = await service.createContact(input, customer.ownerId);
    return context.json({ data: { id: contactId } }, 201);
  });

  router.patch('/contacts/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const body = asObject(await context.req.json());
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.contacts,
      CONTACT_FIELDS,
    );
    const existing = await service.getContact(id, conditions);
    if (!existing) throw notFound('Contact not found.');
    const input = contactUpdate(body);
    const updated = await service.updateContact(
      id,
      existing.customerId,
      input,
      conditions,
    );
    if (updated === 0) throw notFound('Contact not found.');
    return context.json({ data: { updated } });
  });

  router.delete('/contacts/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await authorize(
      context,
      CRM_RESOURCES.contacts,
      'delete',
    );
    const deleted = await service.deleteContact(id, conditions);
    if (deleted === 0) throw notFound('Contact not found.');
    return context.json({ data: { deleted } });
  });

  // --- opportunities -----------------------------------------------------

  router.get('/opportunities', async (context) => {
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.opportunities,
      OPPORTUNITY_FIELDS,
    );
    const stage = context.req.query('stage')?.trim() || undefined;
    const customerId = optionalId(context.req.query('customerId'));
    return context.json({
      data: await service.listOpportunities(conditions, {
        stage,
        customerId: customerId ?? undefined,
      }),
    });
  });

  router.post('/opportunities', async (context) => {
    const body = asObject(await context.req.json());
    const customerId = requiredId(
      body.customerId,
      'OPPORTUNITY_CUSTOMER_REQUIRED',
    );
    const input = parseOpportunityInput(body, customerId);
    const customerConditions = await readConditions(
      context,
      CRM_RESOURCES.customers,
      CUSTOMER_FIELDS,
    );
    const customer = await service.getCustomer(customerId, customerConditions);
    if (!customer) throw notFound('Customer not found.');
    const roles = await resolveCrmRoles(authorization, currentUserId(context));
    const requestedOwner = optionalString(body.ownerId);
    const ownerId =
      canManage(roles) && requestedOwner ? requestedOwner : customer.ownerId;
    await authorize(context, CRM_RESOURCES.opportunities, 'create', {
      input: Object.keys(input),
    });
    const id = await service.createOpportunity(input, ownerId);
    return context.json({ data: { id } }, 201);
  });

  router.get('/opportunities/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.opportunities,
      OPPORTUNITY_FIELDS,
    );
    const opportunity = await service.getOpportunity(id, conditions);
    if (!opportunity) throw notFound('Opportunity not found.');
    return context.json({ data: opportunity });
  });

  router.patch('/opportunities/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const body = asObject(await context.req.json());
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.opportunities,
      OPPORTUNITY_FIELDS,
    );
    const existing = await service.getOpportunity(id, conditions);
    if (!existing) throw notFound('Opportunity not found.');

    const merged = opportunityUpdate(body, existing);
    const input = parseOpportunityInput(merged, existing.customerId);
    const roles = await resolveCrmRoles(authorization, currentUserId(context));
    const requestedOwner = optionalString(body.ownerId);
    const update = {
      ...input,
      ...(canManage(roles) && requestedOwner
        ? { ownerId: requestedOwner }
        : {}),
    };
    await authorize(context, CRM_RESOURCES.opportunities, 'update', {
      input: Object.keys(update),
    });
    const updated = await service.updateOpportunity(id, update, conditions);
    if (updated === 0) throw notFound('Opportunity not found.');
    return context.json({ data: { updated } });
  });

  router.delete('/opportunities/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await authorize(
      context,
      CRM_RESOURCES.opportunities,
      'delete',
    );
    const deleted = await service.deleteOpportunity(id, conditions);
    if (deleted === 0) throw notFound('Opportunity not found.');
    return context.json({ data: { deleted } });
  });

  // --- follow-ups --------------------------------------------------------

  router.get('/follow-ups', async (context) => {
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.followUps,
      FOLLOW_UP_FIELDS,
    );
    const customerId = optionalId(context.req.query('customerId'));
    const opportunityId = optionalId(context.req.query('opportunityId'));
    return context.json({
      data: await service.listFollowUps(conditions, {
        customerId: customerId ?? undefined,
        opportunityId: opportunityId ?? undefined,
      }),
    });
  });

  router.post('/follow-ups', async (context) => {
    const body = asObject(await context.req.json());
    const input = parseFollowUpInput(body);

    let customerId = optionalId(body.customerId);
    const opportunityId = optionalId(body.opportunityId);
    let ownerId: string;

    if (opportunityId !== null) {
      const conditions = await readConditions(
        context,
        CRM_RESOURCES.opportunities,
        OPPORTUNITY_FIELDS,
      );
      const opportunity = await service.getOpportunity(
        opportunityId,
        conditions,
      );
      if (!opportunity) throw notFound('Opportunity not found.');
      ownerId = opportunity.ownerId;
      customerId = opportunity.customerId;
    } else if (customerId !== null) {
      const conditions = await readConditions(
        context,
        CRM_RESOURCES.customers,
        CUSTOMER_FIELDS,
      );
      const customer = await service.getCustomer(customerId, conditions);
      if (!customer) throw notFound('Customer not found.');
      ownerId = customer.ownerId;
    } else {
      throw badRequest(
        'FOLLOW_UP_TARGET_REQUIRED',
        'A customer or opportunity is required.',
      );
    }

    await authorize(context, CRM_RESOURCES.followUps, 'create', {
      input: Object.keys(input),
    });
    const id = await service.createFollowUp(input, ownerId, {
      customerId,
      opportunityId,
    });
    return context.json({ data: { id } }, 201);
  });

  router.patch('/follow-ups/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const body = asObject(await context.req.json());
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.followUps,
      FOLLOW_UP_FIELDS,
    );
    const existing = await service.getFollowUp(id, conditions);
    if (!existing) throw notFound('Follow-up not found.');
    const input = followUpUpdate(body);
    const updated = await service.updateFollowUp(id, input, conditions);
    if (updated === 0) throw notFound('Follow-up not found.');
    return context.json({ data: { updated } });
  });

  router.delete('/follow-ups/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await authorize(
      context,
      CRM_RESOURCES.followUps,
      'delete',
    );
    const deleted = await service.deleteFollowUp(id, conditions);
    if (deleted === 0) throw notFound('Follow-up not found.');
    return context.json({ data: { deleted } });
  });

  // --- funnel ------------------------------------------------------------

  router.get('/stats/funnel', async (context) => {
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.opportunities,
      OPPORTUNITY_FIELDS,
    );
    return context.json({ data: await service.funnel(conditions) });
  });

  // --- attachments -------------------------------------------------------

  router.get('/attachments', async (context) => {
    const targetType = requiredEnum(
      context.req.query('targetType'),
      ATTACHMENT_TARGETS,
      'INVALID_TARGET',
    );
    const targetId = requiredId(
      context.req.query('targetId'),
      'INVALID_TARGET_ID',
    );
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.attachments,
      ATTACHMENT_FIELDS,
    );
    return context.json({
      data: await service.listAttachments(targetType, targetId, conditions),
    });
  });

  router.post('/attachments', async (context) => {
    const body = (await context.req.parseBody({ all: true })) as Record<
      string,
      unknown
    >;
    const targetType = requiredEnum(
      typeof body.targetType === 'string' ? body.targetType : undefined,
      ATTACHMENT_TARGETS,
      'INVALID_TARGET',
    );
    const targetId = requiredId(body.targetId, 'INVALID_TARGET_ID');
    const raw = body.file;
    const file: unknown = Array.isArray(raw)
      ? (raw as readonly unknown[])[0]
      : raw;
    if (!(file instanceof File)) {
      throw badRequest('FILE_REQUIRED', 'A file is required.');
    }

    const ownerId = await resolveTargetOwner(context, targetType, targetId);
    await authorize(context, CRM_RESOURCES.attachments, 'create', {
      input: ['targetType', 'targetId', 'fileId', 'ownerId'],
    });

    await files.validateCollection();
    const { record } = await files.uploadOne({ file });
    const id = await service.createAttachment({
      targetType,
      targetId,
      fileId: record.id,
      ownerId,
    });
    return context.json(
      {
        data: {
          id,
          fileId: record.id,
          filename: record.filename,
          mimeType: record.mimeType,
          size: Number(record.size),
        },
      },
      201,
    );
  });

  router.get('/attachments/:id/content', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await readConditions(
      context,
      CRM_RESOURCES.attachments,
      ATTACHMENT_FIELDS,
    );
    const attachment = await service.getAttachment(id, conditions);
    if (!attachment) throw notFound('Attachment not found.');
    const record = await files.findOne({ filter: { id: attachment.fileId } });
    if (!record) throw notFound('File not found.');
    const disk = drive.use(record.disk);
    if (!(await disk.exists(record.key))) throw notFound('File not found.');

    context.header('Content-Type', record.mimeType);
    context.header('Content-Length', String(record.size));
    context.header('Cache-Control', 'private, no-store');
    context.header('X-Content-Type-Options', 'nosniff');
    context.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    );
    return context.body(
      Readable.toWeb(
        (await disk.getStream(record.key)) as Readable,
      ) as ReadableStream,
    );
  });

  router.delete('/attachments/:id', async (context) => {
    const id = requiredId(context.req.param('id'), 'INVALID_ID');
    const conditions = await authorize(
      context,
      CRM_RESOURCES.attachments,
      'delete',
    );
    const deleted = await service.deleteAttachment(id, conditions);
    if (deleted === 0) throw notFound('Attachment not found.');
    return context.json({ data: { deleted } });
  });

  return router;
}

export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const service = app.container.resolve(crmServiceToken);
    const users = app.container.resolve(userManagementServiceToken);
    const files = app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository('crmFiles', { disk: 'local', accessPath: '/uploads/crm' });
    const drive = app.container.resolve(
      driveManagerToken,
    ) as unknown as CrmDrive;

    const router = new Hono();
    router.route(
      '/crm',
      createCrmRoutes({
        auth,
        authorization,
        service,
        users,
        files: files,
        drive,
      }),
    );
    return router;
  });

function optionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredId(value, 'INVALID_ID');
}

function customerUpdate(body: JsonObject): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if ('name' in body) {
    input.name = requiredString(
      body.name,
      'CUSTOMER_NAME_REQUIRED',
      'Customer name is required.',
    );
  }
  if ('industry' in body) input.industry = optionalString(body.industry);
  if ('companySize' in body) {
    input.companySize = optionalEnum(
      body.companySize,
      COMPANY_SIZES,
      'INVALID_COMPANY_SIZE',
    );
  }
  if ('source' in body) {
    input.source = optionalEnum(
      body.source,
      CUSTOMER_SOURCES,
      'INVALID_SOURCE',
    );
  }
  if ('status' in body) {
    input.status = requiredEnum(
      body.status,
      CUSTOMER_STATUSES,
      'INVALID_STATUS',
    );
  }
  if ('notes' in body) input.notes = optionalString(body.notes);
  if (Object.keys(input).length === 0) {
    throw badRequest('EMPTY_UPDATE', 'Nothing to update.');
  }
  return input;
}

function contactUpdate(body: JsonObject): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if ('name' in body) {
    input.name = requiredString(
      body.name,
      'CONTACT_NAME_REQUIRED',
      'Contact name is required.',
    );
  }
  if ('title' in body) input.title = optionalString(body.title);
  if ('phone' in body) input.phone = optionalString(body.phone);
  if ('email' in body) input.email = optionalString(body.email);
  if ('isPrimary' in body) input.isPrimary = body.isPrimary === true;
  if (Object.keys(input).length === 0) {
    throw badRequest('EMPTY_UPDATE', 'Nothing to update.');
  }
  return input;
}

function opportunityUpdate(
  body: JsonObject,
  existing: OpportunityRecord,
): JsonObject {
  const merged: Record<string, unknown> = {
    name: 'name' in body ? body.name : existing.name,
    stage: 'stage' in body ? body.stage : existing.stage,
    amount: 'amount' in body ? body.amount : existing.amount,
    expectedCloseDate:
      'expectedCloseDate' in body
        ? body.expectedCloseDate
        : existing.expectedCloseDate,
    wonAmount: 'wonAmount' in body ? body.wonAmount : existing.wonAmount,
    lostReason: 'lostReason' in body ? body.lostReason : existing.lostReason,
  };
  return merged;
}

function followUpUpdate(body: JsonObject): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if ('method' in body) {
    input.method = requiredEnum(
      body.method,
      FOLLOW_UP_METHODS,
      'INVALID_METHOD',
    );
  }
  if ('summary' in body) {
    input.summary = requiredString(
      body.summary,
      'FOLLOW_UP_SUMMARY_REQUIRED',
      'A summary is required.',
    );
  }
  if ('nextStep' in body) input.nextStep = optionalString(body.nextStep);
  if ('followedAt' in body) {
    input.followedAt = optionalDate(body.followedAt, 'INVALID_FOLLOWED_AT');
  }
  if (Object.keys(input).length === 0) {
    throw badRequest('EMPTY_UPDATE', 'Nothing to update.');
  }
  return input;
}
