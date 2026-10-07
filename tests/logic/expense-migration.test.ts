// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

/**
 * The reimbursement migration, applied and rolled back against a real database.
 *
 * The migration is one unit, so the whole schema is asserted here: the seven Collections, the columns the workflow
 * stores, the unique keys that keep a claim number and a department code single, and the cascades that take a claim's
 * lines and history with it. `describeMigration` also checks that Collection metadata and the tables agree after each
 * step, and that rolling back restores every table it touched.
 */
const source: MigrationSource = {
  packageName: '@nocobase/app-template-default',
  directory: fileURLToPath(
    new URL('../../database/main/migrations', import.meta.url),
  ),
};

describeMigration('202610010001_create_expense_reimbursement', {
  sources: [source],
  async up({ expectCollection }) {
    const departments = await expectCollection('expenseDepartments').toExist();
    expect(Object.keys(departments.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'code',
        'name',
        'managerId',
        'parentId',
        'sortOrder',
        'active',
      ]),
    );
    await expectCollection('expenseDepartments').toHaveIndex(['code'], {
      unique: true,
    });
    await expectCollection('expenseDepartments').toHaveIndex(['parentId']);

    const members = await expectCollection(
      'expenseDepartmentMembers',
    ).toExist();
    expect(Object.keys(members.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'departmentId',
        'userId',
        'isPrimary',
        'active',
      ]),
    );
    // One person is one member of one department.
    await expectCollection('expenseDepartmentMembers').toHaveIndex(
      ['departmentId', 'userId'],
      { unique: true },
    );
    await expectCollection('expenseDepartmentMembers').toHaveForeignKey(
      ['departmentId'],
      'expenseDepartments',
      {
        referencedFields: ['id'],
        onDelete: 'cascade',
      },
    );

    const claims = await expectCollection('expenseClaims').toExist();
    expect(Object.keys(claims.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'claimNo',
        'title',
        'applicantId',
        'applicantName',
        'departmentId',
        'departmentName',
        'status',
        'totalAmount',
        'remark',
        'submittedAt',
        'decidedAt',
        'paidAt',
        'paymentMethod',
        'paymentRemark',
      ]),
    );
    // Money is stored exactly rather than as a float, and the two names the list renders sit on the claim.
    await expectCollection('expenseClaims').toHaveField('totalAmount', {
      type: 'decimal',
      nullable: false,
    });
    await expectCollection('expenseClaims').toHaveField('status', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('expenseClaims').toHaveIndex(['claimNo'], {
      unique: true,
    });
    await expectCollection('expenseClaims').toHaveIndex(['applicantId']);
    await expectCollection('expenseClaims').toHaveIndex(['departmentId']);
    await expectCollection('expenseClaims').toHaveIndex(['status']);

    const items = await expectCollection('expenseItems').toExist();
    expect(Object.keys(items.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'claimId',
        'category',
        'amount',
        'expenseDate',
        'description',
        'invoiceId',
        'invoiceName',
        'invoiceExt',
        'invoiceType',
        'sortOrder',
      ]),
    );
    await expectCollection('expenseItems').toHaveField('amount', {
      type: 'decimal',
      nullable: false,
    });
    // Deleting a claim takes its expense lines, so no orphan survives it.
    await expectCollection('expenseItems').toHaveForeignKey(
      ['claimId'],
      'expenseClaims',
      { onDelete: 'cascade' },
    );

    const approvals = await expectCollection('expenseApprovals').toExist();
    expect(Object.keys(approvals.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'claimId',
        'action',
        'operatorId',
        'operatorName',
        'fromStatus',
        'toStatus',
        'comment',
        'createdAt',
      ]),
    );
    await expectCollection('expenseApprovals').toHaveForeignKey(
      ['claimId'],
      'expenseClaims',
      { onDelete: 'cascade' },
    );
    await expectCollection('expenseApprovals').toHaveIndex(['claimId']);

    const jobs = await expectCollection('expenseExportJobs').toExist();
    expect(Object.keys(jobs.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'requesterId',
        'status',
        'filter',
        'total',
        'processed',
        'resultFilename',
        'resultContent',
        'resultSize',
        'error',
        'startedAt',
        'finishedAt',
      ]),
    );
    await expectCollection('expenseExportJobs').toHaveIndex(['requesterId']);
    await expectCollection('expenseExportJobs').toHaveIndex(['status']);

    // The invoice Collection is the File Repository's contract, not this application's shape: the plugin writes every
    // one of these columns. Asserting them keeps a later edit from quietly breaking uploads.
    const invoices = await expectCollection('expenseInvoiceFiles').toExist();
    expect(Object.keys(invoices.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mimeType',
        'size',
        'createdAt',
        'updatedAt',
      ]),
    );
  },
  async down({ expectCollection }) {
    for (const name of [
      'expenseExportJobs',
      'expenseApprovals',
      'expenseItems',
      'expenseClaims',
      'expenseInvoiceFiles',
      'expenseDepartmentMembers',
      'expenseDepartments',
    ]) {
      await expectCollection(name).not.toExist();
    }
  },
});
