import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
  CLAIM_COLLECTION,
  CLAIM_CREATE_FIELDS,
  CLAIM_FIELDS,
  CLAIM_TYPES,
  DEPARTMENT_COLLECTION,
  DEPARTMENT_FIELDS,
  RECEIPT_COLLECTION,
  RECEIPT_CREATE_FIELDS,
  RECEIPT_FIELDS,
  RECEIPT_FILE_EXTENSIONS,
  RECEIPT_TYPES,
  expenseServiceToken,
  type ClaimStatus,
  type ClaimType,
  type ExpenseClaimRecord,
  type ExpenseService,
  type ReceiptType,
} from '../providers/expense-service.js';
import {
  authorizeDatabase,
  authorizeOperation,
  principalId,
} from './expense-access.js';

const CLAIM_READ_FIELDS = [...CLAIM_FIELDS];
const RECEIPT_READ_FIELDS = [...RECEIPT_FIELDS];
const DEPARTMENT_READ_FIELDS = [...DEPARTMENT_FIELDS];
const CLAIM_INPUT_FIELDS = [...CLAIM_CREATE_FIELDS];

export const expenseApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve<Auth>(authenticationToken);
    const authorization =
      app.container.resolve<AppAuthorization>(authorizationToken);
    const expense = app.container.resolve<ExpenseService>(expenseServiceToken);

    /** Reads a claim the caller is allowed to see, or refuses with 404. */
    async function visibleClaim(
      scope: AuthorizationScope,
      id: number,
      output: readonly string[],
    ): Promise<ExpenseClaimRecord> {
      const conditions = await authorizeDatabase(
        scope,
        CLAIM_COLLECTION,
        'read',
        { output },
      );
      const claim = await expense.getClaim(id, conditions);
      if (!claim) {
        throw new HTTPException(404, { message: 'Claim not found.' });
      }
      return claim;
    }

    /** Applies a status transition with the record filter and the expected current status in the same statement. */
    async function transition(
      scope: AuthorizationScope,
      id: number,
      expectedStatus: ClaimStatus,
      patch: Record<string, unknown>,
    ): Promise<void> {
      const conditions = await authorizeDatabase(
        scope,
        CLAIM_COLLECTION,
        'update',
        { input: Object.keys(patch), output: CLAIM_READ_FIELDS },
      );
      const updated = await expense.updateClaim(
        id,
        { ...patch, updatedAt: new Date() },
        conditions,
        expectedStatus,
      );
      if (updated === 0) {
        throw new HTTPException(409, {
          message: '报销单状态已变化，无法完成该操作。',
        });
      }
    }

    /** Recomputes the claim total from its receipts; the total is never accepted from a form. */
    async function refreshTotals(
      scope: AuthorizationScope,
      claimId: number,
      now: Date,
    ): Promise<void> {
      const conditions = await authorizeDatabase(
        scope,
        CLAIM_COLLECTION,
        'update',
        { input: ['totalAmount', 'receiptCount'], output: CLAIM_READ_FIELDS },
      );
      const totals = await expense.recalculateClaim(claimId);
      await expense.updateClaim(
        claimId,
        {
          totalAmount: totals.total,
          receiptCount: totals.count,
          updatedAt: now,
        },
        conditions,
      );
    }

    const routes = new Hono<AuthorizationEnv>();
    // Every path this contribution owns is authenticated and authorized here. Mounting under /api is a
    // location, not a security boundary, and no other route's middleware is relied on.
    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/departments', async (context) => {
      await authorizeDatabase(
        context.get('authz'),
        DEPARTMENT_COLLECTION,
        'read',
        { output: DEPARTMENT_READ_FIELDS },
      );
      return context.json({ data: await expense.listDepartments() });
    });

    routes.post('/departments', async (context) => {
      const scope = context.get('authz');
      await authorizeDatabase(scope, DEPARTMENT_COLLECTION, 'create', {
        input: ['name', 'managerId'],
        output: DEPARTMENT_READ_FIELDS,
      });
      const body = await readJson(context.req.raw);
      const name = parseName(body.name);
      if (!name) {
        throw new HTTPException(400, {
          message: 'A department name is required.',
        });
      }
      if (await expense.findDepartmentByName(name)) {
        throw new HTTPException(409, { message: '该部门已存在。' });
      }
      const now = new Date();
      const id = await expense.insertDepartment({
        name,
        managerId: parseOptionalId(body.managerId),
        createdAt: now,
        updatedAt: now,
      });
      return context.json({ data: { id, name } }, 201);
    });

    routes.patch('/departments/:id', async (context) => {
      const id = requireInteger(context.req.param('id'));
      const conditions = await authorizeDatabase(
        context.get('authz'),
        DEPARTMENT_COLLECTION,
        'update',
        { input: ['name', 'managerId'], output: DEPARTMENT_READ_FIELDS },
      );
      const body = await readJson(context.req.raw);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if ('name' in body) {
        const name = parseName(body.name);
        if (!name) {
          throw new HTTPException(400, {
            message: 'A department name is required.',
          });
        }
        const existing = await expense.findDepartmentByName(name);
        if (existing && existing.id !== id) {
          throw new HTTPException(409, { message: '该部门已存在。' });
        }
        patch.name = name;
      }
      if ('managerId' in body) {
        patch.managerId = parseOptionalId(body.managerId);
      }
      const updated = await expense.updateDepartment(id, patch, conditions);
      if (updated === 0) {
        throw new HTTPException(404, { message: 'Department not found.' });
      }
      return context.json({ data: { updated } });
    });

    routes.delete('/departments/:id', async (context) => {
      const id = requireInteger(context.req.param('id'));
      const conditions = await authorizeDatabase(
        context.get('authz'),
        DEPARTMENT_COLLECTION,
        'delete',
        {},
      );
      const deleted = await expense.deleteDepartment(id, conditions);
      if (deleted === 0) {
        throw new HTTPException(404, { message: 'Department not found.' });
      }
      return context.json({ data: { deleted } });
    });

    routes.get('/claims', async (context) => {
      const conditions = await authorizeDatabase(
        context.get('authz'),
        CLAIM_COLLECTION,
        'read',
        { output: CLAIM_READ_FIELDS },
      );
      return context.json({ data: await expense.listClaims(conditions) });
    });

    routes.post('/claims', async (context) => {
      const scope = context.get('authz');
      await authorizeDatabase(scope, CLAIM_COLLECTION, 'create', {
        input: CLAIM_INPUT_FIELDS,
        output: ['id', 'number'],
      });
      const body = await readJson(context.req.raw);
      const departmentId = requireInteger(
        body.departmentId,
        'A department is required.',
      );
      const type = parseClaimType(body.type);
      const reason = parseReason(body.reason);
      const appliedAt = parseDate(body.appliedAt) ?? new Date();

      const department = await expense.getDepartment(departmentId);
      if (!department) {
        throw new HTTPException(400, { message: 'Unknown department.' });
      }

      const now = new Date();
      const number = generateClaimNumber(now);
      const session = await auth.getSession(context.req.raw.headers);
      const applicantName =
        session?.user.name?.trim() || session?.user.email?.trim() || '';
      const id = await expense.createClaim({
        number,
        applicantId: principalId(scope),
        applicantName: applicantName || principalId(scope),
        departmentId: department.id,
        departmentName: department.name,
        type,
        reason,
        appliedAt,
        status: 'draft',
        totalAmount: 0,
        receiptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      return context.json({ data: { id, number } }, 201);
    });

    routes.get('/claims/:id', async (context) => {
      const id = requireInteger(context.req.param('id'));
      const claim = await visibleClaim(context.get('authz'), id, [
        'id',
        'status',
        'applicantId',
      ]);
      const receiptConditions = await authorizeDatabase(
        context.get('authz'),
        RECEIPT_COLLECTION,
        'read',
        { output: RECEIPT_READ_FIELDS },
      );
      const receipts = await expense.listReceiptsForClaim(
        id,
        receiptConditions,
      );
      return context.json({ data: { ...claim, receipts } });
    });

    routes.delete('/claims/:id', async (context) => {
      const scope = context.get('authz');
      const id = requireInteger(context.req.param('id'));
      const claim = await visibleClaim(scope, id, [
        'id',
        'status',
        'applicantId',
      ]);
      if (claim.status !== 'draft') {
        throw new HTTPException(409, {
          message: '只有草稿状态的报销单可以撤销。',
        });
      }
      const deleteConditions = await authorizeDatabase(
        scope,
        CLAIM_COLLECTION,
        'delete',
        {},
      );
      const receiptRead = await authorizeDatabase(
        scope,
        RECEIPT_COLLECTION,
        'read',
        { output: ['id', 'fileId'] },
      );
      const receipts = await expense.listReceiptsForClaim(id, receiptRead);
      const receiptDelete = await authorizeDatabase(
        scope,
        RECEIPT_COLLECTION,
        'delete',
        {},
      );
      await expense.deleteReceiptsForClaim(id, receiptDelete);
      for (const receipt of receipts) {
        await expense.deleteFileRecord(receipt.fileId);
      }
      const deleted = await expense.deleteClaim(id, deleteConditions);
      if (deleted === 0) {
        throw new HTTPException(404, { message: 'Claim not found.' });
      }
      return context.json({ data: { deleted: true } });
    });

    routes.post('/claims/:id/submit', async (context) => {
      const scope = context.get('authz');
      const id = requireInteger(context.req.param('id'));
      await authorizeOperation(scope, 'submit');
      const claim = await visibleClaim(scope, id, [
        'id',
        'status',
        'applicantId',
      ]);
      if (claim.applicantId !== principalId(scope)) {
        throw new HTTPException(403, {
          message: 'Only the applicant may submit this claim.',
        });
      }
      if (claim.status !== 'draft') {
        throw new HTTPException(409, {
          message: '只有草稿状态的报销单可以提交。',
        });
      }
      await transition(scope, id, 'draft', {
        status: 'pending',
        submittedAt: new Date(),
      });
      return context.json({ data: { id, status: 'pending' } });
    });

    routes.post('/claims/:id/approve', async (context) => {
      const scope = context.get('authz');
      const id = requireInteger(context.req.param('id'));
      await authorizeOperation(scope, 'approve');
      await visibleClaim(scope, id, ['id', 'status']);
      await transition(scope, id, 'pending', {
        status: 'approved',
        decidedAt: new Date(),
        decidedById: principalId(scope),
        rejectReason: null,
      });
      return context.json({ data: { id, status: 'approved' } });
    });

    routes.post('/claims/:id/reject', async (context) => {
      const scope = context.get('authz');
      const id = requireInteger(context.req.param('id'));
      await authorizeOperation(scope, 'reject');
      const body = await readJson(context.req.raw);
      const reason = parseReason(body.reason, '驳回原因不能为空。');
      await visibleClaim(scope, id, ['id', 'status']);
      await transition(scope, id, 'pending', {
        status: 'rejected',
        decidedAt: new Date(),
        decidedById: principalId(scope),
        rejectReason: reason,
      });
      return context.json({
        data: { id, status: 'rejected', rejectReason: reason },
      });
    });

    routes.post('/claims/:id/pay', async (context) => {
      const scope = context.get('authz');
      const id = requireInteger(context.req.param('id'));
      await authorizeOperation(scope, 'pay');
      await visibleClaim(scope, id, ['id', 'status']);
      await transition(scope, id, 'approved', {
        status: 'paid',
        paidAt: new Date(),
        paidById: principalId(scope),
      });
      return context.json({ data: { id, status: 'paid' } });
    });

    routes.post('/claims/:id/receipts', async (context) => {
      const scope = context.get('authz');
      const id = requireInteger(context.req.param('id'));
      await authorizeDatabase(scope, RECEIPT_COLLECTION, 'create', {
        input: [...RECEIPT_CREATE_FIELDS],
        output: RECEIPT_READ_FIELDS,
      });
      const claim = await visibleClaim(scope, id, [
        'id',
        'status',
        'applicantId',
        'departmentId',
      ]);
      if (claim.status !== 'draft') {
        throw new HTTPException(409, {
          message: '只有草稿状态的报销单可以添加票据。',
        });
      }
      const body = await readJson(context.req.raw);
      const fileId = parseName(body.fileId);
      if (!fileId) {
        throw new HTTPException(400, {
          message: 'A receipt file is required.',
        });
      }
      const amount = parseAmount(body.amount);
      const invoiceDate = parseDate(body.invoiceDate);
      const receiptType = parseReceiptType(body.receiptType);
      if (!invoiceDate) {
        throw new HTTPException(400, {
          message: 'A valid invoice date is required.',
        });
      }

      const file = await expense.getFileRecord(fileId);
      if (!file) {
        throw new HTTPException(400, { message: 'Unknown uploaded file.' });
      }
      assertAllowedFile(file.ext, file.mimeType, Number(file.size));

      const now = new Date();
      const receiptId = await expense.createReceipt({
        claimId: id,
        // Server-owned: derived from the claim, never accepted from the request body.
        applicantId: claim.applicantId,
        departmentId: claim.departmentId,
        fileId: file.id,
        filename: file.filename,
        ext: file.ext,
        mimeType: file.mimeType,
        size: Number(file.size),
        amount,
        invoiceDate,
        receiptType,
        createdAt: now,
        updatedAt: now,
      });
      await refreshTotals(scope, id, now);
      return context.json({ data: { id: receiptId } }, 201);
    });

    routes.delete('/claims/:claimId/receipts/:receiptId', async (context) => {
      const scope = context.get('authz');
      const claimId = requireInteger(context.req.param('claimId'));
      const receiptId = requireInteger(context.req.param('receiptId'));
      const claim = await visibleClaim(scope, claimId, ['id', 'status']);
      if (claim.status !== 'draft') {
        throw new HTTPException(409, {
          message: '只有草稿状态的报销单可以删除票据。',
        });
      }
      const deleteConditions = await authorizeDatabase(
        scope,
        RECEIPT_COLLECTION,
        'delete',
        {},
      );
      const receipt = await expense.findReceiptById(
        receiptId,
        deleteConditions,
      );
      if (!receipt || receipt.claimId !== claimId) {
        throw new HTTPException(404, { message: 'Receipt not found.' });
      }
      await expense.deleteReceipt(receiptId, deleteConditions);
      await expense.deleteFileRecord(receipt.fileId);
      await refreshTotals(scope, claimId, new Date());
      return context.json({ data: { deleted: true } });
    });

    routes.get('/receipts', async (context) => {
      const conditions = await authorizeDatabase(
        context.get('authz'),
        RECEIPT_COLLECTION,
        'read',
        { output: RECEIPT_READ_FIELDS },
      );
      const rows = await expense.listReceipts(conditions);
      const claimIds = [...new Set(rows.map((row) => Number(row.claimId)))];
      const numbers = await expense.listClaimNumbers(claimIds);
      const byId = new Map(numbers.map((entry) => [entry.id, entry.number]));
      return context.json({
        data: rows.map((row) => ({
          ...row,
          claimNumber: byId.get(Number(row.claimId)) ?? null,
        })),
      });
    });

    routes.get('/statistics', async (context) => {
      const conditions = await authorizeDatabase(
        context.get('authz'),
        CLAIM_COLLECTION,
        'read',
        {
          output: [
            'departmentId',
            'departmentName',
            'type',
            'totalAmount',
            'receiptCount',
          ],
        },
      );
      return context.json({ data: await expense.statistics(conditions) });
    });

    const router = new Hono();
    router.route('/expense', routes);
    return router;
  });

function assertAllowedFile(ext: string, mimeType: string, size: number): void {
  const allowedExtension = (
    RECEIPT_FILE_EXTENSIONS as readonly string[]
  ).includes(ext.toLowerCase());
  const allowedMime =
    mimeType === 'application/pdf' || mimeType.startsWith('image/');
  if (!allowedExtension || !allowedMime) {
    throw new HTTPException(400, { message: '只允许上传图片或 PDF 票据。' });
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: '票据文件为空。' });
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

/** Coerces an untrusted scalar to text without ever stringifying an object. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function requireInteger(value: unknown, message?: string): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(asText(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HTTPException(400, {
      message: message ?? 'Invalid identifier.',
    });
  }
  return parsed;
}

function parseName(value: unknown): string | undefined {
  const text = asText(value).trim();
  return text.length > 0 && text.length <= 255 ? text : undefined;
}

function parseOptionalId(value: unknown): string | null {
  const text = asText(value).trim();
  return text.length > 0 && text.length <= 64 ? text : null;
}

function parseReason(value: unknown, message = '事由不能为空。'): string {
  const text = asText(value).trim();
  if (text.length === 0) {
    throw new HTTPException(400, { message });
  }
  return text;
}

function parseClaimType(value: unknown): ClaimType {
  const text = asText(value);
  if (!(CLAIM_TYPES as readonly string[]).includes(text)) {
    throw new HTTPException(400, { message: 'Unknown claim type.' });
  }
  return text as ClaimType;
}

function parseReceiptType(value: unknown): ReceiptType {
  const text = asText(value);
  if (!(RECEIPT_TYPES as readonly string[]).includes(text)) {
    throw new HTTPException(400, { message: 'Unknown receipt type.' });
  }
  return text as ReceiptType;
}

function parseAmount(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(asText(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HTTPException(400, { message: '金额必须大于 0。' });
  }
  return Math.round(parsed * 100) / 100;
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = asText(value).trim();
  if (text.length === 0) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function generateClaimNumber(now: Date): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  const suffix = crypto
    .randomUUID()
    .replace(/-/gu, '')
    .slice(0, 6)
    .toUpperCase();
  return `BX-${stamp}-${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
