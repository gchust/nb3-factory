import type {
  DatabaseManager,
  RepositoryMutationScalarValue,
  RepositoryPolicy,
  RepositoryRecord,
} from '@nocobase/db';
import type { ScopedRepository } from '@nocobase/db';
import type { ServiceTeamRecord } from './records.js';
import { asText } from './text.js';

/**
 * Reads and writes for the customer/device ledger, plus the small lookups the
 * other services need (user display names, engineer groups, supervisors).
 * Business authorization is decided by the caller; these methods receive an
 * already-resolved Repository Policy for the collections they touch.
 */

export interface DirectoryUserRef {
  id: string;
  name: string;
}

export interface TeamSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  members: DirectoryUserRef[];
}

type AnyRepository = ScopedRepository<RepositoryRecord, object, object>;
type MutationValues = Record<string, RepositoryMutationScalarValue>;

function scoped(
  database: DatabaseManager,
  collection: string,
  policy: RepositoryPolicy | undefined,
): AnyRepository {
  const repository = database.repository(collection);
  return (policy
    ? repository.withPolicy(policy)
    : repository) as unknown as AnyRepository;
}

export class ServiceDirectoryService {
  public constructor(private readonly database: DatabaseManager) {}

  public async listCustomers(
    policy: RepositoryPolicy,
    options: {
      query?: string;
      ownerId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<RepositoryRecord[]> {
    return scoped(this.database, 'serviceCustomers', policy).findMany({
      filter: (filter) =>
        filter.and([
          ...(options.ownerId
            ? [filter.string('ownerId').eq(options.ownerId)]
            : []),
          ...(options.query
            ? [filter.string('name').includes(options.query)]
            : []),
        ]),
      sort: (sort) => sort.field('createdAt').desc(),
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    });
  }

  public async getCustomer(
    policy: RepositoryPolicy,
    id: number,
  ): Promise<RepositoryRecord | undefined> {
    return scoped(this.database, 'serviceCustomers', policy).findOne({
      filter: { id },
    });
  }

  public async createCustomer(
    policy: RepositoryPolicy,
    values: MutationValues,
  ): Promise<RepositoryRecord> {
    const { record } = await scoped(
      this.database,
      'serviceCustomers',
      policy,
    ).createOne({ values });
    return record;
  }

  public async updateCustomer(
    policy: RepositoryPolicy,
    id: number,
    values: MutationValues,
  ): Promise<RepositoryRecord | undefined> {
    const { record } = await scoped(
      this.database,
      'serviceCustomers',
      policy,
    ).updateOne({ filter: { id }, values });
    return record;
  }

  public async listDevices(
    policy: RepositoryPolicy,
    options: {
      customerId?: number;
      query?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<RepositoryRecord[]> {
    return scoped(this.database, 'serviceDevices', policy).findMany({
      filter: (filter) =>
        filter.and([
          ...(options.customerId !== undefined
            ? [filter.number('customerId').eq(options.customerId)]
            : []),
          ...(options.status
            ? [filter.string('status').eq(options.status)]
            : []),
          ...(options.query
            ? [filter.string('serialNumber').includes(options.query)]
            : []),
        ]),
      sort: (sort) => sort.field('createdAt').desc(),
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    });
  }

  public async getDevice(
    policy: RepositoryPolicy,
    id: number,
  ): Promise<RepositoryRecord | undefined> {
    return scoped(this.database, 'serviceDevices', policy).findOne({
      filter: { id },
    });
  }

  public async createDevice(
    policy: RepositoryPolicy,
    values: MutationValues,
  ): Promise<RepositoryRecord> {
    const { record } = await scoped(
      this.database,
      'serviceDevices',
      policy,
    ).createOne({ values });
    return record;
  }

  public async updateDevice(
    policy: RepositoryPolicy,
    id: number,
    values: MutationValues,
  ): Promise<RepositoryRecord | undefined> {
    const { record } = await scoped(
      this.database,
      'serviceDevices',
      policy,
    ).updateOne({ filter: { id }, values });
    return record;
  }

  /** Engineer groups with their members, for assignment and administration. */
  public async listTeams(): Promise<TeamSummary[]> {
    const teams = await this.database
      .query()
      .selectFrom<Partial<ServiceTeamRecord>>('service_teams')
      .select(['id', 'code', 'name', 'description'])
      .orderBy('code', 'asc')
      .execute();
    const members = await this.database
      .query()
      .selectFrom('service_team_members')
      .select(['teamId', 'userId'])
      .execute();
    const ids = [...new Set(members.map((row) => String(row.userId)))];
    const names = await this.resolveUserNames(ids);
    return teams.map((team) => ({
      id: Number(team.id),
      code: String(team.code),
      name: String(team.name),
      description: team.description === null ? null : asText(team.description),
      members: members
        .filter((row) => Number(row.teamId) === Number(team.id))
        .map((row) => {
          const id = String(row.userId);
          return { id, name: names.get(id) ?? id };
        }),
    }));
  }

  /** User ids that hold a permission set, resolved from stored assignments. */
  public async userIdsWithPermissionSet(
    permissionSet: string,
  ): Promise<string[]> {
    const rows = await this.database
      .query()
      .selectFrom('authorization_permission_set_assignments')
      .select('subjectId')
      .where('permissionSetKey', '=', permissionSet)
      .where('subjectType', '=', 'user')
      .execute();
    return [...new Set(rows.map((row) => String(row.subjectId)))];
  }

  /**
   * Candidate engineer user ids: members of every group that carries the
   * engineer permission set. The set is looked up from stored assignments, so
   * an administrator adding a group or moving a member changes this without a
   * code change.
   */
  public async engineerUserIds(): Promise<string[]> {
    const groups = await this.database
      .query()
      .selectFrom('authorization_permission_set_assignments')
      .select('subjectId')
      .where('permissionSetKey', '=', 'service-engineer')
      .where('subjectType', '=', 'service.team')
      .execute();
    if (groups.length === 0) return [];
    const teamIds = groups.map((row) => Number(row.subjectId));
    const members = await this.database
      .query()
      .selectFrom('service_team_members')
      .select('userId')
      .where('teamId', 'in', teamIds)
      .execute();
    return [...new Set(members.map((row) => String(row.userId)))];
  }

  /** Display names for a set of user ids; never throws for unknown ids. */
  public async resolveUserNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const result = new Map<string, string>();
    if (unique.length === 0) return result;
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', unique)
      .execute();
    for (const row of rows) {
      result.set(String(row.id), String(row.name ?? row.username ?? row.id));
    }
    return result;
  }

  /** Active users, for an assignment picker. */
  public async listUsers(): Promise<DirectoryUserRef[]> {
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('deletedAt', 'is', null)
      .orderBy('name', 'asc')
      .execute();
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.username ?? row.id),
    }));
  }
}
