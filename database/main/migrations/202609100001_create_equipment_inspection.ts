import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment archive and inspection system.
 *
 * - equipment: one archive record per physical device.
 * - equipmentMainImages: main image of a device, at most one per equipment
 *   (one-to-one; enforced by the unique equipmentId constraint).
 * - equipmentDocuments: manuals / certificates / acceptance sheets, many per
 *   equipment (one-to-many).
 * - inspectionRecords: one inspection per row, many per equipment (one-to-many).
 * - inspectionPhotos: scene photos uploaded with an inspection record, many per
 *   record (one-to-many).
 *
 * The three file collections follow the fixed file-column contract of
 * @nocobase/app-plugin-file: upload generates the id/key/filename/ext/mimeType/
 * size/timestamps and accepts no business values, so the linking column must be
 * nullable. Business relations are saved when the equipment / inspection form is
 * submitted, separately from upload.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_equipment_inspection',

  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('deviceNo', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('location', { length: 255, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.string('owner', { length: 128, nullable: true });
      collection.text('remark').nullable();
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('deviceNo');
      collection.index('status');
    });

    await builder.createCollection('equipmentMainImages', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.bigInt('equipmentId').nullable();
      // At most one main image per equipment.
      collection.unique('equipmentId');
    });

    await builder.createCollection('equipmentDocuments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.bigInt('equipmentId').nullable();
      collection.index('equipmentId');
    });

    await builder.createCollection('inspectionRecords', (collection) => {
      collection.increments('id');
      collection.bigInt('equipmentId').notNull();
      collection.datetime('inspectedAt').notNull();
      collection.string('inspector', { length: 128, nullable: false });
      collection.string('conclusion', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('equipmentId', {
        references: { collection: 'equipment', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index('equipmentId');
    });

    await builder.createCollection('inspectionPhotos', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.bigInt('inspectionRecordId').nullable();
      collection.index('inspectionRecordId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionPhotos');
    await builder.dropCollection('inspectionRecords');
    await builder.dropCollection('equipmentDocuments');
    await builder.dropCollection('equipmentMainImages');
    await builder.dropCollection('equipment');
  },
});

export default migration;
