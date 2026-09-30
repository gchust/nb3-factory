import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceDirectoryServiceToken } from '../providers/tokens.js';
import type { ServiceDirectoryService } from '../providers/directory-service.js';
import {
  authorizeAction,
  errorCode,
  jsonBody,
  numericParam,
  nowIso,
  optionalText,
  pickText,
  queryInteger,
  queryValue,
  requirePolicy,
  type MutationValues,
  type ServiceEnv,
} from './service-shared.js';

const CUSTOMER_FIELDS = [
  'code',
  'name',
  'contactName',
  'contactPhone',
  'address',
  'serviceLevel',
  'notes',
  'ownerId',
] as const;

const DEVICE_FIELDS = [
  'serialNumber',
  'name',
  'model',
  'category',
  'location',
  'status',
  'notes',
] as const;

function notFound(): HTTPException {
  return new HTTPException(404, { message: 'Not found' });
}

function conflict(error: unknown): HTTPException | undefined {
  if (errorCode(error) === 'uniqueViolation') {
    return new HTTPException(409, {
      message: 'A record with the same business key already exists',
    });
  }
  return undefined;
}

function integerField(
  body: Record<string, unknown>,
  key: string,
  required: boolean,
): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new HTTPException(400, { message: `${key} is required` });
    }
    return undefined;
  }
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${key} must be an integer` });
  }
  return parsed;
}

/** Customer ledger routes. Reads use `view`; writes use `manage`. */
export function createCustomerRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const directory: ServiceDirectoryService = app.container.resolve(
    serviceDirectoryServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.customers',
      'view',
    );
    const customers = await directory.listCustomers(
      requirePolicy(policies, 'serviceCustomers'),
      {
        query: queryValue(context, 'query'),
        ownerId: queryValue(context, 'ownerId'),
        limit: queryInteger(context, 'limit'),
        offset: queryInteger(context, 'offset'),
      },
    );
    return context.json({ data: customers });
  });

  routes.post('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.customers',
      'manage',
    );
    const body = await jsonBody(context);
    const values: MutationValues = pickText(body, CUSTOMER_FIELDS);
    if (typeof values.name !== 'string') {
      throw new HTTPException(400, { message: 'name is required' });
    }
    if (typeof values.code !== 'string') {
      values.code = `CUS-${randomUUID().slice(0, 8).toUpperCase()}`;
    }
    const timestamp = nowIso();
    values.createdAt = timestamp;
    values.updatedAt = timestamp;
    try {
      const customer = await directory.createCustomer(
        requirePolicy(policies, 'serviceCustomers'),
        values,
      );
      return context.json({ data: customer }, 201);
    } catch (error) {
      throw conflict(error) ?? error;
    }
  });

  routes.get('/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.customers',
      'view',
    );
    const customer = await directory.getCustomer(
      requirePolicy(policies, 'serviceCustomers'),
      numericParam(context),
    );
    if (!customer) throw notFound();
    return context.json({ data: customer });
  });

  routes.patch('/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.customers',
      'manage',
    );
    const body = await jsonBody(context);
    const values: MutationValues = pickText(body, CUSTOMER_FIELDS);
    values.updatedAt = nowIso();
    try {
      const customer = await directory.updateCustomer(
        requirePolicy(policies, 'serviceCustomers'),
        numericParam(context),
        values,
      );
      if (!customer) throw notFound();
      return context.json({ data: customer });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw conflict(error) ?? error;
    }
  });

  return routes;
}

/** Device ledger routes. Reads use `view`; writes use `manage`. */
export function createDeviceRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const directory: ServiceDirectoryService = app.container.resolve(
    serviceDirectoryServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', async (context) => {
    const policies = await authorizeAction(context, 'service.devices', 'view');
    const devices = await directory.listDevices(
      requirePolicy(policies, 'serviceDevices'),
      {
        customerId: queryInteger(context, 'customerId'),
        status: queryValue(context, 'status'),
        query: queryValue(context, 'query'),
        limit: queryInteger(context, 'limit'),
        offset: queryInteger(context, 'offset'),
      },
    );
    return context.json({ data: devices });
  });

  routes.post('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.devices',
      'manage',
    );
    const body = await jsonBody(context);
    const values: MutationValues = pickText(body, DEVICE_FIELDS);
    if (typeof values.name !== 'string') {
      throw new HTTPException(400, { message: 'name is required' });
    }
    if (typeof values.serialNumber !== 'string') {
      throw new HTTPException(400, { message: 'serialNumber is required' });
    }
    values.customerId = integerField(body, 'customerId', true);
    const warrantyUntil = optionalText(body, 'warrantyUntil', 64);
    if (warrantyUntil !== undefined) values.warrantyUntil = warrantyUntil;
    values.createdAt = nowIso();
    values.updatedAt = nowIso();
    try {
      const device = await directory.createDevice(
        requirePolicy(policies, 'serviceDevices'),
        values,
      );
      return context.json({ data: device }, 201);
    } catch (error) {
      throw conflict(error) ?? error;
    }
  });

  routes.get('/:id', async (context) => {
    const policies = await authorizeAction(context, 'service.devices', 'view');
    const device = await directory.getDevice(
      requirePolicy(policies, 'serviceDevices'),
      numericParam(context),
    );
    if (!device) throw notFound();
    return context.json({ data: device });
  });

  routes.patch('/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.devices',
      'manage',
    );
    const body = await jsonBody(context);
    const values: MutationValues = pickText(body, DEVICE_FIELDS);
    const customerId = integerField(body, 'customerId', false);
    if (customerId !== undefined) values.customerId = customerId;
    const warrantyUntil = optionalText(body, 'warrantyUntil', 64);
    if (warrantyUntil !== undefined) values.warrantyUntil = warrantyUntil;
    values.updatedAt = nowIso();
    try {
      const device = await directory.updateDevice(
        requirePolicy(policies, 'serviceDevices'),
        numericParam(context),
        values,
      );
      if (!device) throw notFound();
      return context.json({ data: device });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw conflict(error) ?? error;
    }
  });

  return routes;
}
