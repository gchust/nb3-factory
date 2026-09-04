import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Auth } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import { Hono } from 'hono';

import { getContextAuthz } from '../hono-typed.js';

import {
  equipmentServiceToken,
  EquipmentFieldNotAllowedError,
  EquipmentStatusConflictError,
  type BorrowCreateInput,
  type EquipmentCreateInput,
  type EquipmentService,
  type EquipmentUpdateInput,
} from '../providers/equipment.js';

const equipmentResource = {
  type: 'database.collection',
  id: 'main.equipment',
} as const;

const borrowRecordResource = {
  type: 'database.collection',
  id: 'main.equipmentBorrowRecord',
} as const;

/** The decision the authorization scope returns; described structurally. */
interface AuthorizationDecision {
  readonly effect: 'permit' | 'conditional' | 'deny';
  readonly conditions?: unknown;
  readonly reasons?: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

/** An authorization decision the caller may not act on. */
class AccessDeniedError extends Error {
  public constructor(decision: AuthorizationDecision) {
    super(
      decision.reasons?.length
        ? `You are not allowed to perform this operation: ${decision.reasons.map((reason) => reason.message).join(', ')}`
        : 'You are not allowed to perform this operation.',
    );
    this.name = 'AccessDeniedError';
  }
}

const EQUIPMENT_OUTPUT_FIELDS = [
  'id',
  'name',
  'assetNumber',
  'category',
  'status',
  'description',
  'createdAt',
  'updatedAt',
] as const;

const BORROW_RECORD_OUTPUT_FIELDS = [
  'id',
  'equipmentId',
  'borrowerId',
  'borrowerName',
  'borrowedAt',
  'returnedAt',
  'note',
  'createdAt',
  'updatedAt',
] as const;

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth: Auth = app.container.resolve(authenticationToken);
    const authorization: AppAuthorization =
      app.container.resolve(authorizationToken);
    const service: EquipmentService = app.container.resolve(
      equipmentServiceToken,
    );
    const database = app.container.resolve(databaseManagerToken);

    router.use('*', auth.required());
    router.use('*', authorization.middleware());

    // A denied decision surfaces while authorizing outside the per-call try/catch
    // blocks (list and update reads), so map it centrally instead of wrapping
    // every handler. Everything else is mapped by `mapToHttp` where it is thrown.
    router.onError((error, context) => {
      if (error instanceof AccessDeniedError) {
        return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
      }
      if (error instanceof BadRequestError) {
        return context.json(
          { code: 'BAD_REQUEST', message: error.message },
          400,
        );
      }
      throw error;
    });

    router.get('/equipment', async (context) => {
      const authz = getContextAuthz(context);
      const conditions = requireDatabaseConditions(
        await authz.authorize({
          resource: equipmentResource,
          action: 'list',
          params: { fields: { output: EQUIPMENT_OUTPUT_FIELDS } },
        }),
      );
      const rows = await service.listEquipment(conditions);

      const records = await service.listBorrowRecords(
        requireDatabaseConditions(
          await authz.authorize({
            resource: borrowRecordResource,
            action: 'list',
            params: { fields: { output: BORROW_RECORD_OUTPUT_FIELDS } },
          }),
        ),
      );
      const openByEquipmentId = new Map<
        number,
        { id: number; borrowerId: string }
      >();
      for (const record of records) {
        if (
          record.returnedAt === null &&
          !openByEquipmentId.has(record.equipmentId)
        ) {
          openByEquipmentId.set(record.equipmentId, {
            id: record.id,
            borrowerId: record.borrowerId,
          });
        }
      }

      const principalId = authz.identity.principal.id;
      const canMaintain = await canAct(authz, equipmentResource, 'update');

      return context.json({
        data: rows.map((row) => {
          const openBorrow = openByEquipmentId.get(row.id) ?? null;
          return {
            ...row,
            openBorrowRecordId: openBorrow?.id ?? null,
            openBorrowRecordBorrowerId: openBorrow?.borrowerId ?? null,
            canBorrow: row.status === 'available',
            canMaintain,
            canReturn:
              (canMaintain || openBorrow?.borrowerId === principalId) &&
              openBorrow !== null,
          };
        }),
      });
    });

    router.post('/equipment', async (context) => {
      const body = await readJsonBody(context.req.raw);
      const input = parseEquipmentCreateInput(body);
      const conditions = requireDatabaseConditions(
        await getContextAuthz(context).authorize({
          resource: equipmentResource,
          action: 'create',
          params: {
            fields: { input: Object.keys(input), output: ['id'] },
          },
        }),
      );
      try {
        const row = await service.createEquipment(input, conditions);
        return context.json({ data: row }, 201);
      } catch (error) {
        return mapToHttp(context, error);
      }
    });

    router.patch('/equipment/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      const body = await readJsonBody(context.req.raw);
      const input = parseEquipmentUpdateInput(body);
      const conditions = requireDatabaseConditions(
        await getContextAuthz(context).authorize({
          resource: equipmentResource,
          action: 'update',
          params: {
            fields: { input: Object.keys(input) },
          },
        }),
      );
      try {
        const updated = await service.updateEquipment(id, input, conditions);
        return updated === 'not-found'
          ? context.json(
              { code: 'NOT_FOUND', message: 'Equipment not found.' },
              404,
            )
          : context.json({ data: updated });
      } catch (error) {
        return mapToHttp(context, error);
      }
    });

    router.delete('/equipment/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      requireDatabaseConditions(
        await getContextAuthz(context).authorize({
          resource: equipmentResource,
          action: 'delete',
          params: { fields: {} },
        }),
      );
      const outcome = await service.deleteEquipment(id);
      switch (outcome.status) {
        case 'deleted':
          return context.json({ data: { deleted: true } });
        case 'not-found':
          return context.json(
            { code: 'NOT_FOUND', message: 'Equipment not found.' },
            404,
          );
        case 'has-records':
          return context.json(
            {
              code: 'HAS_BORROW_RECORDS',
              message: 'Equipment with borrow records cannot be deleted.',
            },
            409,
          );
      }
    });

    router.get('/equipment-borrow-records', async (context) => {
      const authz = getContextAuthz(context);
      const conditions = requireDatabaseConditions(
        await authz.authorize({
          resource: borrowRecordResource,
          action: 'list',
          params: { fields: { output: BORROW_RECORD_OUTPUT_FIELDS } },
        }),
      );
      const records = await service.listBorrowRecords(conditions);
      const equipmentByAsset = await listEquipmentIndex(service, authz);

      const principalId = authz.identity.principal.id;
      const canMaintain = await canAct(authz, equipmentResource, 'update');

      return context.json({
        data: records.map((record) => {
          const equipment = equipmentByAsset.get(record.equipmentId);
          return {
            ...record,
            equipmentName: equipment?.name ?? null,
            assetNumber: equipment?.assetNumber ?? null,
            canReturn:
              record.returnedAt === null &&
              (canMaintain || record.borrowerId === principalId),
          };
        }),
      });
    });

    router.post('/equipment-borrow-records', async (context) => {
      const body = await readJsonBody(context.req.raw);
      const input = parseBorrowCreateInput(body);
      const authz = getContextAuthz(context);
      const conditions = requireDatabaseConditions(
        await authz.authorize({
          resource: borrowRecordResource,
          action: 'create',
          params: {
            fields: { input: Object.keys(input), output: ['id'] },
          },
        }),
      );
      const principal = authz.identity.principal;
      const borrower = await resolveBorrowerName(database, principal.id);

      try {
        const result = await service.createBorrowRecord(
          input,
          borrower,
          conditions,
        );
        switch (result.status) {
          case 'created':
            return context.json({ data: result.record }, 201);
          case 'equipment-not-found':
            return context.json(
              { code: 'EQUIPMENT_NOT_FOUND', message: 'Equipment not found.' },
              404,
            );
          case 'unavailable':
            return context.json(
              {
                code: 'EQUIPMENT_UNAVAILABLE',
                message: 'Equipment is not available for borrowing.',
                equipmentStatus: result.equipmentStatus,
              },
              409,
            );
        }
      } catch (error) {
        return mapToHttp(context, error);
      }
    });

    router.post('/equipment-borrow-records/:id/return', async (context) => {
      const id = parseId(context.req.param('id'));
      const body = await readJsonBody(context.req.raw);
      const input = parseBorrowReturnInput(body);
      const conditions = requireDatabaseConditions(
        await getContextAuthz(context).authorize({
          resource: borrowRecordResource,
          action: 'return',
          params: {
            fields: { input: Object.keys(input) },
          },
        }),
      );
      try {
        const outcome = await service.returnBorrowRecord(id, input, conditions);
        switch (outcome.status) {
          case 'returned':
            return context.json({ data: outcome.record });
          case 'not-found':
            return context.json(
              { code: 'NOT_FOUND', message: 'Borrow record not found.' },
              404,
            );
          case 'already-returned':
            return context.json(
              {
                code: 'ALREADY_RETURNED',
                message: 'Borrow record was already returned.',
              },
              409,
            );
          case 'not-borrowed':
            return context.json(
              {
                code: 'EQUIPMENT_NOT_BORROWED',
                message: 'Equipment is not currently borrowed.',
                equipmentStatus: outcome.equipmentStatus,
              },
              409,
            );
        }
      } catch (error) {
        return mapToHttp(context, error);
      }
    });

    return router;
  },
);

/**
 * The database authorizer answers every allowed request with a conditional
 * decision (even for allRecords), so "can the caller act here" is best read
 * as "the decision was not a deny".
 */
async function canAct(
  authz: { authorize: (request: unknown) => Promise<unknown> },
  resource: { type: string; id: string },
  action: string,
): Promise<boolean> {
  const decision = (await authz.authorize({
    resource,
    action,
  })) as AuthorizationDecision | undefined;
  return (
    decision !== undefined &&
    decision.effect !== 'deny' &&
    (decision.effect !== 'conditional' ||
      (decision.conditions as { type?: unknown } | undefined)?.type ===
        'database')
  );
}

async function listEquipmentIndex(
  service: EquipmentService,
  authz: { authorize: (request: unknown) => Promise<unknown> },
): Promise<Map<number, { name: string; assetNumber: string }>> {
  const conditions = requireDatabaseConditions(
    await authz.authorize({
      resource: equipmentResource,
      action: 'list',
      params: { fields: { output: EQUIPMENT_OUTPUT_FIELDS } },
    }),
  );
  const rows = await service.listEquipment(conditions);
  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.name, assetNumber: row.assetNumber },
    ]),
  );
}

async function resolveBorrowerName(
  database: DatabaseManager,
  principalId: string,
): Promise<{ id: string; name: string }> {
  const user = await database
    .query()
    .selectFrom('user')
    .select(['id', 'name'])
    .where('id', '=', principalId)
    .executeTakeFirst();
  return {
    id: principalId,
    name:
      user !== undefined &&
      typeof user.name === 'string' &&
      user.name.length > 0
        ? user.name
        : principalId,
  };
}

function requireDatabaseConditions(
  decision: unknown,
): DatabaseAuthorizationConditions {
  const record = (decision ?? {}) as {
    readonly effect?: unknown;
    readonly conditions?: unknown;
  };
  if (record.effect !== 'conditional') {
    throw new AccessDeniedError({ effect: 'deny', reasons: [] });
  }
  const conditions = record.conditions as
    DatabaseAuthorizationConditions | undefined;
  if (conditions?.type !== 'database') {
    throw new AccessDeniedError({ effect: 'deny', reasons: [] });
  }
  return conditions;
}

class BadRequestError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BadRequestError('Invalid JSON body.');
  }
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id.');
  }
  return id;
}

function requireString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError(`${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new BadRequestError(`${field} is too long.`);
  }
  return value;
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestError('Expected a string value.');
  }
  if (value.length > maxLength) {
    throw new BadRequestError('Value is too long.');
  }
  return value;
}

function parseEquipmentCreateInput(body: unknown): EquipmentCreateInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Equipment payload must be an object.');
  }
  const value = body as Record<string, unknown>;
  return {
    name: requireString(value.name, 'name', 255),
    assetNumber: requireString(value.assetNumber, 'assetNumber', 64),
    category: requireString(value.category, 'category', 64),
    description: optionalString(value.description, 2000),
  };
}

function parseEquipmentUpdateInput(body: unknown): EquipmentUpdateInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Equipment payload must be an object.');
  }
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new BadRequestError('Equipment update payload is empty.');
  }
  const input: EquipmentUpdateInput = {};
  if (value.name !== undefined) {
    input.name = requireString(value.name, 'name', 255);
  }
  if (value.assetNumber !== undefined) {
    input.assetNumber = requireString(value.assetNumber, 'assetNumber', 64);
  }
  if (value.category !== undefined) {
    input.category = requireString(value.category, 'category', 64);
  }
  if (value.status !== undefined) {
    if (value.status !== 'available' && value.status !== 'repairing') {
      throw new BadRequestError('status must be available or repairing.');
    }
    input.status = value.status;
  }
  if (value.description !== undefined) {
    input.description = optionalString(value.description, 2000);
  }
  return input;
}

function parseBorrowCreateInput(body: unknown): BorrowCreateInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Borrow payload must be an object.');
  }
  const value = body as Record<string, unknown>;
  const equipmentId = Number(value.equipmentId);
  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    throw new BadRequestError('equipmentId must be a positive integer.');
  }
  return {
    equipmentId,
    note:
      value.note === undefined || value.note === null
        ? null
        : requireString(value.note, 'note', 2000),
  };
}

function parseBorrowReturnInput(body: unknown): { note?: string | null } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Return payload must be an object.');
  }
  const value = body as Record<string, unknown>;
  const input: { note?: string | null } = {};
  if (value.note !== undefined) {
    input.note =
      value.note === null ? null : requireString(value.note, 'note', 2000);
  }
  return input;
}

function mapToHttp(context: import('hono').Context, error: unknown): Response {
  if (error instanceof BadRequestError) {
    return context.json({ code: 'BAD_REQUEST', message: error.message }, 400);
  }
  if (error instanceof EquipmentFieldNotAllowedError) {
    return context.json({ code: 'INVALID_FIELD', message: error.message }, 403);
  }
  if (error instanceof EquipmentStatusConflictError) {
    return context.json(
      { code: 'STATUS_CONFLICT', message: error.message },
      409,
    );
  }
  if (isUniqueConstraintError(error)) {
    return context.json(
      {
        code: 'DUPLICATE_ASSET_NUMBER',
        message: 'An equipment with this asset number already exists.',
      },
      409,
    );
  }
  throw error;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (('code' in error &&
      typeof error.code === 'string' &&
      error.code.includes('SQLITE_CONSTRAINT')) ||
      error.message.includes('UNIQUE constraint failed'))
  );
}
