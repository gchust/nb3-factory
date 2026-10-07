import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

import { DatabaseExpenseStore } from './store.js';
import { ExpenseService } from './service.js';

/**
 * The application's handle on the reimbursement workflow.
 *
 * The token is declared beside the service so a consumer imports one thing; creating it anywhere else would produce a
 * second key that resolves nothing.
 */
export const expenseServiceToken = createServiceToken<ExpenseService>(
  '@app/expense-service',
);

/**
 * Builds the workflow from the default database connection when the application starts.
 *
 * The database is reached through `databaseManagerToken` rather than a module-level import so the service can be
 * resolved, and a test can substitute its own store, before any connection exists.
 */
export class ExpenseProvider extends ServiceProvider<Application> {
  readonly name = '@app/expense';

  register(): void {
    this.app.container.singleton(expenseServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new ExpenseService(new DatabaseExpenseStore(database));
    });
  }

  async start(): Promise<void> {
    // A job left `pending` or `running` by a restart is finished here, so the requester's page stops showing progress
    // that will never advance.
    const service = this.app.container.resolve(expenseServiceToken);
    const resumed = await service.resumePendingExports();
    if (resumed > 0) {
      console.info(`Resumed ${resumed} unfinished expense export job(s)`);
    }
  }
}
