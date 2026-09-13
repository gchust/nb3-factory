import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  EMPLOYEE_FILE_ACCESS_PATH,
  EMPLOYEE_FILE_COLLECTION,
  EMPLOYEE_FILE_DISK,
  employeeRecordsToken,
  type AttachmentRecord,
  type CertificateRecord,
} from '../providers/employee-records.js';

/**
 * Employee records API.
 *
 * Authorization decision: every endpoint here is internal record-keeping, so the module's boundary is authentication —
 * any signed-in user may read and maintain employee records. There is no per-user ownership in the requirement, so
 * each sub-router installs `auth.required()` on its own paths rather than relying on middleware from another
 * contribution. Anonymous callers receive 401.
 */
export const employeeRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(employeeRecordsToken);
    const files = app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository(EMPLOYEE_FILE_COLLECTION, {
        connection: 'main',
        disk: EMPLOYEE_FILE_DISK,
        accessPath: EMPLOYEE_FILE_ACCESS_PATH,
      });

    const employees = new Hono();
    employees.use('*', auth.required());
    employees.get('/', async (context) =>
      context.json({ data: await service.listEmployees() }),
    );
    employees.post('/', async (context) => {
      const body = await readJson(context);
      if (!body.ok) return invalidJson(context);
      const input = parseEmployeeInput(body.value);
      if (!input.ok) return invalidInput(context, input.message);
      try {
        const employee = await service.createEmployee(input.value);
        return context.json({ data: employee }, 201);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return context.json(
            {
              code: 'EMPLOYEE_NO_TAKEN',
              message: 'An employee with this employee number already exists.',
            },
            409,
          );
        }
        throw error;
      }
    });
    employees.get('/:id', async (context) => {
      const id = employeeId(context);
      if (id === undefined) return invalidId(context);
      const employee = await service.getEmployee(id);
      if (!employee) return notFound(context);
      const certificates = await service.listCertificates(id);
      return context.json({
        data: { employee, certificates: decorate(certificates) },
      });
    });
    employees.get('/:id/certificates', async (context) => {
      const id = employeeId(context);
      if (id === undefined) return invalidId(context);
      const employee = await service.getEmployee(id);
      if (!employee) return notFound(context);
      const certificates = await service.listCertificates(id);
      return context.json({ data: decorate(certificates) });
    });
    employees.post('/:id/certificates', async (context) => {
      const id = employeeId(context);
      if (id === undefined) return invalidId(context);
      const body = await readJson(context);
      if (!body.ok) return invalidJson(context);
      const input = parseCertificateInput(body.value);
      if (!input.ok) return invalidInput(context, input.message);
      const certificate = await service.createCertificate(id, input.value);
      if (!certificate) return notFound(context);
      return context.json({ data: decorateOne(certificate) }, 201);
    });
    router.route('/employees', employees);

    const certificates = new Hono();
    certificates.use('*', auth.required());
    certificates.delete('/:id', async (context) => {
      const id = employeeId(context);
      if (id === undefined) return invalidId(context);
      const deleted = await service.deleteCertificate(id);
      if (!deleted) return notFound(context);
      return context.json({ data: { id } });
    });
    router.route('/certificates', certificates);

    return router;

    function decorate(records: readonly CertificateRecord[]) {
      return records.map(decorateOne);
    }

    function decorateOne(record: CertificateRecord) {
      return {
        ...record,
        attachments: record.attachments.map(withContentUrl),
      };
    }

    function withContentUrl(attachment: AttachmentRecord) {
      return {
        ...attachment,
        contentUrl: `${app.publicBasePath}${files.getUrl({
          id: attachment.id,
          ext: attachment.ext,
        })}`,
      };
    }
  });

type ParseResult<T> = { readonly ok: true; readonly value: T } | ParseFailure;
interface ParseFailure {
  readonly ok: false;
  readonly message: string;
}

interface ParsedEmployee {
  readonly name: string;
  readonly employeeNo: string;
  readonly department: string;
}

interface ParsedCertificate {
  readonly name: string;
  readonly expiresAt: string | null;
  readonly fileIds: readonly string[];
}

function employeeId(context: Context): number | undefined {
  const id = Number(context.req.param('id'));
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

async function readJson(
  context: Context,
): Promise<
  { readonly ok: true; readonly value: unknown } | { readonly ok: false }
> {
  try {
    return { ok: true, value: await context.req.json() };
  } catch {
    return { ok: false };
  }
}

function parseEmployeeInput(value: unknown): ParseResult<ParsedEmployee> {
  if (!isRecord(value)) return fail('A JSON object body is required.');
  const name = readText(value.name, 'name', 255);
  if (!name.ok) return name;
  const employeeNo = readText(value.employeeNo, 'employeeNo', 64);
  if (!employeeNo.ok) return employeeNo;
  const department = readText(value.department, 'department', 255);
  if (!department.ok) return department;
  return {
    ok: true,
    value: {
      name: name.value,
      employeeNo: employeeNo.value,
      department: department.value,
    },
  };
}

function parseCertificateInput(value: unknown): ParseResult<ParsedCertificate> {
  if (!isRecord(value)) return fail('A JSON object body is required.');
  const name = readText(value.name, 'name', 255);
  if (!name.ok) return name;

  let expiresAt: string | null = null;
  if (
    value.expiresAt !== undefined &&
    value.expiresAt !== null &&
    value.expiresAt !== ''
  ) {
    if (
      typeof value.expiresAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.expiresAt)
    ) {
      return fail('expiresAt must be a YYYY-MM-DD date.');
    }
    expiresAt = value.expiresAt;
  }

  let fileIds: string[] = [];
  if (value.fileIds !== undefined) {
    if (
      !Array.isArray(value.fileIds) ||
      !value.fileIds.every((id) => typeof id === 'string' && id.length > 0)
    ) {
      return fail('fileIds must be an array of attachment identifiers.');
    }
    fileIds = value.fileIds as string[];
  }

  return { ok: true, value: { name: name.value, expiresAt, fileIds } };
}

function readText(
  value: unknown,
  field: string,
  maxLength: number,
): ParseResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return fail(`${field} must be at most ${maxLength} characters.`);
  }
  return { ok: true, value: trimmed };
}

function fail(message: string): ParseFailure {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('unique');
}

function invalidJson(context: Context): Response {
  return context.json(
    { code: 'INVALID_JSON', message: 'A valid JSON body is required.' },
    400,
  );
}

function invalidInput(context: Context, message: string): Response {
  return context.json({ code: 'INVALID_INPUT', message }, 400);
}

function invalidId(context: Context): Response {
  return context.json(
    { code: 'INVALID_ID', message: 'A numeric identifier is required.' },
    400,
  );
}

function notFound(context: Context): Response {
  return context.json(
    { code: 'NOT_FOUND', message: 'The requested record does not exist.' },
    404,
  );
}
