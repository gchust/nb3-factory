import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010003_service_inspections',
  async up({ builder }) {
    await builder.createCollection('inspections', (collection) => {
      collection.increments('id');
      collection.integer('deviceId', { nullable: false });
      collection.date('planDate', { nullable: false });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.integer('assigneeProfileId', { nullable: true });
      collection.enum('status', {
        values: ['pending', 'completed'],
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('result', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection
        .string('idempotencyKey', { length: 191, nullable: true })
        .unique({
          name: 'uq_inspections_idempotency',
        });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('deviceId', {
        references: { collection: 'devices', fields: ['id'] },
        name: 'fk_inspections_device',
        onDelete: 'cascade',
      });
      collection.foreignKey('assigneeProfileId', {
        references: { collection: 'engineerProfiles', fields: ['id'] },
        name: 'fk_inspections_assignee_profile',
        onDelete: 'set null',
      });
      collection.unique(['deviceId', 'planDate'], {
        name: 'uq_inspections_device_plan',
      });
      collection.index('status');
      collection.index('planDate');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('inspections');
  },
});

export default migration;
