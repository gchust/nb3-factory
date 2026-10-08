import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { FilterBuilder, FilterNode } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { ticketServiceToken } from '../service/ticket-service.js';
import { normalizeDateTime } from '../service/scalars.js';
import { stamped, touched } from '../service/timestamps.js';
import {
  authorizationFor,
  permissionSetsFor,
  policyFor,
  requireActor,
  requireSupervisor,
  serviceError,
} from './helpers.js';

const tags = ['Service master data'];

const idParam = z.object({ id: z.coerce.number().int().positive() });

const customerBody = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
});

const deviceBody = z.object({
  serial: z.string().min(1),
  name: z.string().min(1),
  model: z.string().optional(),
  customerId: z.coerce.number().int().positive(),
  engineerId: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  nextInspectionAt: z.string().nullable().optional(),
});

const inspectionQuery = z.object({
  ownerId: z.string().optional(),
  plannedDate: z.string().optional(),
  status: z.string().optional(),
});

const inspectionResultBody = z.object({
  result: z.string().min(1),
  status: z.enum(['done', 'issue']).default('done'),
});

const recordShape = z.record(z.string(), z.unknown());

export function registerMasterDataRoutes(app: Application, router: Hono): void {
  const database = app.container.resolve(databaseManagerToken);
  const tickets = app.container.resolve(ticketServiceToken);

  /**
   * Device serial is unique. The database enforces it, but the raw constraint
   * error surfaces as a 500; checking first turns a duplicate into a described
   * 409 instead. `exceptId` lets an edit keep the device's own serial.
   */
  const assertSerialAvailable = async (
    serial: string,
    exceptId?: number,
  ): Promise<void> => {
    const existing = await database
      .repository('devices')
      .findOne({ filter: { serial } });
    if (existing && Number(existing.id) !== exceptId) {
      throw new ApiError({
        status: 'ALREADY_EXISTS',
        reason: 'SERVICE_DEVICE_SERIAL_EXISTS',
        domain: 'service',
        message: `Device serial ${serial} is already registered.`,
        metadata: { serial },
      });
    }
  };

  router.get(
    '/service/me',
    describeRoute({
      tags,
      summary: 'The signed-in user and the job permission sets they hold',
      operationId: 'serviceMe',
      responses: {
        200: dataResponse(
          z.object({
            id: z.string(),
            name: z.string(),
            permissionSets: z.array(z.string()),
            supervisor: z.boolean(),
          }),
        ),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      const permissionSets = await permissionSetsFor(app, actor.id);
      return context.json({
        data: {
          id: actor.id,
          name: actor.name,
          permissionSets,
          supervisor:
            permissionSets.includes('service-supervisor') ||
            permissionSets.includes('root'),
        },
      });
    },
  );

  const scoped = async (
    context: Parameters<typeof requireActor>[1],
    collection: string,
  ) => {
    const actor = await requireActor(app, context);
    const authorization = authorizationFor(app, actor.id);
    const policy = await policyFor(app, collection, authorization);
    return {
      actor,
      repository: database.repository(collection).withPolicy(policy),
    };
  };

  // --- Customers -----------------------------------------------------------
  router.get(
    '/service/customers',
    describeRoute({
      tags,
      summary: 'List customers visible to the signed-in user',
      operationId: 'serviceCustomersFindMany',
      responses: {
        200: dataResponse(z.array(recordShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const { repository } = await scoped(context, 'customers');
      return context.json({
        data: await repository.findMany({
          sort: (sort) => [sort.field('name').asc()],
        }),
      });
    },
  );

  router.post(
    '/service/customers',
    describeRoute({
      tags,
      summary: 'Create a customer',
      operationId: 'serviceCustomersCreate',
      responses: {
        201: dataResponse(recordShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', customerBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const { record } = await database.repository('customers').createOne({
        values: stamped({
          name: body.name,
          contactName: body.contactName ?? null,
          phone: body.phone ?? null,
          address: body.address ?? null,
          note: body.note ?? null,
        }),
      });
      return context.json({ data: record }, 201);
    },
  );

  // --- Devices -------------------------------------------------------------
  router.get(
    '/service/devices',
    describeRoute({
      tags,
      summary: 'List devices visible to the signed-in user',
      operationId: 'serviceDevicesFindMany',
      responses: {
        200: dataResponse(z.array(recordShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const { repository } = await scoped(context, 'devices');
      return context.json({
        data: await repository.findMany({
          sort: (sort) => [sort.field('serial').asc()],
        }),
      });
    },
  );

  router.post(
    '/service/devices',
    describeRoute({
      tags,
      summary: 'Create a device',
      operationId: 'serviceDevicesCreate',
      responses: {
        201: dataResponse(recordShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        409: apiErrorResponse(409),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', deviceBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      await assertSerialAvailable(body.serial);
      const { record } = await database.repository('devices').createOne({
        values: stamped({
          serial: body.serial,
          name: body.name,
          model: body.model ?? null,
          customerId: body.customerId,
          engineerId: body.engineerId ?? null,
          enabled: body.enabled,
          nextInspectionAt: normalizeDateTime(body.nextInspectionAt ?? null) as
            string | null,
        }),
      });
      return context.json({ data: record }, 201);
    },
  );

  router.patch(
    '/service/devices/:id',
    describeRoute({
      tags,
      summary: 'Edit a device, including its responsible engineer',
      operationId: 'serviceDevicesUpdate',
      responses: {
        200: dataResponse(recordShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        409: apiErrorResponse(409),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', deviceBody.partial()),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const id = context.req.valid('param').id;
      if (body.serial !== undefined) {
        await assertSerialAvailable(body.serial, id);
      }
      const values = Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== undefined),
      );
      if (body.nextInspectionAt !== undefined) {
        values.nextInspectionAt = normalizeDateTime(body.nextInspectionAt) as
          string | null;
      }
      const { record } = await database.repository('devices').updateOne({
        filter: { id },
        values: touched(values),
      });
      return context.json({ data: record });
    },
  );

  // --- Inspections ---------------------------------------------------------
  router.get(
    '/service/inspections',
    describeRoute({
      tags,
      summary: 'List inspection tasks visible to the signed-in user',
      operationId: 'serviceInspectionsFindMany',
      responses: {
        200: dataResponse(z.array(recordShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('query', inspectionQuery),
    async (context) => {
      const query = context.req.valid('query');
      const { actor, repository } = await scoped(context, 'inspections');
      // `date` is not a shorthand-filterable type, so the filter is built
      // explicitly rather than as a plain record.
      const conditions: ((builder: FilterBuilder) => FilterNode)[] = [];
      const ownerId = query.ownerId;
      const plannedDate = query.plannedDate;
      const status = query.status;
      if (ownerId === 'me') {
        conditions.push((builder) => builder.string('ownerId').eq(actor.id));
      } else if (ownerId) {
        conditions.push((builder) => builder.string('ownerId').eq(ownerId));
      }
      if (plannedDate) {
        conditions.push((builder) =>
          builder.date('plannedDate').on(plannedDate),
        );
      }
      if (status) {
        conditions.push((builder) => builder.string('status').eq(status));
      }
      const filter = (builder: FilterBuilder): FilterNode => {
        const parts = conditions.map((condition) => condition(builder));
        return parts.length === 1 ? parts[0] : builder.and(parts);
      };
      return context.json({
        data: await repository.findMany({
          ...(conditions.length ? { filter } : {}),
          sort: (sort) => [sort.field('plannedDate').desc()],
        }),
      });
    },
  );

  router.post(
    '/service/inspections/:id/result',
    describeRoute({
      tags,
      summary: 'Complete an inspection task',
      operationId: 'serviceInspectionsComplete',
      responses: {
        200: dataResponse(recordShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', inspectionResultBody),
    async (context) => {
      const actor = await requireActor(app, context);
      try {
        return context.json({
          data: await tickets.completeInspection(
            context.req.valid('param').id,
            { id: actor.id, name: actor.name },
            context.req.valid('json'),
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  // --- Assignable people ---------------------------------------------------
  router.get(
    '/service/engineers',
    describeRoute({
      tags,
      summary: 'List the people who hold a service job permission set',
      operationId: 'serviceEngineersFindMany',
      responses: {
        200: dataResponse(
          z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              permissionSet: z.string(),
            }),
          ),
        ),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      await requireActor(app, context);
      const rows = await database
        .query('main')
        .selectFrom('authorization_permission_set_assignments as assignment')
        .innerJoin('user', 'user.id', 'assignment.subject_id')
        .select([
          'user.id as id',
          'user.name as name',
          'assignment.permission_set_key as permissionSet',
        ])
        .where('assignment.subject_type', '=', 'user')
        .where('assignment.permission_set_key', 'in', [
          'service-supervisor',
          'service-engineer',
        ])
        .execute<{ id: string; name: string | null; permissionSet: string }>();
      const seen = new Set<string>();
      const data = rows
        .filter((row) => {
          if (seen.has(row.id)) {
            return false;
          }
          seen.add(row.id);
          return true;
        })
        .map((row) => ({
          id: row.id,
          name: row.name ?? row.id,
          permissionSet: row.permissionSet,
        }));
      return context.json({ data });
    },
  );
}
