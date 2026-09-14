import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Production reporting and quality tables.
 *
 * Self-contained by design: every field, index and default is spelled out here so an already-applied
 * migration keeps its meaning even when application code evolves. Do not import runtime definitions.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_production_quality_tables',

  async up({ builder }) {
    await builder.createCollection('products', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 255 }).notNull();
      collection.string('specification', { length: 255 }).nullable();
      collection.string('unit', { length: 32 }).notNull().defaultTo('件');
      collection
        .decimal('standardMinutes', { precision: 10, scale: 2 })
        .notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('teams', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('workOrders', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.integer('productId').notNull();
      collection.integer('plannedQuantity').notNull();
      collection.date('plannedStartDate').nullable();
      collection.date('plannedEndDate').nullable();
      collection.integer('teamId').notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('createdById', { length: 64 }).nullable();
      collection.string('createdByName', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('teamId');
      collection.index('productId');
      collection.index('status');
    });

    await builder.createCollection('workOrderProcesses', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId').notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.integer('sequence').notNull();
      collection.integer('plannedQuantity').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('workOrderId');
    });

    await builder.createCollection('workReports', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId').notNull();
      collection.integer('processId').notNull();
      collection.integer('quantity').notNull();
      collection.integer('qualifiedQuantity').notNull();
      collection.integer('defectQuantity').notNull();
      collection.decimal('hours', { precision: 10, scale: 1 }).notNull();
      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('reporterName', { length: 255 }).nullable();
      collection.datetime('reportedAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('workOrderId');
      collection.index('processId');
    });

    await builder.createCollection('defectRecords', (collection) => {
      collection.increments('id');
      collection.integer('workReportId').notNull();
      collection.integer('workOrderId').notNull();
      collection.integer('processId').notNull();
      collection.integer('quantity').notNull();
      collection.string('reason', { length: 32 }).notNull();
      collection.string('disposition', { length: 32 }).notNull();
      collection.string('recordedById', { length: 64 }).nullable();
      collection.string('recordedByName', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('workReportId');
      collection.index('workOrderId');
      collection.index('processId');
    });

    await builder.createCollection('staffProfiles', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull().unique();
      collection.string('role', { length: 32 }).notNull();
      collection.integer('teamId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('teamId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('defectRecords');
    await builder.dropCollection('workReports');
    await builder.dropCollection('workOrderProcesses');
    await builder.dropCollection('workOrders');
    await builder.dropCollection('staffProfiles');
    await builder.dropCollection('products');
    await builder.dropCollection('teams');
  },
});

export default migration;
