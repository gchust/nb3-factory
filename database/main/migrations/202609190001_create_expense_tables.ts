import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Employee expense reimbursement schema.
 *
 * Self-contained by design: every table, column, index and constraint is spelled out here so the meaning of this
 * already-applied migration cannot change when runtime code evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_expense_tables',

  async up({ builder }) {
    await builder.createCollection('expenseDepartments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('code', { length: 32 }).notNull();
      collection.string('name', { length: 128 }).notNull();
      collection.integer('sort').notNull().defaultTo(0);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_expense_departments' });
      collection.unique('code', { name: 'uq_expense_departments_code' });
    });

    await builder.createCollection('expenseCategories', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('code', { length: 32 }).notNull();
      collection.string('name', { length: 128 }).notNull();
      collection.integer('sort').notNull().defaultTo(0);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_expense_categories' });
      collection.unique('code', { name: 'uq_expense_categories_code' });
    });

    await builder.createCollection('expenseEmployees', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('role', { length: 32 }).notNull();
      collection.string('departmentId', { length: 64 }).nullable();
      collection.string('managerUserId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_expense_employees' });
      collection.unique('userId', { name: 'uq_expense_employees_user' });
      collection.index('role', { name: 'idx_expense_employees_role' });
      collection.index('departmentId', {
        name: 'idx_expense_employees_department',
      });
    });

    await builder.createCollection('expenseReports', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('number', { length: 64 }).notNull();
      collection.string('employeeId', { length: 64 }).notNull();
      collection.string('departmentId', { length: 64 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection
        .decimal('totalAmount', { precision: 14, scale: 2 })
        .notNull()
        .defaultTo(0);
      collection.text('purpose').nullable();
      collection.datetime('submittedAt').nullable();
      collection.datetime('decidedAt').nullable();
      collection.datetime('paidAt').nullable();
      collection.string('decidedBy', { length: 64 }).nullable();
      collection.text('decisionComment').nullable();
      collection.string('paidBy', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_expense_reports' });
      collection.unique('number', { name: 'uq_expense_reports_number' });
      collection.index('employeeId', { name: 'idx_expense_reports_employee' });
      collection.index('departmentId', {
        name: 'idx_expense_reports_department',
      });
      collection.index('status', { name: 'idx_expense_reports_status' });
    });

    await builder.createCollection('expenseItems', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.string('categoryId', { length: 64 }).notNull();
      collection.datetime('expenseDate').notNull();
      collection.decimal('amount', { precision: 14, scale: 2 }).notNull();
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_items' });
      collection.index('reportId', { name: 'idx_expense_items_report' });
      collection.index('categoryId', { name: 'idx_expense_items_category' });
    });

    // One payment row per report is the database-level guard against double posting a payment.
    await builder.createCollection('expensePayments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.decimal('amount', { precision: 14, scale: 2 }).notNull();
      collection.string('paidBy', { length: 64 }).notNull();
      collection.datetime('paidAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_payments' });
      collection.unique('reportId', { name: 'uq_expense_payments_report' });
    });

    await builder.createCollection('expenseActions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.string('action', { length: 32 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.string('actorName', { length: 255 }).nullable();
      collection.string('fromStatus', { length: 32 }).nullable();
      collection.string('toStatus', { length: 32 }).nullable();
      collection.text('comment').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_actions' });
      collection.index('reportId', { name: 'idx_expense_actions_report' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('expenseActions');
    await builder.dropCollection('expensePayments');
    await builder.dropCollection('expenseItems');
    await builder.dropCollection('expenseReports');
    await builder.dropCollection('expenseEmployees');
    await builder.dropCollection('expenseCategories');
    await builder.dropCollection('expenseDepartments');
  },
});

export default migration;
