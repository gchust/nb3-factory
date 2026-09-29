// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/20260928000001_create_crm_collections.js';
import seed from '../../database/main/seeds/20260928000002_seed_crm_sample_data.js';
import {
  createCrmTestDatabase,
  createMigratedDatabase,
  type CrmTestDatabase,
} from '../fixtures/crm-database.js';

const openDatabases: CrmTestDatabase[] = [];

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.dispose();
  }
});

describe('CRM collections migration', () => {
  it('creates the three CRM tables with their fields, keys and indexes', async () => {
    const database = await createCrmTestDatabase();
    openDatabases.push(database);
    const { manager, migrationContext } = database;
    await migration.up(migrationContext);

    const inspector = manager.connection().schemaInspector;

    const customers = await inspector.getPhysicalCollection({
      tableName: 'crm_customers',
    });
    expect(customers?.kind).toBe('table');
    expect(customers?.columns.map((column) => column.columnName)).toEqual([
      'id',
      'name',
      'industry',
      'created_at',
      'updated_at',
    ]);
    expect(
      customers?.columns.find((column) => column.columnName === 'id')
        ?.autoIncrement,
    ).toBe(true);
    expect(
      customers?.columns.find((column) => column.columnName === 'name')
        ?.nullable,
    ).toBe(false);
    expect(
      customers?.columns.find((column) => column.columnName === 'industry')
        ?.nullable,
    ).toBe(true);
    expect(customers?.indexes.map((index) => index.name)).toContain(
      'idx_crm_customers_name',
    );

    const contacts = await inspector.getPhysicalCollection({
      tableName: 'crm_contacts',
    });
    // SQLite does not report constraint names, so identify the foreign key by its column.
    const contactsForeignKey = contacts?.foreignKeys.find(
      (foreignKey) => foreignKey.columns[0] === 'customer_id',
    );
    expect(contactsForeignKey?.columns).toEqual(['customer_id']);
    expect(contactsForeignKey?.referencedCollection.tableName).toBe(
      'crm_customers',
    );
    expect(contactsForeignKey?.onDelete).toBe('cascade');
    expect(contacts?.indexes.map((index) => index.name)).toContain(
      'idx_crm_contacts_customer',
    );

    // The logical metadata keeps what the dialect does not express: SQLite stores a decimal as a float, so the
    // portable declaration is asserted on the resolved Collection rather than the physical column.
    const opportunitiesDefinition = await manager
      .collections()
      .get('crmOpportunities');
    const opportunityFields = new Map(
      (opportunitiesDefinition?.fields ?? []).map((field) => [
        field.name,
        field,
      ]),
    );
    expect(opportunityFields.get('amount')?.type).toBe('decimal');
    expect(opportunityFields.get('amount')?.nullable).toBe(false);
    expect(opportunityFields.get('amount')?.defaultValue).toBe('0');
    expect(opportunityFields.get('stage')?.values).toEqual([
      'nurturing',
      'won',
      'lost',
    ]);

    const opportunities = await inspector.getPhysicalCollection({
      tableName: 'crm_opportunities',
    });
    expect(
      opportunities?.columns.find((column) => column.columnName === 'amount')
        ?.nullable,
    ).toBe(false);
    expect(
      opportunities?.columns.find((column) => column.columnName === 'stage')
        ?.nullable,
    ).toBe(false);
    expect(
      opportunities?.foreignKeys.find(
        (foreignKey) => foreignKey.columns[0] === 'customer_id',
      )?.referencedCollection.tableName,
    ).toBe('crm_customers');
    expect(opportunities?.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        'idx_crm_opportunities_customer',
        'idx_crm_opportunities_stage',
      ]),
    );
  });

  it('reverses the schema on down', async () => {
    const database = await createMigratedDatabase();
    openDatabases.push(database);
    await migration.down?.(database.migrationContext);

    const inspector = database.manager.connection().schemaInspector;
    for (const tableName of [
      'crm_customers',
      'crm_contacts',
      'crm_opportunities',
    ]) {
      expect(
        await inspector.getPhysicalCollection({ tableName }),
      ).toBeUndefined();
    }
  });
});

describe('CRM sample data seed', () => {
  it('inserts two customers, three contacts and three opportunities', async () => {
    const database = await createMigratedDatabase();
    openDatabases.push(database);
    await seed.run(database.seedContext());

    expect(await database.manager.repository('crmCustomers').count()).toBe(2);
    expect(await database.manager.repository('crmContacts').count()).toBe(3);
    expect(await database.manager.repository('crmOpportunities').count()).toBe(
      3,
    );
  });

  it('is idempotent when it runs a second time', async () => {
    const database = await createMigratedDatabase();
    openDatabases.push(database);
    await seed.run(database.seedContext());
    await seed.run(database.seedContext());

    expect(await database.manager.repository('crmCustomers').count()).toBe(2);
    expect(await database.manager.repository('crmContacts').count()).toBe(3);
    expect(await database.manager.repository('crmOpportunities').count()).toBe(
      3,
    );
  });
});
