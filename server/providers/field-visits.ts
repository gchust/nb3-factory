import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The only conclusions a follow-up record may carry. */
export const FIELD_VISIT_CONCLUSIONS = [
  'satisfied',
  'neutral',
  'dissatisfied',
] as const;

export type FieldVisitConclusion = (typeof FIELD_VISIT_CONCLUSIONS)[number];

export interface FieldVisitRecord {
  readonly id: number;
  readonly customerName: string;
  readonly visitDate: string;
  readonly conclusion: FieldVisitConclusion;
  readonly engineerName: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FieldVisitInput {
  readonly customerName?: unknown;
  readonly visitDate?: unknown;
  readonly conclusion?: unknown;
  readonly engineerName?: unknown;
  readonly notes?: unknown;
}

export interface FieldVisitValidationIssue {
  readonly field: 'customerName' | 'visitDate' | 'conclusion';
  readonly code: string;
}

export class FieldVisitValidationError extends Error {
  public readonly code = 'FIELD_VISIT_VALIDATION_FAILED';
  public readonly issues: readonly FieldVisitValidationIssue[];

  constructor(issues: readonly FieldVisitValidationIssue[]) {
    super('Field visit input is invalid.');
    this.name = 'FieldVisitValidationError';
    this.issues = issues;
  }
}

export interface FieldVisitListOptions {
  readonly search?: string;
  readonly limit?: number;
}

export interface FieldVisitListResult {
  readonly records: readonly FieldVisitRecord[];
  readonly total: number;
}

export interface FieldVisitService {
  list(options?: FieldVisitListOptions): Promise<FieldVisitListResult>;
  create(input: FieldVisitInput): Promise<FieldVisitRecord>;
  update(
    id: number,
    input: FieldVisitInput,
  ): Promise<FieldVisitRecord | undefined>;
}

/** Server-side validation mirrors the form rules so a direct request cannot bypass them. */
export function validateFieldVisitInput(
  input: FieldVisitInput,
): FieldVisitValidationIssue[] {
  const issues: FieldVisitValidationIssue[] = [];

  const customerName = asTrimmedString(input.customerName);
  if (!customerName) {
    issues.push({ field: 'customerName', code: 'CUSTOMER_NAME_REQUIRED' });
  } else if (customerName.length > 64) {
    issues.push({ field: 'customerName', code: 'CUSTOMER_NAME_TOO_LONG' });
  }

  const visitDate = asTrimmedString(input.visitDate);
  if (!visitDate) {
    issues.push({ field: 'visitDate', code: 'VISIT_DATE_REQUIRED' });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    issues.push({ field: 'visitDate', code: 'VISIT_DATE_INVALID' });
  }

  if (typeof input.conclusion !== 'string' || input.conclusion === '') {
    issues.push({ field: 'conclusion', code: 'CONCLUSION_REQUIRED' });
  } else if (
    !(FIELD_VISIT_CONCLUSIONS as readonly string[]).includes(input.conclusion)
  ) {
    issues.push({ field: 'conclusion', code: 'CONCLUSION_INVALID' });
  }

  return issues;
}

export function createFieldVisitService(
  database: DatabaseManager,
): FieldVisitService {
  const query = database.query();

  return {
    async list(options = {}) {
      const keyword = options.search?.trim();
      const limit = options.limit ?? 200;

      const buildRecordsQuery = (): ReturnType<QueryAdapter['selectFrom']> => {
        let recordsQuery = query.selectFrom('fieldVisits').selectAll();
        if (keyword) {
          recordsQuery = recordsQuery.where(
            'customerName',
            'like',
            `%${keyword}%`,
          );
        }
        return recordsQuery;
      };

      const rows = await buildRecordsQuery()
        .orderBy('visitDate', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
        .execute();

      let countQuery = query
        .selectFrom('fieldVisits')
        .select((eb) => [eb.fn.countAll<number>().as('total')]);
      if (keyword) {
        countQuery = countQuery.where('customerName', 'like', `%${keyword}%`);
      }
      const countRow = await countQuery.executeTakeFirst();
      const total = Number(countRow?.total ?? 0);

      return { records: rows.map(toFieldVisitRecord), total };
    },

    async create(input) {
      const values = normalizeFieldVisitInput(input);
      const now = new Date();
      const result = await query
        .insertInto('fieldVisits')
        .values({ ...values, createdAt: now, updatedAt: now })
        .execute();

      const created = await findById(query, Number(result.insertId));
      if (!created) {
        throw new Error(
          'The created field visit record could not be read back.',
        );
      }
      return created;
    },

    async update(id, input) {
      const values = normalizeFieldVisitInput(input);
      await query
        .updateTable('fieldVisits')
        .set({ ...values, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();

      return findById(query, id);
    },
  };
}

async function findById(
  query: QueryAdapter,
  id: number,
): Promise<FieldVisitRecord | undefined> {
  if (!Number.isFinite(id) || id <= 0) {
    return undefined;
  }
  const row = await query
    .selectFrom('fieldVisits')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? toFieldVisitRecord(row) : undefined;
}

function normalizeFieldVisitInput(input: FieldVisitInput) {
  const issues = validateFieldVisitInput(input);
  if (issues.length > 0) {
    throw new FieldVisitValidationError(issues);
  }

  const engineerName = asTrimmedString(input.engineerName);
  const notes = asTrimmedString(input.notes);

  return {
    customerName: asTrimmedString(input.customerName),
    visitDate: asTrimmedString(input.visitDate),
    conclusion: input.conclusion as FieldVisitConclusion,
    engineerName: engineerName || null,
    notes: notes || null,
  };
}

function toFieldVisitRecord(row: Record<string, unknown>): FieldVisitRecord {
  return {
    id: Number(row.id),
    customerName: asTrimmedString(row.customerName),
    visitDate: toDateOnly(row.visitDate),
    conclusion: row.conclusion as FieldVisitConclusion,
    engineerName:
      typeof row.engineerName === 'string' ? row.engineerName : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : '';
}

export const fieldVisitServiceToken: ServiceToken<FieldVisitService> =
  createServiceToken<FieldVisitService>('app/field-visit-service');

export default class FieldVisitProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/field-visit-provider';

  public override register(): void {
    this.app.container.singleton(fieldVisitServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createFieldVisitService(database);
    });
  }
}
