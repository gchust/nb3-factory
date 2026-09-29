import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
  type FilterNode,
  type Repository,
  type RepositoryFilter,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Stable department codes; the interface translates them and the seed uses them. */
export const CONTACT_DEPARTMENTS = ['rd', 'sales', 'admin'] as const;

export type ContactDepartment = (typeof CONTACT_DEPARTMENTS)[number];

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly department: ContactDepartment;
  readonly phone: string | null;
  readonly notes: string | null;
}

/** A validated contact payload, ready to be written. */
export interface ContactInput {
  readonly name: string;
  readonly department: ContactDepartment;
  readonly phone: string | null;
  readonly notes: string | null;
}

export type ContactValidationCode =
  | 'CONTACT_NAME_REQUIRED'
  | 'CONTACT_NAME_TOO_LONG'
  | 'CONTACT_DEPARTMENT_INVALID'
  | 'CONTACT_PHONE_INVALID'
  | 'CONTACT_NOTES_TOO_LONG';

export type ContactInputResult =
  | { readonly ok: true; readonly value: ContactInput }
  | { readonly ok: false; readonly code: ContactValidationCode };

export interface ContactListQuery {
  /** Case-insensitive substring match on the name. */
  readonly search?: string;
  readonly department?: ContactDepartment;
}

export interface ContactService {
  /** All contacts, ordered by name ascending. */
  list(query: ContactListQuery): Promise<Contact[]>;
  get(id: number): Promise<Contact | undefined>;
  create(input: ContactInput): Promise<Contact>;
  /** Returns the updated contact, or `undefined` when no contact has that id. */
  update(id: number, input: ContactInput): Promise<Contact | undefined>;
  /** True when a contact was deleted, false when the id did not exist. */
  remove(id: number): Promise<boolean>;
}

const NAME_MAX_LENGTH = 100;
const NOTES_MAX_LENGTH = 500;
/** The requirement is "11 digits when filled", not a specific carrier prefix. */
const PHONE_PATTERN = /^\d{11}$/u;

export function isContactDepartment(
  value: unknown,
): value is ContactDepartment {
  return (
    typeof value === 'string' &&
    (CONTACT_DEPARTMENTS as readonly string[]).includes(value)
  );
}

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Validates and normalizes a contact payload. Pure, so the HTTP layer can map a
 * failure to a 400 without a database and tests can cover every rule directly.
 * Empty optional text is stored as `null`.
 */
export function normalizeContactInput(raw: unknown): ContactInputResult {
  const source = asRecord(raw);

  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) return { ok: false, code: 'CONTACT_NAME_REQUIRED' };
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, code: 'CONTACT_NAME_TOO_LONG' };
  }

  if (!isContactDepartment(source.department)) {
    return { ok: false, code: 'CONTACT_DEPARTMENT_INVALID' };
  }

  const phoneValue = source.phone;
  const phone = typeof phoneValue === 'string' ? phoneValue.trim() : '';
  if (phone && !PHONE_PATTERN.test(phone)) {
    return { ok: false, code: 'CONTACT_PHONE_INVALID' };
  }

  const notesValue = source.notes;
  const notes = typeof notesValue === 'string' ? notesValue.trim() : '';
  if (notes.length > NOTES_MAX_LENGTH) {
    return { ok: false, code: 'CONTACT_NOTES_TOO_LONG' };
  }

  return {
    ok: true,
    value: {
      name,
      department: source.department,
      phone: phone || null,
      notes: notes || null,
    },
  };
}

function buildFilter(
  query: ContactListQuery,
): RepositoryFilter<Contact> | undefined {
  const search = query.search?.trim();
  const { department } = query;
  if (!search && !department) return undefined;

  return (filter) => {
    const conditions: FilterNode[] = [];
    if (search) {
      conditions.push(
        filter.string('name').includes(search, { mode: 'insensitive' }),
      );
    }
    if (department) {
      conditions.push(filter.string('department').eq(department));
    }
    return conditions.length === 1 ? conditions[0] : filter.and(conditions);
  };
}

/** Builds the contacts service over a database manager's default connection. */
export function createContactService(
  database: DatabaseManager,
): ContactService {
  const repository = (): Repository<Contact, ContactInput, ContactInput> =>
    database.repository<Contact, ContactInput, ContactInput>('contacts');

  return {
    async list(query) {
      return repository().findMany({
        filter: buildFilter(query),
        sort: (sort) => sort.field('name').asc(),
      });
    },
    async get(id) {
      return repository().findOne({
        filter: (filter) => filter.number('id').eq(id),
      });
    },
    async create(input) {
      const result = await repository().createOne({ values: input });
      return result.record;
    },
    async update(id, input) {
      try {
        const result = await repository().updateOne({
          filter: (filter) => filter.number('id').eq(id),
          values: input,
        });
        return result.record;
      } catch (error: unknown) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return undefined;
        }
        throw error;
      }
    },
    async remove(id) {
      try {
        await repository().deleteOne({
          filter: (filter) => filter.number('id').eq(id),
        });
        return true;
      } catch (error: unknown) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return false;
        }
        throw error;
      }
    },
  };
}

export const contactServiceToken: ServiceToken<ContactService> =
  createServiceToken<ContactService>('app/contact-service');

export default class ContactProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/contact-provider';

  public override register(): void {
    this.app.container.singleton(contactServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createContactService(database);
    });
  }
}
