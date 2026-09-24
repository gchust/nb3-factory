import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The one business table of the simplified IT ticket system. Everything the
// flow needs lives here, so no second table, comment table or history table is
// introduced.
const migration: MigrationDefinition = defineMigration({
  name: '202609010001_create_tickets',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      // 电脑 / 账号 / 其他 — stored as a stable key, translated in the client.
      collection.string('category', { length: 32, nullable: false });
      collection.text('description', { nullable: true });
      // Who submitted the ticket. The server always writes this from the session.
      collection.string('submitterId', { length: 64, nullable: false });
      // Who is handling the ticket; empty until a handler starts it.
      collection.string('handlerId', { length: 64, nullable: true });
      // 待处理 / 处理中 / 已完成 — stored as a stable key.
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('handlingNote', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('submitterId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('tickets');
  },
});

export default migration;
