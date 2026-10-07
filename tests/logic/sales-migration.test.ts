// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';

/**
 * The sales schema, checked against a real database: the migration creates the three Collections with the fields,
 * indexes and foreign keys the application relies on, and rolling it back leaves no trace of them.
 *
 * The source is the application's own migrations directory, so this is the file that runs on install, not a copy of
 * it. It is the only migration in that directory, so nothing runs before it.
 */
const migrationsDirectory = fileURLToPath(
  new URL('../../database/main/migrations', import.meta.url),
);

describeMigration('202601010001_create_sales_collections', {
  sources: [{ packageName: 'nb3-factory', directory: migrationsDirectory }],

  async up({ expectCollection }) {
    const customers = expectCollection('customers');
    await customers.toExist();
    await customers.toHaveField('id', { type: 'integer', nullable: false });
    await customers.toHaveField('name', {
      type: 'string',
      nullable: false,
      length: 128,
    });
    await customers.toHaveField('industry', {
      type: 'string',
      nullable: true,
      length: 128,
    });
    await customers.toHaveIndex(['name'], { unique: true });

    const contacts = expectCollection('contacts');
    await contacts.toExist();
    await contacts.toHaveField('name', {
      type: 'string',
      nullable: false,
      length: 128,
    });
    await contacts.toHaveField('contactInfo', {
      type: 'string',
      nullable: true,
      length: 256,
    });
    await contacts.toHaveField('customerId', {
      type: 'integer',
      nullable: false,
    });
    await contacts.toHaveIndex(['customerId'], { unique: false });
    await contacts.toHaveForeignKey(['customerId'], 'customers', {
      referencedFields: ['id'],
      onDelete: 'cascade',
    });

    const opportunities = expectCollection('opportunities');
    await opportunities.toExist();
    await opportunities.toHaveField('name', {
      type: 'string',
      nullable: true,
      length: 128,
    });
    await opportunities.toHaveField('customerId', {
      type: 'integer',
      nullable: false,
    });
    // The precision and scale are dialect-specific in the snapshot, so only the nullability of the amount is pinned.
    await opportunities.toHaveField('amount', { nullable: true });
    await opportunities.toHaveField('stage', { nullable: false });
    await opportunities.toHaveIndex(['customerId'], { unique: false });
    await opportunities.toHaveIndex(['stage'], { unique: false });
    await opportunities.toHaveForeignKey(['customerId'], 'customers', {
      referencedFields: ['id'],
      onDelete: 'cascade',
    });
  },

  async down({ expectCollection }) {
    // Children first, because their foreign keys depend on the customer table.
    await expectCollection('opportunities').not.toExist();
    await expectCollection('contacts').not.toExist();
    await expectCollection('customers').not.toExist();
  },
});
