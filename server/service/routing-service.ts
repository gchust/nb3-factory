import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { PermissionSetsApi } from '@nocobase/authorization/permission-sets';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { ServiceAcceptanceConfig } from '../config/service.js';
import type { Ticket } from './domain.js';

/** The Permission Set every service engineer holds. */
export const ENGINEER_PERMISSION_SET = 'service-engineer';

/** Ticket states that still occupy an engineer's time. */
export const OPEN_TICKET_STATUSES = [
  'pending',
  'accepted',
  'processing',
  'pending_confirm',
] as const;

export interface EngineerLoad {
  readonly id: string;
  readonly name: string;
  readonly openTickets: number;
}

/**
 * The engineer roster and the routing decision behind automatic acceptance.
 *
 * The roster is read from the permission sets the installation actually
 * assigns, not from a second copy of the same fact, so removing an engineer's
 * role also removes them from routing.
 */
export class ServiceRouting {
  constructor(
    private readonly database: DatabaseManager,
    private readonly users: UserAdministrationService,
    private readonly permissionSets:
      PermissionSetsApi<DatabaseConnection> | undefined,
    private readonly acceptance: ServiceAcceptanceConfig,
  ) {}

  get acceptanceConfig(): ServiceAcceptanceConfig {
    return this.acceptance;
  }

  /** Whether a newly created ticket is claimed by the acceptance Workflow. */
  isAutoAcceptanceEnabled(): boolean {
    return this.acceptance.autoEnabled;
  }

  /** Whether automatic acceptance applies to this ticket's source. */
  isEligibleSource(source: string): boolean {
    return !this.acceptance.internalOnly || source === 'internal';
  }

  isEmpty(): boolean {
    return this.permissionSets === undefined;
  }

  async engineerLoads(): Promise<readonly EngineerLoad[]> {
    const ids = await this.engineerIds();
    if (ids.length === 0) return [];
    const names = await this.userNames(ids);
    const repository = this.database.repository<Ticket>('tickets');
    const loads = await Promise.all(
      ids.map(async (id) => ({
        id,
        name: names.get(id) ?? id,
        openTickets: await repository.count({
          filter: (filter) =>
            filter.and([
              filter.number('assigneeId').eq(Number(id)),
              filter.or(
                OPEN_TICKET_STATUSES.map((status) =>
                  filter.string('status').eq(status),
                ),
              ),
            ]),
        }),
      })),
    );
    return loads.sort((left, right) =>
      left.openTickets === right.openTickets
        ? left.id.localeCompare(right.id)
        : left.openTickets - right.openTickets,
    );
  }

  /**
   * The engineer with the fewest open tickets, excluding anyone already ruled
   * out. Deterministic: ties go to the lowest user id.
   */
  async pickEngineer(
    excludeIds: readonly string[] = [],
  ): Promise<EngineerLoad | undefined> {
    const excluded = new Set(excludeIds);
    const loads = await this.engineerLoads();
    return loads.find((load) => !excluded.has(load.id));
  }

  async engineerIds(): Promise<readonly string[]> {
    if (!this.permissionSets) return [];
    const assignments = await this.permissionSets.listAssignments(
      ENGINEER_PERMISSION_SET,
    );
    const ids = assignments
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id);
    return [...new Set(ids)].sort();
  }

  async userNames(ids: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (ids.length === 0) return names;
    const page = await this.users.list({
      userIds: [...ids],
      pageSize: Math.max(ids.length, 1),
    });
    for (const user of page.items) {
      names.set(user.id, user.name || user.username || user.email);
    }
    return names;
  }

  async userName(id: string): Promise<string | undefined> {
    const names = await this.userNames([id]);
    return names.get(id);
  }
}
