import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609120001_create_office_supplies',

  async up({ builder }) {
    await builder.createCollection('officeSupplies', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.integer('quantity', { nullable: false, defaultValue: 0 });
      collection.string('unit', { length: 16, nullable: false });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('code');
    });

    await builder.createCollection('supplyRequisitions', (collection) => {
      collection.increments('id');
      collection.bigInt('supplyId', { nullable: false });
      collection.datetime('requisitionedAt', { nullable: false });
      collection.string('requisitioner', { length: 64, nullable: false });
      collection.integer('quantity', { nullable: false });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.foreignKey(['supplyId'], {
        references: { collection: 'officeSupplies', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index('supplyId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('supplyRequisitions');
    await builder.dropCollection('officeSupplies');
  },
});

export default migration;
