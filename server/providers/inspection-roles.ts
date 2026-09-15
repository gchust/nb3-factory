import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

/**
 * Application roles are authorization Permission Sets used as role markers. The
 * `system-administrator` Permission Set is provisioned by the template; these
 * three are created on demand by {@link ensureInspectionRoles} so the role
 * dimension exists before anyone registers.
 */
export const INSPECTION_ROLES = {
  inspector: 'inspection-inspector',
  teamLead: 'inspection-team-lead',
  viewer: 'inspection-viewer',
} as const;

export type InspectionRole = keyof typeof INSPECTION_ROLES;

export const INSPECTION_ROLE_KEYS: readonly string[] =
  Object.values(INSPECTION_ROLES);

const ROLE_TITLES: Readonly<Record<InspectionRole, string>> = {
  inspector: 'Inspection inspector',
  teamLead: 'Inspection team lead',
  viewer: 'Inspection viewer',
};

export const ASSIGNABLE_INSPECTION_ROLES: readonly InspectionRole[] = [
  'inspector',
  'teamLead',
  'viewer',
];

export type ResolvedRole = 'admin' | InspectionRole | 'none';

/**
 * Route names of the inspection pages. A page route with `auth: 'required'`
 * and no explicit `access` is checked against a `page:<route name>` grant, so
 * every role that should reach a page has to be granted it here. Without these
 * grants a signed-in inspector is bounced by the client with "Access denied"
 * even though the server would accept their requests.
 */
export const INSPECTION_PAGE_NAMES = {
  records: 'inspectionRecords',
  recordNew: 'inspectionRecordNew',
  recordDetail: 'inspectionRecordDetail',
  abnormal: 'inspectionAbnormal',
  statistics: 'inspectionStatistics',
  devices: 'inspectionDevices',
  plans: 'inspectionPlans',
} as const;

const ALL_PAGES: readonly string[] = Object.values(INSPECTION_PAGE_NAMES);

/**
 * Readable pages plus the pages each role may act on. A viewer may browse and
 * open a record but never reaches the create form; an inspector and a team
 * lead may both file a record.
 */
const ROLE_PAGES: Readonly<Record<InspectionRole, readonly string[]>> = {
  inspector: ALL_PAGES,
  teamLead: ALL_PAGES,
  viewer: ALL_PAGES.filter((page) => page !== INSPECTION_PAGE_NAMES.recordNew),
};

let ensurePromise: Promise<void> | undefined;

/**
 * Create the inspection Permission Sets if they are missing, and keep their
 * page grants in step with {@link ROLE_PAGES}. Idempotent and memoized; a
 * failure clears the memo so the next caller can retry once the database is
 * reachable.
 */
export function ensureInspectionRoles(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
): Promise<void> {
  ensurePromise ??= run(authorization).catch((error: unknown) => {
    ensurePromise = undefined;
    throw error;
  });
  return ensurePromise;
}

async function run(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
): Promise<void> {
  for (const role of ASSIGNABLE_INSPECTION_ROLES) {
    const key = INSPECTION_ROLES[role];
    const title = ROLE_TITLES[role];
    const grants = pageGrants(role);
    const existing = await authorization.permissionSets.get(key);
    if (!existing) {
      await authorization.permissionSets.create({ key, title, grants });
      continue;
    }
    // A set created before this rule existed, or by an administrator, still
    // needs the page grants or the role cannot open the application.
    if (JSON.stringify(existing.grants) !== JSON.stringify(grants)) {
      await authorization.permissionSets.update(key, { key, title, grants });
    }
  }
}

function pageGrants(role: InspectionRole) {
  return ROLE_PAGES[role].map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

/**
 * Resolve the caller's application role from the Permission Set assignments.
 * A user with the administrator set is always the administrator; otherwise the
 * highest-privilege inspection role wins. No assignment means "none", which
 * callers treat as least privilege.
 */
export async function resolveUserRole(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
  userId: string,
): Promise<ResolvedRole> {
  const assignments = await authorization.permissionSets.listAssignments();
  const keys = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === userId,
      )
      .map((assignment) => assignment.permissionSet),
  );
  if (keys.has('system-administrator')) return 'admin';
  if (keys.has(INSPECTION_ROLES.teamLead)) return 'teamLead';
  if (keys.has(INSPECTION_ROLES.inspector)) return 'inspector';
  if (keys.has(INSPECTION_ROLES.viewer)) return 'viewer';
  return 'none';
}
