import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Principal } from '@nocobase/authorization/core';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Expression,
  type ExpressionBuilder,
  type SelectQuery,
  type SqlBool,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';

/**
 * Business access for the after-sales service module.
 *
 * The Authorization plugin answers "which permission sets does this identity
 * hold". This service turns those sets into the module's own capabilities and
 * record scopes, and is the single place endpoints ask before reading or
 * writing. Endpoints never trust a page's `authz` or a client-side check: the
 * browser only decides what to show.
 */

export const serviceAccessToken =
  createServiceToken<ServiceAccessService>('service.access');

/** Permission set keys the module defines and the seed creates. */
export const SERVICE_ROLES = {
  admin: 'service-admin',
  supervisor: 'service-supervisor',
  engineerEast: 'service-engineer-east',
  engineerSouth: 'service-engineer-south',
  collaborator: 'service-collaborator',
  observer: 'service-observer',
  integration: 'service-integration',
} as const;

export type ServiceRoleKey = (typeof SERVICE_ROLES)[keyof typeof SERVICE_ROLES];

/** Page grant ids the module's client routes check. */
export const SERVICE_PAGES = [
  'service.dashboard',
  'service.customers',
  'service.customers.detail',
  'service.devices',
  'service.devices.detail',
  'service.tickets',
  'service.tickets.detail',
  'service.knowledge',
  'service.knowledge.detail',
  'service.inspections',
  'service.messages',
  'service.assistant',
  'service.integration',
] as const;

/** The subject type a team membership is assigned permission sets under. */
export const SERVICE_TEAM_SUBJECT_TYPE = 'service-team-member';

export type RecordScope = 'all' | 'region' | 'linked' | 'none';

interface RoleProfile {
  readonly manageAll: boolean;
  readonly allTickets: boolean;
  readonly regionTickets: boolean;
  readonly assignedTickets: boolean;
  readonly sharedTickets: boolean;
  readonly internalFields: boolean;
  readonly manageKnowledge: boolean;
  readonly manageInspections: boolean;
  readonly shareTickets: boolean;
  readonly integrationEvents: boolean;
  readonly assistant: boolean;
  readonly customers: RecordScope;
  readonly devices: RecordScope;
  /** Regions a role contributes, for roles not carried by a team. */
  readonly regions: readonly string[];
}

const NO_PROFILE: RoleProfile = {
  manageAll: false,
  allTickets: false,
  regionTickets: false,
  assignedTickets: false,
  sharedTickets: false,
  internalFields: false,
  manageKnowledge: false,
  manageInspections: false,
  shareTickets: false,
  integrationEvents: false,
  assistant: false,
  customers: 'none',
  devices: 'none',
  regions: [],
};

const ROLE_PROFILES: Readonly<Record<string, RoleProfile>> = {
  [SERVICE_ROLES.admin]: {
    ...NO_PROFILE,
    manageAll: true,
    allTickets: true,
    internalFields: true,
    manageKnowledge: true,
    manageInspections: true,
    shareTickets: true,
    integrationEvents: true,
    assistant: true,
    customers: 'all',
    devices: 'all',
  },
  [SERVICE_ROLES.supervisor]: {
    ...NO_PROFILE,
    manageAll: true,
    allTickets: true,
    internalFields: true,
    manageKnowledge: true,
    manageInspections: true,
    shareTickets: true,
    integrationEvents: true,
    assistant: true,
    customers: 'all',
    devices: 'all',
  },
  [SERVICE_ROLES.engineerEast]: {
    ...NO_PROFILE,
    regionTickets: true,
    assignedTickets: true,
    internalFields: true,
    manageKnowledge: true,
    shareTickets: true,
    assistant: true,
    customers: 'region',
    devices: 'region',
    regions: ['east'],
  },
  [SERVICE_ROLES.engineerSouth]: {
    ...NO_PROFILE,
    regionTickets: true,
    assignedTickets: true,
    internalFields: true,
    manageKnowledge: true,
    shareTickets: true,
    assistant: true,
    customers: 'region',
    devices: 'region',
    regions: ['south'],
  },
  [SERVICE_ROLES.collaborator]: {
    ...NO_PROFILE,
    sharedTickets: true,
    assistant: true,
    customers: 'linked',
    devices: 'linked',
  },
  [SERVICE_ROLES.observer]: {
    ...NO_PROFILE,
    allTickets: true,
    assistant: true,
    customers: 'all',
    devices: 'all',
  },
  [SERVICE_ROLES.integration]: {
    ...NO_PROFILE,
    assignedTickets: true,
    integrationEvents: true,
    devices: 'all',
  },
};

/** What an identity may do inside the module, resolved once per request. */
export interface ServiceIdentity {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly membershipIds: readonly string[];
  readonly regions: readonly string[];
  readonly manageAll: boolean;
  readonly allTickets: boolean;
  readonly regionTickets: boolean;
  readonly assignedTickets: boolean;
  readonly sharedTickets: boolean;
  readonly internalFields: boolean;
  readonly manageKnowledge: boolean;
  readonly manageInspections: boolean;
  readonly shareTickets: boolean;
  readonly integrationEvents: boolean;
  readonly assistant: boolean;
  readonly customers: RecordScope;
  readonly devices: RecordScope;
}

/** A refusal the route layer turns into an HTTP status; never a 500. */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
  }
}

/** The ticket columns every visibility decision reads. */
export interface ServiceTicketScopeRow {
  id: number;
  region: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  confidential: unknown;
}

export class ServiceAccessService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
  ) {}

  /** Resolves an account into the module's own capability set. */
  async identityFor(userId: string): Promise<ServiceIdentity> {
    const authz = this.container.resolve(authorizationToken);
    const principal: Principal = { type: 'user', id: userId };
    const inherited = await authz.subjects.resolveFor(principal);
    const sets = await authz.permissionSets.getEffective({
      principal,
      subjects: inherited,
    });
    const roles = sets
      .map((set) => set.key)
      .filter((key) => key in ROLE_PROFILES);

    const membershipIds = inherited
      .filter((subject) => subject.type === SERVICE_TEAM_SUBJECT_TYPE)
      .map((subject) => subject.id);

    const regions = new Set<string>();
    for (const role of roles) {
      for (const region of ROLE_PROFILES[role].regions) regions.add(region);
    }
    for (const region of await this.regionsForMemberships(membershipIds)) {
      regions.add(region);
    }

    const profiles = roles.map((role) => ROLE_PROFILES[role]);
    const mergeScope = (values: readonly RecordScope[]): RecordScope =>
      values.includes('all')
        ? 'all'
        : values.includes('region')
          ? 'region'
          : values.includes('linked')
            ? 'linked'
            : 'none';

    return {
      userId,
      roles,
      membershipIds,
      regions: [...regions],
      manageAll: profiles.some((profile) => profile.manageAll),
      allTickets: profiles.some((profile) => profile.allTickets),
      regionTickets: profiles.some((profile) => profile.regionTickets),
      assignedTickets: profiles.some((profile) => profile.assignedTickets),
      sharedTickets: profiles.some((profile) => profile.sharedTickets),
      internalFields: profiles.some((profile) => profile.internalFields),
      manageKnowledge: profiles.some((profile) => profile.manageKnowledge),
      manageInspections: profiles.some((profile) => profile.manageInspections),
      shareTickets: profiles.some((profile) => profile.shareTickets),
      integrationEvents: profiles.some((profile) => profile.integrationEvents),
      assistant: profiles.some((profile) => profile.assistant),
      customers: mergeScope(profiles.map((profile) => profile.customers)),
      devices: mergeScope(profiles.map((profile) => profile.devices)),
    };
  }

  /** True when the identity may use the module at all. */
  requireMember(identity: ServiceIdentity): void {
    if (identity.roles.length === 0) {
      throw new ServiceError(
        403,
        'SERVICE_ACCESS_DENIED',
        'This account has no after-sales service role.',
      );
    }
  }

  requireAssistant(identity: ServiceIdentity): void {
    this.requireMember(identity);
    if (!identity.assistant) {
      throw new ServiceError(
        403,
        'ASSISTANT_DENIED',
        'This account may not use the service assistant.',
      );
    }
  }

  requireKnowledgeWrite(identity: ServiceIdentity): void {
    this.requireMember(identity);
    if (!identity.manageKnowledge) {
      throw new ServiceError(
        403,
        'KNOWLEDGE_READ_ONLY',
        'This account may not change knowledge articles.',
      );
    }
  }

  requireInspectionWrite(identity: ServiceIdentity): void {
    this.requireMember(identity);
    if (!identity.manageInspections) {
      throw new ServiceError(
        403,
        'INSPECTION_READ_ONLY',
        'This account may not change inspection plans.',
      );
    }
  }

  requireIntegration(identity: ServiceIdentity): void {
    this.requireMember(identity);
    if (!identity.integrationEvents) {
      throw new ServiceError(
        403,
        'INTEGRATION_DENIED',
        'This account may not report device platform events.',
      );
    }
  }

  async requireTicketRead(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): Promise<void> {
    if (!(await this.canReadTicket(identity, ticket))) {
      throw new ServiceError(
        404,
        'TICKET_NOT_FOUND',
        'This service ticket does not exist or is not visible to you.',
      );
    }
  }

  async requireTicketWrite(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): Promise<void> {
    await this.requireTicketRead(identity, ticket);
    if (identity.manageAll) return;
    if (identity.regionTickets) {
      if (this.isAssignee(identity, ticket)) return;
      if (this.ownsRegion(identity, ticket.region)) return;
    }
    if (
      identity.assignedTickets &&
      (this.isAssignee(identity, ticket) || this.isReporter(identity, ticket))
    ) {
      return;
    }
    if (identity.sharedTickets) return;
    throw new ServiceError(
      403,
      'TICKET_READ_ONLY',
      'This service ticket may not be changed by your role.',
    );
  }

  async canReadTicket(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): Promise<boolean> {
    if (identity.manageAll || identity.allTickets) return true;
    if (identity.regionTickets) {
      if (this.isAssignee(identity, ticket)) return true;
      if (this.isReporter(identity, ticket)) return true;
      if (this.ownsRegion(identity, ticket.region)) return true;
    }
    if (
      identity.assignedTickets &&
      (this.isAssignee(identity, ticket) || this.isReporter(identity, ticket))
    ) {
      return true;
    }
    // A collaborator sees only tickets explicitly shared with them, and never a
    // confidential one — even when a share row exists.
    if (identity.sharedTickets && !asBoolean(ticket.confidential)) {
      return this.isTicketSharedWith(ticket.id, identity.userId);
    }
    return false;
  }

  /**
   * Internal commercial fields (labour and parts cost, internal notes) are
   * visible to supervisors, administrators and the engineer actually handling
   * the ticket — never to observers or collaborators.
   */
  canSeeInternalFields(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): boolean {
    if (identity.manageAll) return true;
    if (!identity.internalFields) return false;
    return (
      this.isAssignee(identity, ticket) ||
      this.ownsRegion(identity, ticket.region)
    );
  }

  /** Collaborators are never shown a confidential ticket, whatever the share says. */
  canShareTicket(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): boolean {
    if (identity.manageAll) return true;
    return identity.shareTickets && !asBoolean(ticket.confidential);
  }

  canReadCustomer(
    identity: ServiceIdentity,
    customerRegion: string | null,
  ): boolean {
    switch (identity.customers) {
      case 'all':
        return true;
      case 'region':
        return (
          customerRegion !== null && identity.regions.includes(customerRegion)
        );
      default:
        return false;
    }
  }

  /**
   * Narrows a customer or device select to the rows this identity may see.
   * A collaborator (`linked`) sees exactly the records their shared tickets
   * point at, never the whole directory.
   */
  async scopeRegionQuery<TRecord extends Row>(
    query: SelectQuery<TRecord>,
    identity: ServiceIdentity,
    scope: RecordScope,
    linkedIds: readonly number[],
  ): Promise<SelectQuery<TRecord>> {
    switch (scope) {
      case 'all':
        return query;
      case 'region':
        return identity.regions.length > 0
          ? query.where((eb) => eb('region', 'in', [...identity.regions]))
          : query.where((eb) => eb('id', '=', -1));
      case 'linked':
        return query.where((eb) =>
          eb('id', 'in', linkedIds.length > 0 ? [...linkedIds] : [-1]),
        );
      default:
        return query.where((eb) => eb('id', '=', -1));
    }
  }

  /** Distinct customer ids referenced by the tickets this identity can see. */
  async linkedCustomerIds(identity: ServiceIdentity): Promise<number[]> {
    return this.linkedIds(identity, 'customerId');
  }

  /** Distinct device ids referenced by the tickets this identity can see. */
  async linkedDeviceIds(identity: ServiceIdentity): Promise<number[]> {
    return this.linkedIds(identity, 'deviceId');
  }

  canReadDevice(
    identity: ServiceIdentity,
    deviceRegion: string | null,
  ): boolean {
    switch (identity.devices) {
      case 'all':
        return true;
      case 'region':
        return deviceRegion !== null && identity.regions.includes(deviceRegion);
      default:
        return false;
    }
  }

  /**
   * Narrows a `service_tickets` select to the rows this identity may see.
   *
   * The shared-ticket branch needs the ticket ids shared with the user, so it
   * is read first and applied as an `in` list rather than as a correlated
   * subquery, which the database-layer query builder does not express portably.
   */
  async scopeTicketQuery<TRecord extends Row>(
    query: SelectQuery<TRecord>,
    identity: ServiceIdentity,
  ): Promise<SelectQuery<TRecord>> {
    if (identity.manageAll || identity.allTickets) return query;

    const clauses: Array<(eb: ExpressionBuilder) => Expression<SqlBool>> = [];
    if (identity.regionTickets) {
      if (identity.regions.length > 0) {
        clauses.push((eb) => eb('region', 'in', [...identity.regions]));
      }
      clauses.push((eb) => eb('assigneeId', '=', identity.userId));
      clauses.push((eb) => eb('reporterId', '=', identity.userId));
    }
    if (identity.assignedTickets) {
      clauses.push((eb) => eb('assigneeId', '=', identity.userId));
      clauses.push((eb) => eb('reporterId', '=', identity.userId));
    }
    if (identity.sharedTickets) {
      const shared = await this.sharedTicketIds(identity.userId);
      clauses.push((eb) => eb('id', 'in', shared.length > 0 ? shared : [-1]));
    }
    if (clauses.length === 0) {
      return query.where((eb) => eb('id', '=', -1));
    }
    return query.where((eb) => eb.or(clauses));
  }

  /** Shared, non-confidential ticket ids for a collaborator. */
  async sharedTicketIds(userId: string): Promise<number[]> {
    const rows = await this.database
      .query()
      .selectFrom('service_ticket_shares')
      .innerJoin(
        'service_tickets',
        'service_tickets.id',
        'service_ticket_shares.ticketId',
      )
      .select(['service_ticket_shares.ticketId as ticketId'])
      .where('service_ticket_shares.userId', '=', userId)
      .where('service_tickets.confidential', '=', false)
      .execute<{ ticketId: number | string }>();
    return rows.map((row) => Number(row.ticketId));
  }

  private async isTicketSharedWith(
    ticketId: number,
    userId: string,
  ): Promise<boolean> {
    const row = await this.database
      .query()
      .selectFrom('service_ticket_shares')
      .select(['ticketId'])
      .where('ticketId', '=', ticketId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Regions of the teams this account belongs to. */
  private async regionsForMemberships(
    membershipIds: readonly string[],
  ): Promise<string[]> {
    if (membershipIds.length === 0) return [];
    const rows = await this.database
      .query()
      .selectFrom('service_team_members')
      .innerJoin(
        'service_teams',
        'service_teams.id',
        'service_team_members.teamId',
      )
      .select(['service_teams.region as region'])
      .where('service_team_members.id', 'in', [...membershipIds])
      .execute<{ region: string | null }>();
    return rows
      .map((row) => row.region)
      .filter((region): region is string => typeof region === 'string');
  }

  /** Distinct non-null foreign keys of the tickets this identity can see. */
  private async linkedIds(
    identity: ServiceIdentity,
    column: 'customerId' | 'deviceId',
  ): Promise<number[]> {
    const scoped = await this.scopeTicketQuery(
      this.database
        .query()
        .selectFrom('service_tickets')
        .select([`${column} as linkedId`])
        .where(column, 'is not', null),
      identity,
    );
    const rows = await scoped.execute<{ linkedId: number | string | null }>();
    const ids = new Set<number>();
    for (const row of rows) {
      if (row.linkedId !== null && row.linkedId !== undefined) {
        ids.add(Number(row.linkedId));
      }
    }
    return [...ids];
  }

  private isAssignee(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): boolean {
    return ticket.assigneeId === identity.userId;
  }

  private isReporter(
    identity: ServiceIdentity,
    ticket: ServiceTicketScopeRow,
  ): boolean {
    return ticket.reporterId === identity.userId;
  }

  private ownsRegion(
    identity: ServiceIdentity,
    region: string | null,
  ): boolean {
    return region !== null && identity.regions.includes(region);
  }
}

/** SQLite returns 0/1 for a boolean column; a driver may also return true/false. */
export function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function createServiceAccessService(
  container: ServiceResolver,
): ServiceAccessService {
  return new ServiceAccessService(
    container.resolve(databaseManagerToken),
    container,
  );
}
