import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * Application roles are expressed as Authorization permission sets, so the Users page (which already
 * lists application permission sets as direct roles) is the single place an administrator assigns
 * them. This provider defines the two business roles and maps the effective role back for the IT
 * routes:
 *
 *   system-administrator -> administrator (protected, managed by the authorization plugin)
 *   it-engineer          -> engineer
 *   anything else        -> employee (the default every signed-in user has)
 *
 * A self-registered user therefore starts as an employee with no administrative setup, and an
 * administrator promotes them to engineer from the Users page.
 */

export type ItRole = 'administrator' | 'engineer' | 'employee';

export interface ItAccessService {
  roleOf(userId: string): Promise<ItRole>;
}

export const itAccessToken: ServiceToken<ItAccessService> =
  createServiceToken<ItAccessService>('app/it-access');

const ADMINISTRATOR = 'system-administrator';
const ENGINEER = 'it-engineer';
const EMPLOYEE = 'employee';

type PermissionGrantInput = Parameters<
  AppAuthorization['permissionSets']['create']
>[0]['grants'][number];

const pageGrant = (id: string): PermissionGrantInput => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

// Employees may reach the ticket page they submit from and nothing operational.
const EMPLOYEE_GRANTS: readonly PermissionGrantInput[] = [
  pageGrant('work-orders'),
];

// Engineers additionally own the asset ledger, checkout records, and the dashboard.
const ENGINEER_GRANTS: readonly PermissionGrantInput[] = [
  pageGrant('assets'),
  pageGrant('asset-assignments'),
  pageGrant('work-orders'),
  pageGrant('it-dashboard'),
];

export default class ItAccessProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/it-access';

  public override register(): void {
    this.app.container.singleton(itAccessToken, () =>
      createItAccessService(this.app),
    );
  }

  public override async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(authorizationToken)) return;
    const authorization = container.resolve(authorizationToken);
    await ensurePermissionSet(
      authorization,
      EMPLOYEE,
      'Employee',
      EMPLOYEE_GRANTS,
    );
    await ensurePermissionSet(
      authorization,
      ENGINEER,
      'IT engineer',
      ENGINEER_GRANTS,
    );
    await ensureAuthenticatedAssignment(authorization, EMPLOYEE);
  }
}

function createItAccessService(app: Application): ItAccessService {
  return {
    async roleOf(userId: string): Promise<ItRole> {
      const container = app.container;
      if (!container.has(authorizationToken)) return 'employee';
      const assignments = await container
        .resolve(authorizationToken)
        .permissionSets.listAssignments();
      const keys = new Set(
        assignments
          .filter(
            (assignment) =>
              assignment.subject.type === 'user' &&
              String(assignment.subject.id) === String(userId),
          )
          .map((assignment) => assignment.permissionSet),
      );
      if (keys.has(ADMINISTRATOR)) return 'administrator';
      if (keys.has(ENGINEER)) return 'engineer';
      return 'employee';
    },
  };
}

async function ensurePermissionSet(
  authorization: AppAuthorization,
  key: string,
  title: string,
  grants: readonly PermissionGrantInput[],
): Promise<void> {
  const existing = await authorization.permissionSets.get(key);
  if (!existing) {
    await authorization.permissionSets.create({ key, title, grants });
    return;
  }
  if (!grantsEqual(existing.grants, grants)) {
    await authorization.permissionSets.update(key, { key, title, grants });
  }
}

async function ensureAuthenticatedAssignment(
  authorization: AppAuthorization,
  permissionSet: string,
): Promise<void> {
  const assignments =
    await authorization.permissionSets.listAssignments(permissionSet);
  const present = assignments.some(
    (assignment) =>
      assignment.subject.type === 'authenticated' &&
      assignment.subject.id === '*',
  );
  if (!present) {
    await authorization.permissionSets.assign({
      subject: { type: 'authenticated', id: '*' },
      permissionSet,
    });
  }
}

function grantsEqual(
  left: readonly PermissionGrantInput[],
  right: readonly PermissionGrantInput[],
): boolean {
  const signature = (grants: readonly PermissionGrantInput[]): string =>
    grants
      .map(
        (grant) =>
          `${grant.resource.type}:${grant.resource.id}:${grant.actions
            .map(({ action }) => action)
            .sort()
            .join(',')}`,
      )
      .sort()
      .join('|');
  return signature(left) === signature(right);
}
