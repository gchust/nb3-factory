import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A visitor register row as the API returns it. */
export interface Visitor {
  readonly id: number;
  readonly name: string;
  readonly phone: string;
  readonly reason: string;
  readonly employeeName: string;
  readonly arrivedAt: string;
  readonly departedAt: string | null;
}

/** The fields a caller supplies when registering an arrival. */
export interface CreateVisitorInput {
  readonly name: string;
  readonly phone: string;
  readonly reason: string;
  readonly employeeName: string;
  readonly arrivedAt: string;
}

export type VisitorStatus = 'onSite' | 'left';

/** The register filters. Every one is optional; no filter means the whole register. */
export interface VisitorListFilter {
  /** Inclusive lower bound on `arrivedAt`, an ISO instant. */
  readonly from?: string;
  /** Exclusive upper bound on `arrivedAt`, an ISO instant. */
  readonly to?: string;
  readonly employeeName?: string;
  readonly status?: VisitorStatus;
  /** Free text matched against the visitor's name, phone and visited employee. */
  readonly search?: string;
}

export type VisitorErrorCode =
  | 'VALIDATION_ERROR'
  | 'VISITOR_NOT_FOUND'
  | 'ALREADY_DEPARTED'
  | 'DEPARTED_BEFORE_ARRIVED';

/**
 * A domain failure that maps to an HTTP status in the route. The message is a
 * stable code, never user-facing prose: the client owns the wording so it can
 * translate it.
 */
export class VisitorError extends Error {
  readonly code: VisitorErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(code: VisitorErrorCode, details: Record<string, string> = {}) {
    super(code);
    this.name = 'VisitorError';
    this.code = code;
    this.details = details;
  }
}

/** A mainland-China mobile number: exactly eleven digits. */
export const VISITOR_PHONE_PATTERN = /^\d{11}$/;

export const VISITOR_FIELD_LIMITS = {
  name: 100,
  reason: 255,
  employeeName: 100,
} as const;

/** The database row. Time fields are ISO strings, as the repository returns and accepts them. */
interface VisitorRow {
  id: number;
  name: string;
  phone: string;
  reason: string;
  employeeName: string;
  arrivedAt: string;
  departedAt: string | null;
}

function parseInstant(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? undefined : instant;
}

/**
 * Validates a registration payload field by field. Only the failing fields are
 * present in the result; the value is a code the client translates.
 */
export function validateCreateVisitorInput(
  input: CreateVisitorInput,
): Record<string, string> {
  const details: Record<string, string> = {};

  const name = input.name.trim();
  if (!name) {
    details.name = 'REQUIRED';
  } else if (name.length > VISITOR_FIELD_LIMITS.name) {
    details.name = 'TOO_LONG';
  }

  const phone = input.phone.trim();
  if (!phone) {
    details.phone = 'REQUIRED';
  } else if (!VISITOR_PHONE_PATTERN.test(phone)) {
    details.phone = 'INVALID_FORMAT';
  }

  const reason = input.reason.trim();
  if (!reason) {
    details.reason = 'REQUIRED';
  } else if (reason.length > VISITOR_FIELD_LIMITS.reason) {
    details.reason = 'TOO_LONG';
  }

  const employeeName = input.employeeName.trim();
  if (!employeeName) {
    details.employeeName = 'REQUIRED';
  } else if (employeeName.length > VISITOR_FIELD_LIMITS.employeeName) {
    details.employeeName = 'TOO_LONG';
  }

  if (parseInstant(input.arrivedAt) === undefined) {
    details.arrivedAt = 'REQUIRED';
  }

  return details;
}

function toVisitor(row: VisitorRow): Visitor {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    reason: row.reason,
    employeeName: row.employeeName,
    arrivedAt: row.arrivedAt,
    departedAt: row.departedAt ?? null,
  };
}

/**
 * The visitor register: registration, checkout, filtering and the list of
 * visited employees the filter offers. It reads and writes rows only; HTTP
 * status codes belong to the route.
 */
export class VisitorService {
  constructor(private readonly database: DatabaseManager) {}

  async list(filter: VisitorListFilter = {}): Promise<Visitor[]> {
    const repository = this.database.repository<VisitorRow>('visitors');
    const search = filter.search?.trim();
    const hasFilter = Boolean(
      filter.from ||
      filter.to ||
      filter.employeeName ||
      filter.status ||
      search,
    );

    const rows = await repository.findMany({
      ...(hasFilter
        ? {
            filter: (builder) => {
              const conditions = [];
              if (filter.from) {
                conditions.push(
                  builder.date('arrivedAt').notBefore(filter.from),
                );
              }
              if (filter.to) {
                conditions.push(builder.date('arrivedAt').before(filter.to));
              }
              if (filter.employeeName) {
                conditions.push(
                  builder.string('employeeName').eq(filter.employeeName),
                );
              }
              if (filter.status === 'onSite') {
                conditions.push(builder.date('departedAt').empty());
              } else if (filter.status === 'left') {
                conditions.push(builder.date('departedAt').notEmpty());
              }
              if (search) {
                conditions.push(
                  builder.or([
                    builder.string('name').includes(search),
                    builder.string('phone').includes(search),
                    builder.string('employeeName').includes(search),
                  ]),
                );
              }
              return builder.and(conditions);
            },
          }
        : {}),
      sort: (sort) => [sort.field('arrivedAt').desc()],
    });

    return rows.map(toVisitor);
  }

  async getById(id: number): Promise<Visitor | undefined> {
    const row = await this.database
      .repository<VisitorRow>('visitors')
      .findOne({ filter: { id } });
    return row ? toVisitor(row) : undefined;
  }

  async create(input: CreateVisitorInput): Promise<Visitor> {
    const details = validateCreateVisitorInput(input);
    if (Object.keys(details).length > 0) {
      throw new VisitorError('VALIDATION_ERROR', details);
    }

    const result = await this.database
      .repository<VisitorRow>('visitors')
      .createOne({
        values: {
          name: input.name.trim(),
          phone: input.phone.trim(),
          reason: input.reason.trim(),
          employeeName: input.employeeName.trim(),
          arrivedAt: new Date(input.arrivedAt).toISOString(),
        },
      });
    return toVisitor(result.record);
  }

  /** Records the departure time. A visitor who already left cannot be checked out twice. */
  async checkout(id: number, departedAt: string): Promise<Visitor> {
    const repository = this.database.repository<VisitorRow>('visitors');
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      throw new VisitorError('VISITOR_NOT_FOUND');
    }
    if (existing.departedAt) {
      throw new VisitorError('ALREADY_DEPARTED');
    }

    const departure = parseInstant(departedAt);
    if (departure === undefined) {
      throw new VisitorError('VALIDATION_ERROR', { departedAt: 'REQUIRED' });
    }
    const arrival = parseInstant(existing.arrivedAt);
    if (arrival !== undefined && departure < arrival) {
      throw new VisitorError('DEPARTED_BEFORE_ARRIVED');
    }

    const result = await repository.updateOne({
      filter: { id },
      values: { departedAt: new Date(departure).toISOString() },
    });
    return toVisitor(result.record);
  }

  /** The distinct employee names already in the register, for the filter. */
  async listEmployeeNames(): Promise<string[]> {
    const rows = await this.database
      .repository<VisitorRow>('visitors')
      .groupBy({
        by: ['employeeName'],
        aggregate: (aggregate) => ({ count: aggregate.count() }),
        sort: (sort) => [sort.field('employeeName').asc()],
      });
    return rows
      .map((row) => String(row.employeeName))
      .filter((name) => name.length > 0);
  }
}

export const visitorServiceToken: ServiceToken<VisitorService> =
  createServiceToken<VisitorService>('@nocobase/app/visitor-service');

/** Binds the register service to the application's default connection. */
export class VisitorServiceProvider extends ServiceProvider<Application> {
  readonly name = 'visitor-register';

  register(): void {
    this.app.container.singleton(
      visitorServiceToken,
      () =>
        new VisitorService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}
