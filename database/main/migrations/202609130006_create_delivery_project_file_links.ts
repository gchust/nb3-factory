import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Links an uploaded file to the project that owns it. Kept separate from the
// file metadata table because uploads carry no business values.
const migration: MigrationDefinition = defineMigration({
  name: '202609130006_create_delivery_project_file_links',

  async up({ builder }) {
    await builder.createCollection('deliveryProjectFileLinks', (collection) => {
      collection.increments('id');
      collection.integer('projectId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.string('createdAt', { length: 32, nullable: false });
      collection.unique(['projectId', 'fileId']);
      collection.index('projectId');
      collection.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryProjectFileLinks');
  },
});

export default migration;
