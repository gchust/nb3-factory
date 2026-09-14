import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  userManagementServiceToken,
  type ManagedUser,
  type UserManagementService,
} from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { provisionRetailAuthorization } from './authorization.js';
import { RetailService } from './service.js';
import { retailServiceToken } from './tokens.js';

interface DemoAccount {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  /** Permission Set keys assigned on creation; omitted means the authenticated default applies. */
  readonly roles?: readonly string[];
}

/**
 * Store manager and viewer accounts so the four roles can be exercised immediately. The cashier
 * role is the authenticated default and needs no explicit assignment.
 */
const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: '店长',
    username: 'manager',
    email: 'manager@shop.local',
    password: 'manager123',
    roles: ['retail-store-manager'],
  },
  {
    name: '收银员',
    username: 'cashier',
    email: 'cashier@shop.local',
    password: 'cashier123',
  },
  {
    name: '查看员',
    username: 'viewer',
    email: 'viewer@shop.local',
    password: 'viewer123',
    roles: ['retail-viewer'],
  },
];

/**
 * Owns the retail module: it exposes the service, registers the authorization collections and
 * provisions the fixed roles and sample accounts once the database is ready.
 */
export default class RetailProvider extends ServiceProvider<Application> {
  public readonly name = 'app/retail';

  public override register(): void {
    this.app.container.singleton(retailServiceToken, (resolver) => {
      return new RetailService(resolver.resolve(databaseManagerToken));
    });
  }

  public override async boot(): Promise<void> {
    if (this.app.container.has(authorizationToken)) {
      const authorization =
        this.app.container.resolve<AppAuthorization>(authorizationToken);
      await provisionRetailAuthorization(authorization);
    }
    await this.provisionDemoAccounts();
  }

  private async provisionDemoAccounts(): Promise<void> {
    if (!this.app.container.has(userManagementServiceToken)) return;
    const users = this.app.container.resolve<UserManagementService>(
      userManagementServiceToken,
    );

    for (const account of DEMO_ACCOUNTS) {
      try {
        if (await findUser(users, account.email)) continue;
        await users.create({
          name: account.name,
          username: account.username,
          email: account.email,
          password: account.password,
          ...(account.roles ? { roleScopes: { app: [...account.roles] } } : {}),
        });
      } catch {
        // A demo account must never stop the application from starting. The account simply stays
        // absent; an administrator can still create it from the Users page.
      }
    }
  }
}

async function findUser(
  users: UserManagementService,
  email: string,
): Promise<ManagedUser | undefined> {
  const page = await users.list({ search: email, pageSize: 10 });
  return page.items.find((item) => item.email === email);
}
