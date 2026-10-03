import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010002_service_orders',
  async up({ builder }) {
    // App-owned file collection. Columns are the fixed FILE_COLUMNS contract
    // required by the file plugin's repository manager.
    await builder.createCollection('serviceFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.string('uploadedById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('serviceOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64, nullable: false }).unique({
        name: 'uq_service_orders_orderNo',
      });
      collection
        .string('externalEventNo', { length: 128, nullable: true })
        .unique({ name: 'uq_service_orders_external_event' });
      collection.string('title', { length: 191, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.integer('deviceId', { nullable: false });
      collection.text('problemDescription', { nullable: true });
      collection.enum('priority', {
        values: ['normal', 'urgent'],
        nullable: false,
        defaultValue: 'normal',
      });
      collection.enum('status', {
        values: [
          'pending_accept',
          'pending_process',
          'processing',
          'pending_confirm',
          'closed',
        ],
        nullable: false,
        defaultValue: 'pending_accept',
      });
      collection.enum('source', {
        values: ['internal', 'external'],
        nullable: false,
        defaultValue: 'internal',
      });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('deadline', { nullable: true });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.integer('assigneeProfileId', { nullable: true });
      collection.integer('groupId', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.string('reporterId', { length: 64, nullable: true });
      collection.datetime('acceptedAt', { nullable: true });
      collection.datetime('startedAt', { nullable: true });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('closedAt', { nullable: true });
      collection.text('acceptanceNote', { nullable: true });
      collection.text('resolution', { nullable: true });
      collection.text('returnReason', { nullable: true });
      collection.integer('returnCount', { nullable: false, defaultValue: 0 });
      collection.string('lastWorkflowRunId', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_service_orders_customer',
        onDelete: 'restrict',
      });
      collection.foreignKey('deviceId', {
        references: { collection: 'devices', fields: ['id'] },
        name: 'fk_service_orders_device',
        onDelete: 'restrict',
      });
      collection.foreignKey('assigneeProfileId', {
        references: { collection: 'engineerProfiles', fields: ['id'] },
        name: 'fk_service_orders_assignee_profile',
        onDelete: 'set null',
      });
      collection.index('status');
      collection.index('assigneeId');
      collection.index('priority');
    });

    await builder.createCollection('serviceOrderShares', (collection) => {
      collection.increments('id');
      collection.integer('orderId', { nullable: false });
      collection.string('sharedWithId', { length: 64, nullable: false });
      collection.string('sharedById', { length: 64, nullable: true });
      collection.string('ruleKey', { length: 191, nullable: false }).unique({
        name: 'uq_service_order_shares_rule',
      });
      collection.datetime('expiresAt', { nullable: true });
      collection.boolean('revoked', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('orderId', {
        references: { collection: 'serviceOrders', fields: ['id'] },
        name: 'fk_service_order_shares_order',
        onDelete: 'cascade',
      });
      collection.unique(['orderId', 'sharedWithId'], {
        name: 'uq_service_order_shares_pair',
      });
    });

    await builder.createCollection('serviceOrderEvents', (collection) => {
      collection.increments('id');
      collection.integer('orderId', { nullable: false });
      collection.string('action', { length: 64, nullable: false });
      collection.string('fromStatus', { length: 32, nullable: true });
      collection.string('toStatus', { length: 32, nullable: true });
      collection.string('operatorId', { length: 64, nullable: true });
      collection.string('operatorRole', { length: 32, nullable: true });
      collection.text('comment', { nullable: true });
      collection
        .string('idempotencyKey', { length: 191, nullable: true })
        .unique({
          name: 'uq_service_order_events_idempotency',
        });
      collection.datetime('createdAt', { nullable: false });
      collection.foreignKey('orderId', {
        references: { collection: 'serviceOrders', fields: ['id'] },
        name: 'fk_service_order_events_order',
        onDelete: 'cascade',
      });
      collection.index('orderId');
    });

    await builder.createCollection('serviceOrderFiles', (collection) => {
      collection.increments('id');
      collection.integer('orderId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.enum('kind', {
        values: ['photo', 'document', 'other'],
        nullable: false,
        defaultValue: 'other',
      });
      collection.string('originalName', { length: 255, nullable: true });
      collection.string('uploadedById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.foreignKey('orderId', {
        references: { collection: 'serviceOrders', fields: ['id'] },
        name: 'fk_service_order_files_order',
        onDelete: 'cascade',
      });
      collection.foreignKey('fileId', {
        references: { collection: 'serviceFiles', fields: ['id'] },
        name: 'fk_service_order_files_file',
        onDelete: 'cascade',
      });
      collection.index('orderId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('serviceOrderFiles');
    await builder.dropCollection('serviceOrderEvents');
    await builder.dropCollection('serviceOrderShares');
    await builder.dropCollection('serviceOrders');
    await builder.dropCollection('serviceFiles');
  },
});

export default migration;
