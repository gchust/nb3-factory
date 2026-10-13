/**
 * Who works the service desk.
 *
 * The `serviceDeskStaff` table is application-owned role data rather than an authorization permission set: the
 * record scope (own / assigned / all) and the state machine's guards are bespoke business logic that reads this
 * table inside the transition's own transaction, so a role check and the state change it authorizes commit
 * together. Everyone not listed here is an ordinary employee who may only see the tickets they raised.
 *
 * `rolesOf` and `engineerExists` take the transaction handle a lifecycle guard is given, so a guard reads the role
 * through the same transaction it runs in. Outside a transaction the handle is undefined and the default
 * connection is read.
 */
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

export const SERVICE_DESK_ROLES = ['engineer', 'helpdesk'] as const;
export type ServiceDeskRole = (typeof SERVICE_DESK_ROLES)[number];

export interface ServiceDeskStaffRecord {
  readonly id: number;
  readonly userId: string;
  readonly role: ServiceDeskRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceDeskRoles {
  readonly helpdesk: boolean;
  readonly engineer: boolean;
}

export interface ServiceDeskRoleService {
  /** The roles a user holds, read through `handle` when a transition gives one. */
  rolesOf(userId: string, handle?: unknown): Promise<ServiceDeskRoles>;
  /** Whether the user may be assigned a ticket. */
  engineerExists(userId: string, handle?: unknown): Promise<boolean>;
  /** Every service desk member, for the overdue reminder. */
  helpdeskUserIds(handle?: unknown): Promise<readonly string[]>;
  list(): Promise<readonly ServiceDeskStaffRecord[]>;
  setRole(userId: string, role: ServiceDeskRole | null): Promise<void>;
}

export const serviceDeskRoleServiceToken =
  createServiceToken<ServiceDeskRoleService>('service-desk-roles');

function repositoryOf(database: DatabaseManager, handle?: unknown) {
  const connection = handle as DatabaseConnection | undefined;
  if (connection && typeof connection.repository === 'function') {
    return connection.repository<ServiceDeskStaffRecord>('serviceDeskStaff');
  }
  return database.repository<ServiceDeskStaffRecord>('serviceDeskStaff');
}

export function createServiceDeskRoleService(
  database: DatabaseManager,
): ServiceDeskRoleService {
  return {
    async rolesOf(userId, handle) {
      if (!userId) return { helpdesk: false, engineer: false };
      const rows = await repositoryOf(database, handle).findMany({
        filter: { userId },
      });
      return {
        helpdesk: rows.some((row) => row.role === 'helpdesk'),
        engineer: rows.some((row) => row.role === 'engineer'),
      };
    },

    async engineerExists(userId, handle) {
      if (!userId) return false;
      return repositoryOf(database, handle).exists({
        filter: { userId, role: 'engineer' },
      });
    },

    async helpdeskUserIds(handle) {
      const rows = await repositoryOf(database, handle).findMany({
        filter: { role: 'helpdesk' },
        sort: (sort) => sort.field('id').asc(),
      });
      return rows.map((row) => row.userId);
    },

    async list() {
      return repositoryOf(database).findMany({
        sort: (sort) => sort.field('id').asc(),
      });
    },

    async setRole(userId, role) {
      const repository = repositoryOf(database);
      const existing = await repository.findOne({ filter: { userId } });
      const now = new Date().toISOString();
      if (!role) {
        if (existing) {
          await repository.deleteMany({ filter: { userId } });
        }
        return;
      }
      if (existing) {
        await repository.updateOne({
          filter: { id: existing.id },
          values: { role, updatedAt: now },
        });
        return;
      }
      await repository.createOne({
        values: { userId, role, createdAt: now, updatedAt: now },
      });
    },
  };
}

export class ServiceDeskRoleProvider extends ServiceProvider<Application> {
  readonly name = 'service-desk/roles';

  register() {
    this.app.container.singleton(serviceDeskRoleServiceToken, (container) =>
      createServiceDeskRoleService(container.resolve(databaseManagerToken)),
    );
  }
}

export default ServiceDeskRoleProvider;
