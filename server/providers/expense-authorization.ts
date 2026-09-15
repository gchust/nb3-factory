import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  CLAIM_FIELDS,
  DEPARTMENT_FIELDS,
  RECEIPT_FIELDS,
} from './expense-service.js';

/**
 * Registers this application's database collections with Authorization and adds two extension points:
 *
 * - `expenseDepartment`: a record-access policy that limits a manager to the departments they manage. A manager
 *   with no department assigned is treated as a general approver, which is what makes a freshly assigned
 *   manager usable before an administrator has configured department ownership.
 * - `expense.operation`: a coarse gate for the status transitions, so "may update this claim" and
 *   "may approve a claim" stay separate decisions.
 */
export default class ExpenseAuthorizationProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/expense-authorization';

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return Promise.resolve();
    }
    const authorization =
      this.app.container.resolve<AppAuthorization>(authorizationToken);
    const database = this.app.container.has(databaseManagerToken)
      ? this.app.container.resolve<DatabaseManager>(databaseManagerToken)
      : undefined;

    authorization.database.collections.add({
      name: 'expenseClaims',
      title: 'Expense claims',
      actions: ['read', 'create', 'update', 'delete'],
      fields: [...CLAIM_FIELDS],
      attributes: {
        identifier: 'id',
        owner: 'applicantId',
        creator: 'applicantId',
      },
    });

    authorization.database.collections.add({
      name: 'expenseReceipts',
      title: 'Expense receipts',
      actions: ['read', 'create', 'delete'],
      fields: [...RECEIPT_FIELDS],
      attributes: {
        identifier: 'id',
        owner: 'applicantId',
        creator: 'applicantId',
      },
    });

    authorization.database.collections.add({
      name: 'expenseDepartments',
      title: 'Departments',
      actions: ['read', 'create', 'update', 'delete'],
      fields: [...DEPARTMENT_FIELDS],
      attributes: { identifier: 'id' },
    });

    authorization.database.recordAccess.add({
      key: 'expenseDepartment',
      title: 'Records in a department I manage',
      resolve: async ({ principal }) => {
        if (!database) {
          return { $and: [] };
        }
        const rows = await database
          .query()
          .selectFrom('expenseDepartments')
          .select(['id'])
          .where('managerId', '=', principal.id)
          .execute();
        const departmentIds = rows.map((row) => Number(row.id));
        if (departmentIds.length === 0) {
          // No department configured for this manager: act as a general approver.
          return { $and: [] };
        }
        return { $and: [{ departmentId: { $in: departmentIds } }] };
      },
    });

    authorization.resources.add({
      resourceType: 'expense.operation',
      async authorize(request, context) {
        const grants = await context.grants.resolve({
          principal: request.principal,
          subjects: request.subjects,
          resource: request.resource,
          action: request.action,
        });
        return grants.length > 0
          ? {
              effect: 'permit',
              reasons: grants.map((grant) => ({
                code: 'EXPENSE_OPERATION_GRANTED',
                message: `${grant.source.plugin}:${grant.source.id} allows expense operation "${request.action}"`,
                plugin: 'app',
              })),
            }
          : {
              effect: 'deny',
              reasons: [
                {
                  code: 'EXPENSE_OPERATION_DENIED',
                  message: `Expense operation "${request.action}" is not allowed`,
                  plugin: 'app',
                },
              ],
            };
      },
    });

    return Promise.resolve();
  }
}
