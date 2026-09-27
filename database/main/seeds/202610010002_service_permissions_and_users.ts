import { hashPassword } from 'better-auth/crypto';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { defineSeed } from '@nocobase/db';

/**
 * Initial business configuration for the equipment service system:
 *
 * 1. Permission sets, one per job responsibility. They are ordinary persisted
 *    configuration; an administrator can edit their grants and assignments in
 *    the backend after installation.
 * 2. Service teams and the jobs they pass on to members.
 * 3. One demonstration account per job, plus one account holding a direct job
 *    and a different team-inherited job, so that removing the team membership
 *    leaves the direct job intact.
 *
 * The accounts are delivery fixtures. They are created only when the user table
 * has no matching username, so re-running the seed never overwrites a changed
 * account or revokes an administrator's assignment.
 */

export const SERVICE_ROLES = {
  admin: 'service-admin',
  supervisor: 'service-supervisor',
  engineerEast: 'service-engineer-east',
  engineerSouth: 'service-engineer-south',
  collaborator: 'service-collaborator',
  observer: 'service-observer',
  integration: 'service-integration',
} as const;

const PAGES = {
  dashboard: 'service.dashboard',
  customers: 'service.customers',
  customerDetail: 'service.customers.detail',
  devices: 'service.devices',
  deviceDetail: 'service.devices.detail',
  tickets: 'service.tickets',
  ticketDetail: 'service.tickets.detail',
  knowledge: 'service.knowledge',
  knowledgeDetail: 'service.knowledge.detail',
  inspections: 'service.inspections',
  messages: 'service.messages',
  assistant: 'service.assistant',
  integration: 'service.integration',
  apiKeys: 'api-keys',
  databaseExplorer: 'database-explorer',
} as const;

const fieldPages = [
  PAGES.customers,
  PAGES.customerDetail,
  PAGES.devices,
  PAGES.deviceDetail,
];

const ticketPages = [PAGES.tickets, PAGES.ticketDetail];

const knowledgePages = [PAGES.knowledge, PAGES.knowledgeDetail];

const communicationPages = [PAGES.messages, PAGES.assistant];

function pages(...ids: string[]) {
  return ids.map((id) => ({
    resource: { type: 'page' as const, id },
    actions: [{ action: 'access' as const }],
  }));
}

const permissionSets = [
  definePermissionSet(SERVICE_ROLES.admin)
    .title('Service administrator')
    .grant(
      ...pages(
        PAGES.dashboard,
        ...fieldPages,
        ...ticketPages,
        ...knowledgePages,
        PAGES.inspections,
        ...communicationPages,
        PAGES.integration,
        PAGES.apiKeys,
        PAGES.databaseExplorer,
      ),
      // The business administrator maintains the service permission sets from
      // the authorization settings pages, so the roles above stay editable in
      // the running application rather than only in a migration.
      {
        resource: { type: 'settings', id: 'authorization.permission-sets' },
        actions: [{ action: 'read' }],
      },
      {
        resource: { type: 'settings', id: 'authorization.inspector' },
        actions: [{ action: 'inspect' }],
      },
    )
    .build(),
  definePermissionSet(SERVICE_ROLES.supervisor)
    .title('Service supervisor')
    .grant(
      ...pages(
        PAGES.dashboard,
        ...fieldPages,
        ...ticketPages,
        ...knowledgePages,
        PAGES.inspections,
        ...communicationPages,
      ),
    )
    .build(),
  definePermissionSet(SERVICE_ROLES.engineerEast)
    .title('East region service engineer')
    .grant(
      ...pages(
        PAGES.dashboard,
        ...fieldPages,
        ...ticketPages,
        ...knowledgePages,
        ...communicationPages,
      ),
    )
    .build(),
  definePermissionSet(SERVICE_ROLES.engineerSouth)
    .title('South region service engineer')
    .grant(
      ...pages(
        PAGES.dashboard,
        ...fieldPages,
        ...ticketPages,
        ...knowledgePages,
        ...communicationPages,
      ),
    )
    .build(),
  definePermissionSet(SERVICE_ROLES.collaborator)
    .title('Cross-region collaborating engineer')
    .grant(
      ...pages(
        PAGES.dashboard,
        ...ticketPages,
        ...knowledgePages,
        ...communicationPages,
      ),
    )
    .build(),
  definePermissionSet(SERVICE_ROLES.observer)
    .title('Read-only observer')
    .grant(
      ...pages(
        PAGES.dashboard,
        ...fieldPages,
        ...ticketPages,
        ...knowledgePages,
        PAGES.inspections,
        ...communicationPages,
      ),
    )
    .build(),
  definePermissionSet(SERVICE_ROLES.integration)
    .title('External integration account')
    .grant(
      ...pages(
        ...ticketPages,
        PAGES.integration,
        PAGES.apiKeys,
        ...communicationPages,
      ),
    )
    .build(),
];

interface DemoAccount {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly directRoles: readonly string[];
  readonly team?: { readonly code: string; readonly jobKey: string };
}

const DEMO_PASSWORD = 'Service@123';

const demoAccounts: readonly DemoAccount[] = [
  {
    id: 'svc-admin-0001',
    name: '系统管理员 / Service administrator',
    username: 'svc.admin',
    email: 'svc.admin@service.example',
    directRoles: [SERVICE_ROLES.admin],
  },
  {
    id: 'svc-supervisor-0001',
    name: '服务主管 / Service supervisor',
    username: 'svc.supervisor',
    email: 'svc.supervisor@service.example',
    directRoles: [SERVICE_ROLES.supervisor],
  },
  {
    id: 'svc-engineer-east-0001',
    name: '华东工程师 / East engineer',
    username: 'svc.engineer.east',
    email: 'svc.engineer.east@service.example',
    directRoles: [SERVICE_ROLES.engineerEast],
    team: { code: 'east', jobKey: SERVICE_ROLES.engineerEast },
  },
  {
    id: 'svc-engineer-south-0001',
    name: '华南工程师 / South engineer',
    username: 'svc.engineer.south',
    email: 'svc.engineer.south@service.example',
    directRoles: [SERVICE_ROLES.engineerSouth],
    team: { code: 'south', jobKey: SERVICE_ROLES.engineerSouth },
  },
  {
    id: 'svc-collaborator-0001',
    name: '跨区域协作工程师 / Collaborating engineer',
    username: 'svc.collaborator',
    email: 'svc.collaborator@service.example',
    directRoles: [SERVICE_ROLES.collaborator],
    team: { code: 'east', jobKey: SERVICE_ROLES.collaborator },
  },
  {
    id: 'svc-observer-0001',
    name: '只读观察员 / Read-only observer',
    username: 'svc.observer',
    email: 'svc.observer@service.example',
    directRoles: [SERVICE_ROLES.observer],
  },
  {
    id: 'svc-integration-0001',
    name: '外部集成账号 / Integration account',
    username: 'svc.integration',
    email: 'svc.integration@service.example',
    directRoles: [SERVICE_ROLES.integration],
  },
  {
    id: 'svc-engineer-dual-0001',
    name: '华东工程师兼华南团队 / Dual-scope engineer',
    username: 'svc.engineer.dual',
    email: 'svc.engineer.dual@service.example',
    directRoles: [SERVICE_ROLES.engineerEast],
    team: { code: 'south', jobKey: SERVICE_ROLES.engineerSouth },
  },
];

export const SERVICE_TEAMS = [
  { code: 'east', name: '华东服务组 / East service team', region: 'east' },
  { code: 'south', name: '华南服务组 / South service team', region: 'south' },
] as const;

export default defineSeed({
  name: '202610010002_service_permissions_and_users',
  transaction: true,
  async run(context) {
    const { query } = context;
    const now = new Date();

    // Service teams.
    const teamIds = new Map<string, number>();
    for (const team of SERVICE_TEAMS) {
      const existing = await query
        .selectFrom('service_teams')
        .select(['id'])
        .where('code', '=', team.code)
        .executeTakeFirst();
      if (existing) {
        teamIds.set(team.code, Number(existing.id));
        continue;
      }
      const result = await context.repository('service_teams').createOne({
        values: {
          code: team.code,
          name: team.name,
          region: team.region,
          enabled: true,
          description: `${team.region} region service team`,
          createdAt: now,
          updatedAt: now,
        },
      });
      teamIds.set(team.code, Number(result.record.id));
    }

    // Permission sets: create only when absent so administrator edits survive.
    for (const set of permissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const accountPasswordHash = await hashPassword(DEMO_PASSWORD);

    for (const account of demoAccounts) {
      let userId = account.id;
      const existing = await query
        .selectFrom('user')
        .select(['id'])
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        userId = String(existing.id);
      } else {
        await query
          .insertInto('user')
          .values({
            id: account.id,
            name: account.name,
            username: account.username,
            email: account.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: `acct-${account.id}`,
            accountId: account.id,
            providerId: 'credential',
            userId: account.id,
            password: accountPasswordHash,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      // Direct job assignments.
      for (const role of account.directRoles) {
        const assignmentId = `${role}:${userId}`;
        const assigned = await query
          .selectFrom('authorizationPermissionSetAssignments')
          .select('id')
          .where('id', '=', assignmentId)
          .executeTakeFirst();
        if (!assigned) {
          await query
            .insertInto('authorizationPermissionSetAssignments')
            .values({
              id: assignmentId,
              permissionSetKey: role,
              subjectType: 'user',
              subjectId: userId,
              createdAt: now,
              updatedAt: now,
            })
            .execute();
        }
      }

      // Team membership carries a job that is inherited, not directly assigned.
      // The membership itself is the authorization subject, so a membership
      // grants its job without touching the account's direct assignments.
      if (account.team) {
        const teamId = teamIds.get(account.team.code);
        if (teamId !== undefined) {
          let membershipId: number | undefined;
          const membership = await query
            .selectFrom('service_team_members')
            .select('id')
            .where('userId', '=', userId)
            .where('teamId', '=', teamId)
            .where('jobKey', '=', account.team.jobKey)
            .executeTakeFirst();
          if (membership) {
            membershipId = Number(membership.id);
          } else {
            const created = await context
              .repository('service_team_members')
              .createOne({
                values: {
                  teamId,
                  userId,
                  userName: account.name,
                  jobKey: account.team.jobKey,
                  createdAt: now,
                  updatedAt: now,
                },
              });
            membershipId = Number(created.record.id);
          }
          if (membershipId !== undefined) {
            const subjectId = String(membershipId);
            const assignmentId = `${account.team.jobKey}:${subjectId}`;
            const inherited = await query
              .selectFrom('authorizationPermissionSetAssignments')
              .select('id')
              .where('id', '=', assignmentId)
              .executeTakeFirst();
            if (!inherited) {
              await query
                .insertInto('authorizationPermissionSetAssignments')
                .values({
                  id: assignmentId,
                  permissionSetKey: account.team.jobKey,
                  subjectType: 'service-team-member',
                  subjectId,
                  createdAt: now,
                  updatedAt: now,
                })
                .execute();
            }
          }
        }
      }
    }
  },
});
