import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_equipment_and_templates',

  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('model', { length: 128, nullable: true });
      collection.string('location', { length: 128, nullable: true });
      collection.datetime('commissionedAt', { nullable: true });
      collection.string('status', { length: 32, nullable: false });
      collection.string('photoFileId', { length: 64, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('status');
    });

    await builder.createCollection('inspectionTemplates', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.text('description', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
    });

    await builder.createCollection('inspectionTemplateItems', (collection) => {
      collection.increments('id');
      collection.integer('templateId', { nullable: false });
      collection.integer('seq', { nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.text('standard', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('templateId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionTemplateItems');
    await builder.dropCollection('inspectionTemplates');
    await builder.dropCollection('equipment');
  },
});

export default migration;
