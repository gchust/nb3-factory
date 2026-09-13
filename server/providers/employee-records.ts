import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The File-plugin collection backing certificate attachments. Its shape is defined by the File plugin. */
export const EMPLOYEE_FILE_COLLECTION = 'employee_certificate_files';
/** The client resource name exposed by the File plugin routes. */
export const EMPLOYEE_FILE_RESOURCE = 'employeeAttachments';
/** Where uploaded certificate attachments are served from. Also used as the File repository accessPath. */
export const EMPLOYEE_FILE_ACCESS_PATH = '/uploads/employee-records';
/** The configured disk uploaded attachments are stored on. */
export const EMPLOYEE_FILE_DISK = 'local';

export interface EmployeeRecord {
  readonly id: number;
  readonly name: string;
  readonly employeeNo: string;
  readonly department: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AttachmentRecord {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly ext: string;
  readonly createdAt: string;
}

export interface CertificateRecord {
  readonly id: number;
  readonly employeeId: number;
  readonly name: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly AttachmentRecord[];
}

export interface CreateEmployeeInput {
  readonly name: string;
  readonly employeeNo: string;
  readonly department: string;
}

export interface CreateCertificateInput {
  readonly name: string;
  readonly expiresAt?: string | null;
  readonly fileIds?: readonly string[];
}

export interface EmployeeRecordsService {
  listEmployees(): Promise<readonly EmployeeRecord[]>;
  getEmployee(id: number): Promise<EmployeeRecord | undefined>;
  createEmployee(input: CreateEmployeeInput): Promise<EmployeeRecord>;
  listCertificates(employeeId: number): Promise<readonly CertificateRecord[]>;
  createCertificate(
    employeeId: number,
    input: CreateCertificateInput,
  ): Promise<CertificateRecord | undefined>;
  deleteCertificate(id: number): Promise<boolean>;
}

export const employeeRecordsToken: ServiceToken<EmployeeRecordsService> =
  createServiceToken<EmployeeRecordsService>('app/employee-records-service');

export function createEmployeeRecordsService(
  database: DatabaseManager,
): EmployeeRecordsService {
  const query = database.query();

  return {
    async listEmployees() {
      const rows = await query
        .selectFrom('employees')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(toEmployee);
    },

    async getEmployee(id) {
      const row = await query
        .selectFrom('employees')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? toEmployee(row) : undefined;
    },

    async createEmployee(input) {
      const now = new Date();
      await query
        .insertInto('employees')
        .values({
          name: input.name,
          employeeNo: input.employeeNo,
          department: input.department,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const row = await query
        .selectFrom('employees')
        .selectAll()
        .where('employeeNo', '=', input.employeeNo)
        .executeTakeFirst();
      if (!row) {
        throw new Error('Created employee could not be read back.');
      }
      return toEmployee(row);
    },

    async listCertificates(employeeId) {
      const certificates = await query
        .selectFrom('employee_certificates')
        .selectAll()
        .where('employeeId', '=', employeeId)
        .orderBy('id', 'asc')
        .execute();
      return attachFiles(certificates);
    },

    async createCertificate(employeeId, input) {
      const employee = await query
        .selectFrom('employees')
        .select(['id'])
        .where('id', '=', employeeId)
        .executeTakeFirst();
      if (!employee) return undefined;

      const now = new Date();
      let certificateId: number | undefined;
      await database.transaction(async (connection) => {
        const inserted = await connection.query
          .insertInto('employee_certificates')
          .values({
            employeeId,
            name: input.name,
            expiresAt: parseExpiry(input.expiresAt),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        certificateId = Number(inserted.insertId);
        if (!Number.isSafeInteger(certificateId) || certificateId <= 0) {
          throw new Error('Created certificate has no identifier.');
        }
        const fileIds = dedupeFileIds(input.fileIds);
        if (fileIds.length > 0) {
          // Only the link changes: the File plugin owns the `updatedAt` value and the repository that serves the bytes
          // requires the temporal format the plugin wrote, so this update must not rewrite the timestamps.
          await connection.query
            .updateTable(EMPLOYEE_FILE_COLLECTION)
            .set({ certificateId })
            .where('id', 'in', fileIds)
            .where('certificateId', 'is', null)
            .execute();
        }
      });

      const created = await query
        .selectFrom('employee_certificates')
        .selectAll()
        .where('id', '=', certificateId as number)
        .executeTakeFirst();
      if (!created) {
        throw new Error('Created certificate could not be read back.');
      }
      const [certificate] = await attachFiles([created]);
      return certificate;
    },

    async deleteCertificate(id) {
      const existing = await query
        .selectFrom('employee_certificates')
        .select(['id'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) return false;

      await database.transaction(async (connection) => {
        // Remove the link first so a failed certificate delete cannot leave orphaned metadata pointing at nothing.
        await connection.query
          .deleteFrom(EMPLOYEE_FILE_COLLECTION)
          .where('certificateId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('employee_certificates')
          .where('id', '=', id)
          .execute();
      });
      return true;
    },
  };

  async function attachFiles(
    certificates: readonly Record<string, unknown>[],
  ): Promise<CertificateRecord[]> {
    if (certificates.length === 0) return [];
    const certificateIds = certificates.map((row) => Number(row.id));
    const rows = await query
      .selectFrom(EMPLOYEE_FILE_COLLECTION)
      .select([
        'id',
        'certificateId',
        'filename',
        'mimeType',
        'size',
        'ext',
        'createdAt',
      ])
      .where('certificateId', 'in', certificateIds)
      .orderBy('createdAt', 'asc')
      .execute();

    const grouped = new Map<number, AttachmentRecord[]>();
    for (const row of rows) {
      const certificateId = Number(row.certificateId);
      const list = grouped.get(certificateId) ?? [];
      list.push({
        id: String(row.id),
        filename: String(row.filename),
        mimeType: String(row.mimeType),
        size: Number(row.size),
        ext: String(row.ext),
        createdAt: toIso(row.createdAt),
      });
      grouped.set(certificateId, list);
    }

    return certificates.map((row) => {
      const id = Number(row.id);
      return {
        id,
        employeeId: Number(row.employeeId),
        name: String(row.name),
        expiresAt: row.expiresAt == null ? null : toIso(row.expiresAt),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        attachments: grouped.get(id) ?? [],
      };
    });
  }
}

function toEmployee(row: Record<string, unknown>): EmployeeRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    employeeNo: String(row.employeeNo),
    department: String(row.department),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    // SQLite stores a datetime as an epoch-millisecond number; the connection may hand it back as a numeric string.
    if (/^\d+(\.\d+)?$/.test(value))
      return new Date(Number(value)).toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function parseExpiry(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dedupeFileIds(fileIds: readonly string[] | undefined): string[] {
  if (!fileIds) return [];
  return [...new Set(fileIds.filter((id) => typeof id === 'string' && id))];
}

export default class EmployeeRecordsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/employee-records-provider';

  public override register(): void {
    this.app.container.singleton(employeeRecordsToken, () =>
      createEmployeeRecordsService(
        this.app.container.resolve(databaseManagerToken),
      ),
    );
  }
}
