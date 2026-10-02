import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Schema for the equipment after-sales and inspection collaboration application.
 *
 * The migration is self-contained: it never imports a live collection definition, so an already-applied
 * migration keeps meaning the same thing after the application's model evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_service_ledger',
  async up({ builder }) {
    await builder.createCollection('serviceEngineerGroups', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32, nullable: false });
      collection.string('name', { length: 191, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code', { name: 'uq_service_engineer_groups_code' });
    });

    await builder.createCollection('serviceEngineerProfiles', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection
        .belongsTo('group', 'serviceEngineerGroups')
        .foreignKey('groupId')
        .foreignKeyType('integer')
        .targetKey('id')
        .constraints(true)
        .onDelete('set null');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('userId', {
        name: 'uq_service_engineer_profiles_user',
      });
      collection.index('groupId', {
        name: 'idx_service_engineer_profiles_group',
      });
    });

    await builder.createCollection('serviceCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 191, nullable: false });
      collection.string('code', { length: 64, nullable: true });
      collection.string('level', { length: 16, nullable: true });
      collection.string('contact', { length: 191, nullable: true });
      collection.string('phone', { length: 64, nullable: true });
      collection.text('address', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.hasMany('equipment', 'serviceEquipment', {
        sourceKey: 'id',
        foreignKey: 'customerId',
      });
    });

    await builder.createCollection('serviceEquipment', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 191, nullable: false });
      collection.string('model', { length: 191, nullable: true });
      collection.string('serialNumber', { length: 128, nullable: true });
      collection.string('location', { length: 191, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'active',
      });
      collection
        .belongsTo('customer', 'serviceCustomers')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection.string('engineerId', { length: 64, nullable: true });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('nextInspectionDate', { nullable: true });
      collection.datetime('warrantyUntil', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code', { name: 'uq_service_equipment_code' });
      collection.index('customerId', {
        name: 'idx_service_equipment_customer',
      });
      collection.index('engineerId', {
        name: 'idx_service_equipment_engineer',
      });
      collection.hasMany('workOrders', 'serviceWorkOrders', {
        sourceKey: 'id',
        foreignKey: 'equipmentId',
      });
      collection.hasMany('inspections', 'serviceInspections', {
        sourceKey: 'id',
        foreignKey: 'equipmentId',
      });
      collection.hasMany('manuals', 'serviceManuals', {
        sourceKey: 'id',
        foreignKey: 'equipmentId',
      });
    });

    await builder.createCollection('serviceWorkOrders', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: true });
      collection.string('title', { length: 255, nullable: false });
      collection.string('source', {
        length: 32,
        nullable: false,
        defaultValue: 'internal',
      });
      collection.string('reporterId', { length: 64, nullable: true });
      collection
        .belongsTo('customer', 'serviceCustomers')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection
        .belongsTo('equipment', 'serviceEquipment')
        .foreignKey('equipmentId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection.text('description', { nullable: true });
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('deadline', { nullable: true });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('supervisorId', { length: 64, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending_acceptance',
      });
      collection.text('acceptanceNote', { nullable: true });
      collection.text('resolutionNote', { nullable: true });
      collection.text('returnReason', { nullable: true });
      collection.datetime('acceptedAt', { nullable: true });
      collection.datetime('startedAt', { nullable: true });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('closedAt', { nullable: true });
      // Business de-duplication key supplied by an external platform integration.
      collection.string('externalEventId', { length: 128, nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('externalEventId', {
        name: 'uq_service_work_orders_external_event',
      });
      collection.unique('code', { name: 'uq_service_work_orders_code' });
      collection.index('status', { name: 'idx_service_work_orders_status' });
      collection.index('assigneeId', {
        name: 'idx_service_work_orders_assignee',
      });
      collection.index('customerId', {
        name: 'idx_service_work_orders_customer',
      });
      collection.index('equipmentId', {
        name: 'idx_service_work_orders_equipment',
      });
      collection.hasMany('events', 'serviceWorkOrderEvents', {
        sourceKey: 'id',
        foreignKey: 'workOrderId',
      });
      collection.hasMany('shares', 'serviceWorkOrderShares', {
        sourceKey: 'id',
        foreignKey: 'workOrderId',
      });
      collection.hasMany('attachments', 'serviceAttachments', {
        sourceKey: 'id',
        foreignKey: 'workOrderId',
      });
    });

    await builder.createCollection('serviceWorkOrderEvents', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('workOrder', 'serviceWorkOrders')
        .foreignKey('workOrderId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.string('type', { length: 64, nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'succeeded',
      });
      collection.text('message', { nullable: true });
      collection.json('detail', { nullable: true });
      collection.string('actorId', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('workOrderId', {
        name: 'idx_service_work_order_events_order',
      });
    });

    await builder.createCollection('serviceWorkOrderShares', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('workOrder', 'serviceWorkOrders')
        .foreignKey('workOrderId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.string('engineerId', { length: 64, nullable: false });
      collection.string('grantedById', { length: 64, nullable: true });
      collection.datetime('revokedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('workOrderId', {
        name: 'idx_service_work_order_shares_order',
      });
      collection.index('engineerId', {
        name: 'idx_service_work_order_shares_engineer',
      });
    });

    await builder.createCollection('serviceInspections', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('equipment', 'serviceEquipment')
        .foreignKey('equipmentId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.string('code', { length: 64, nullable: true });
      collection.datetime('planDate', { nullable: false });
      collection.datetime('dueDate', { nullable: true });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('result', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['equipmentId', 'planDate'], {
        name: 'uq_service_inspections_equipment_day',
        mode: 'index',
      });
      collection.index('assigneeId', {
        name: 'idx_service_inspections_assignee',
      });
      collection.index('status', { name: 'idx_service_inspections_status' });
    });

    await builder.createCollection('serviceRepairKnowledge', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('category', { length: 64, nullable: true });
      collection.string('tags', { length: 255, nullable: true });
      collection.text('symptom', { nullable: true });
      collection.text('content', { nullable: true });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.integer('viewCount', { nullable: false, defaultValue: 0 });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('published', {
        name: 'idx_service_repair_knowledge_published',
      });
    });

    await builder.createCollection('serviceManuals', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('version', {
        length: 32,
        nullable: false,
        defaultValue: '1.0',
      });
      collection
        .belongsTo('equipment', 'serviceEquipment')
        .foreignKey('equipmentId')
        .foreignKeyType('integer')
        .targetKey('id')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.text('summary', { nullable: true });
      collection.text('content', { nullable: true });
      collection.string('driveKey', { length: 512, nullable: true });
      collection.string('filename', { length: 255, nullable: true });
      collection.boolean('published', { nullable: false, defaultValue: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('equipmentId', {
        name: 'idx_service_manuals_equipment',
      });
      collection.index('published', { name: 'idx_service_manuals_published' });
    });

    await builder.createCollection('serviceExternalEvents', (collection) => {
      collection.increments('id');
      collection.string('externalEventId', { length: 128, nullable: false });
      collection.string('source', { length: 64, nullable: true });
      collection.string('eventType', { length: 64, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'received',
      });
      collection.text('message', { nullable: true });
      collection.integer('workOrderId', { nullable: true });
      collection.json('payload', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('externalEventId', {
        name: 'uq_service_external_events_key',
      });
    });

    // Attachment metadata collection. The fixed column set is owned by the File Repository; an extra
    // nullable business link is allowed, and the primary key must accept a 36-character UUID.
    await builder.createCollection('serviceAttachments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.integer('workOrderId', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('workOrderId', {
        name: 'idx_service_attachments_order',
      });
    });
  },
  async down({ builder }) {
    // Reverse order, dependencies first.
    await builder.dropCollection('serviceAttachments');
    await builder.dropCollection('serviceExternalEvents');
    await builder.dropCollection('serviceManuals');
    await builder.dropCollection('serviceRepairKnowledge');
    await builder.dropCollection('serviceInspections');
    await builder.dropCollection('serviceWorkOrderShares');
    await builder.dropCollection('serviceWorkOrderEvents');
    await builder.dropCollection('serviceWorkOrders');
    await builder.dropCollection('serviceEquipment');
    await builder.dropCollection('serviceCustomers');
    await builder.dropCollection('serviceEngineerProfiles');
    await builder.dropCollection('serviceEngineerGroups');
  },
});

export default migration;
