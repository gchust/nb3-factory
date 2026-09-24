import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Business table for the simplified service-request (受理) flow.
 *
 * `assigneeId` points at the Authentication plugin's `user` collection, whose
 * primary key is a 64-character string. `status` carries the acceptance state
 * (`pending` -> `processing` -> `accepted_normal` / `accepted_urgent`) and
 * `result` records the normal/urgent outcome the Workflow produced.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610100001_create_service_requests',

  async up({ builder }) {
    await builder.createCollection('serviceRequests', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.boolean('urgent', { nullable: false, defaultValue: false });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.string('result', { length: 32, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('assigneeId', {
        references: { collection: 'user', fields: ['id'] },
        name: 'fk_service_requests_assignee',
      });
      collection.index('status');
      collection.index('assigneeId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceRequests');
  },
});

export default migration;
