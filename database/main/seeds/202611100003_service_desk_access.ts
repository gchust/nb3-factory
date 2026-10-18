import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type QueryAdapter } from '@nocobase/db';

const EMPLOYEE = 'service-desk-employee';
const MANAGER = 'service-desk-manager';

interface PersistedAction {
  action?: string;
  policy?: unknown;
  [key: string]: unknown;
}

interface PersistedGrant {
  resource?: { type?: string; id?: string; [key: string]: unknown };
  actions?: PersistedAction[];
  [key: string]: unknown;
}

interface PermissionSetDefinition {
  key: string;
  title: { key: string; ns: string };
  grants: readonly PersistedGrant[];
}

// Kept here rather than imported from the seed that first created these sets:
// a seed is loaded on its own, including in a build that has not compiled the
// neighboring seed yet.
const ns = 'nb3-factory';
const pageGrant = {
  resource: { type: 'page', id: 'service-desk' },
  actions: [{ action: 'access' }],
};
const usersPageGrant = {
  resource: { type: 'page', id: 'service-desk.users' },
  actions: [{ action: 'access' }],
};
const userAdminGrant = {
  resource: { type: 'user', id: '*' },
  actions: [{ action: 'read' }, { action: 'assign-role' }],
};

function ticketGrant(
  scopes: Readonly<Record<string, string>>,
  actions: readonly string[],
): PersistedGrant {
  return {
    resource: { type: 'composite', id: 'serviceDesk.tickets' },
    actions: actions.map((action) => ({
      action,
      policy: { type: 'composite', scopes },
    })),
  };
}

const serviceDeskPermissionSets: readonly PermissionSetDefinition[] = [
  {
    key: EMPLOYEE,
    title: { key: 'serviceDesk.permissionSets.employee', ns },
    grants: [
      pageGrant,
      ticketGrant(
        {
          tickets: 'serviceDesk.requesterTickets',
          comments: 'serviceDesk.requesterComments',
        },
        ['view'],
      ),
      ticketGrant({ tickets: 'allRecords', comments: 'allRecords' }, [
        'create',
      ]),
      ticketGrant(
        { tickets: 'serviceDesk.requesterTickets', comments: 'allRecords' },
        ['comment', 'confirm', 'reopen'],
      ),
    ],
  },
  {
    key: 'service-desk-engineer',
    title: { key: 'serviceDesk.permissionSets.engineer', ns },
    grants: [
      pageGrant,
      ticketGrant(
        {
          tickets: 'serviceDesk.assigneeTickets',
          comments: 'serviceDesk.assigneeComments',
        },
        ['view'],
      ),
      ticketGrant(
        { tickets: 'serviceDesk.assigneeTickets', comments: 'allRecords' },
        ['comment', 'resolve'],
      ),
    ],
  },
  {
    key: MANAGER,
    title: { key: 'serviceDesk.permissionSets.manager', ns },
    grants: [
      pageGrant,
      usersPageGrant,
      userAdminGrant,
      ticketGrant({ tickets: 'allRecords', comments: 'allRecords' }, [
        'view',
        'create',
        'assign',
        'comment',
        'resolve',
        'confirm',
        'reopen',
      ]),
    ],
  },
];

function parseGrants(value: unknown): PersistedGrant[] {
  if (Array.isArray(value)) return value as PersistedGrant[];
  if (typeof value !== 'string' || !value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? (parsed as PersistedGrant[]) : [];
}

/**
 * Adds the actions a grant is missing without discarding a grant an
 * administrator added or a policy they tuned. The permission set seed created
 * these grants without the user-management surface; this closes that gap for a
 * database where the set already exists.
 */
function mergeGrants(
  existing: readonly PersistedGrant[],
  required: readonly PersistedGrant[],
): { grants: PersistedGrant[]; changed: boolean } {
  const grants = structuredClone(existing) as PersistedGrant[];
  let changed = false;

  for (const requiredGrant of required) {
    const sameResource = (grant: PersistedGrant) =>
      grant.resource?.type === requiredGrant.resource?.type &&
      grant.resource?.id === requiredGrant.resource?.id;
    // Reuse the grant that already carries one of these actions before falling
    // back to the first grant for the resource. Separate grants can hold the
    // same resource with different record scopes, and moving an action between
    // them would change who the action applies to.
    const matching =
      grants.find(
        (grant) =>
          sameResource(grant) &&
          (requiredGrant.actions ?? []).some((requiredAction) =>
            (grant.actions ?? []).some(
              (action) => action.action === requiredAction.action,
            ),
          ),
      ) ?? grants.find(sameResource);
    if (!matching) {
      grants.push(structuredClone(requiredGrant));
      changed = true;
      continue;
    }
    matching.actions ??= [];
    for (const requiredAction of requiredGrant.actions ?? []) {
      const action = matching.actions.find(
        (candidate) => candidate.action === requiredAction.action,
      );
      if (!action) {
        matching.actions.push(structuredClone(requiredAction));
        changed = true;
      } else if (!action.policy && requiredAction.policy) {
        action.policy = structuredClone(requiredAction.policy);
        changed = true;
      }
    }
  }
  return { grants, changed };
}

async function ensureAssignment(
  query: QueryAdapter,
  subjectType: 'authenticated' | 'user',
  subjectId: string,
  permissionSetKey: string,
  now: Date,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('subjectType', '=', subjectType)
    .where('subjectId', '=', subjectId)
    .where('permissionSetKey', '=', permissionSetKey)
    .executeTakeFirst();
  if (existing) return;

  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: `${subjectType}:${subjectId}:${permissionSetKey}`,
      subjectType,
      subjectId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export default defineSeed({
  name: '202611100003_service_desk_access',
  transaction: true,
  async run({ config, query }) {
    const now = new Date();

    for (const definition of serviceDeskPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select(['grants'])
        .where('key', '=', definition.key)
        .executeTakeFirst();

      if (!existing) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: definition.key,
            key: definition.key,
            title: encodeAuthorizationTitle(definition.title),
            grants: JSON.stringify(definition.grants),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        continue;
      }

      const merged = mergeGrants(
        parseGrants(existing.grants),
        definition.grants,
      );
      if (merged.changed) {
        await query
          .updateTable('authorizationPermissionSets')
          .set({ grants: JSON.stringify(merged.grants), updatedAt: now })
          .where('key', '=', definition.key)
          .execute();
      }
    }

    // Every signed-in account is an employee, including accounts registered
    // after installation. Engineers and managers receive their additional
    // roles through the Users page.
    await ensureAssignment(query, 'authenticated', '*', EMPLOYEE, now);

    const configuredUsername = String(
      config.get('users.initialAdmin.username') ?? 'nocobase',
    ).toLowerCase();
    let admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', configuredUsername)
      .limit(1)
      .executeTakeFirst();
    // The factory may create its administrator before this seed reads the
    // configuration, under a username the configuration does not name. The
    // first account is the bootstrap administrator on a new installation.
    admin ??= await query
      .selectFrom('user')
      .select('id')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();

    if (admin) {
      await ensureAssignment(query, 'user', String(admin.id), MANAGER, now);
    }
  },
});
