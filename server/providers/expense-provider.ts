import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { ExpenseService, expenseServiceToken } from './expense-service.js';

/**
 * Owns the expense service. The service is registered here instead of being constructed inside a route so tests can
 * substitute it through the same token the routes resolve.
 */
export default class ExpenseProvider extends ServiceProvider<Application> {
  public readonly name = 'app/expense';

  public override register(): void {
    this.app.container.singleton(expenseServiceToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      const authorization = container.has(authorizationToken)
        ? container.resolve(authorizationToken)
        : undefined;
      return new ExpenseService({ database, authorization });
    });
  }
}
