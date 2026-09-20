import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Property repair and settlement schema.
 *
 * Every field, index and constraint is spelled out here on purpose: a migration is immutable history and must not
 * import a collection definition that keeps evolving. Physical names are derived from these logical camelCase names.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_property_repair_schema',

  async up({ builder }) {
    // ---- Asset registry -------------------------------------------------
    await builder.createCollection('buildings', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('address', { length: 255, nullable: true });
      collection.integer('floors', { nullable: true });
      collection.string('manager', { length: 128, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('name');
    });

    await builder.createCollection('rooms', (collection) => {
      collection.increments('id');
      collection.integer('buildingId', { nullable: false });
      collection.string('roomNumber', { length: 64, nullable: false });
      collection.integer('floor', { nullable: true });
      collection.decimal('area', { precision: 10, scale: 2, nullable: true });
      collection.string('occupant', { length: 128, nullable: true });
      collection.string('phone', { length: 32, nullable: true });
      collection.string('usageType', { length: 32, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('buildingId', {
        references: { collection: 'buildings', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.unique(['buildingId', 'roomNumber']);
      collection.index('buildingId');
    });

    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.integer('buildingId', { nullable: true });
      collection.integer('roomId', { nullable: true });
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('category', { length: 64, nullable: false });
      collection.string('brand', { length: 64, nullable: true });
      collection.string('model', { length: 64, nullable: true });
      collection.string('serialNumber', { length: 64, nullable: true });
      collection.datetime('installedAt', { nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.text('manualNote', { nullable: true });
      // File record of the equipment manual; seeded with a real PDF so it can be read online.
      collection.string('manualFileId', { length: 36, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('roomId');
      collection.index('buildingId');
      collection.index('status');
    });

    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('category', { length: 64, nullable: true });
      collection.string('unit', { length: 32, nullable: false });
      collection.decimal('unitPrice', {
        precision: 12,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.decimal('stock', {
        precision: 12,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.decimal('safetyStock', {
        precision: 12,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('name');
    });

    // ---- Repair tickets -------------------------------------------------
    await builder.createCollection('repairTickets', (collection) => {
      collection.increments('id');
      collection.string('ticketNo', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.integer('buildingId', { nullable: false });
      collection.integer('roomId', { nullable: true });
      collection.integer('equipmentId', { nullable: true });
      collection.string('location', { length: 255, nullable: false });
      collection.string('faultType', { length: 64, nullable: false });
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.text('description', { nullable: false });
      collection.string('contactName', { length: 64, nullable: false });
      collection.string('contactPhone', { length: 32, nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending_dispatch',
      });
      collection.string('reporterId', { length: 36, nullable: false });
      collection.string('reporterName', { length: 128, nullable: true });
      collection.string('assigneeId', { length: 36, nullable: true });
      collection.string('assigneeName', { length: 128, nullable: true });
      collection.datetime('assignedAt', { nullable: true });
      collection.datetime('dueAt', { nullable: true });
      collection.datetime('startedAt', { nullable: true });
      collection.datetime('finishedAt', { nullable: true });
      collection.text('faultCause', { nullable: true });
      collection.text('repairProcess', { nullable: true });
      collection.decimal('laborCost', {
        precision: 12,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.integer('reworkCount', { nullable: false, defaultValue: 0 });
      collection.text('cancelReason', { nullable: true });
      collection.string('acceptanceResult', { length: 16, nullable: true });
      collection.text('acceptanceRemark', { nullable: true });
      collection.datetime('acceptedAt', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('settledAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('ticketNo');
      collection.foreignKey('buildingId', {
        references: { collection: 'buildings', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.index('status');
      collection.index('reporterId');
      collection.index('assigneeId');
      collection.index('buildingId');
      collection.index('priority');
      collection.index('dueAt');
    });

    // ---- Ticket transition history --------------------------------------
    // Rework keeps its history here rather than overwriting the ticket: a rejected
    // ticket records the rejection and every later transition as separate rows.
    await builder.createCollection('repairTicketEvents', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('type', { length: 32, nullable: false });
      collection.string('fromStatus', { length: 32, nullable: true });
      collection.string('toStatus', { length: 32, nullable: true });
      collection.text('remark', { nullable: true });
      collection.integer('operatorId', { nullable: true });
      collection.string('operatorName', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.foreignKey('ticketId', {
        references: { collection: 'repairTickets', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index('ticketId');
      collection.index('type');
    });

    // ---- Material consumption per ticket --------------------------------
    await builder.createCollection('repairTicketMaterials', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.integer('materialId', { nullable: false });
      collection.decimal('quantity', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.decimal('unitPrice', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.decimal('cost', { precision: 12, scale: 2, nullable: false });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'consumed',
      });
      collection.string('requestedByName', { length: 128, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('returnedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('ticketId', {
        references: { collection: 'repairTickets', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey('materialId', {
        references: { collection: 'materials', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.index('ticketId');
      collection.index('materialId');
      collection.index('status');
    });

    // ---- Material stock ledger ------------------------------------------
    await builder.createCollection(
      'repairMaterialTransactions',
      (collection) => {
        collection.increments('id');
        collection.integer('materialId', { nullable: false });
        collection.string('type', { length: 16, nullable: false });
        collection.decimal('quantity', {
          precision: 12,
          scale: 2,
          nullable: false,
        });
        collection.decimal('stockAfter', {
          precision: 12,
          scale: 2,
          nullable: false,
        });
        collection.integer('ticketId', { nullable: true });
        collection.integer('ticketMaterialId', { nullable: true });
        collection.string('operatorName', { length: 128, nullable: true });
        collection.text('remark', { nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.foreignKey('materialId', {
          references: { collection: 'materials', fields: ['id'] },
          onDelete: 'restrict',
        });
        collection.index('materialId');
        collection.index('ticketId');
        collection.index('type');
      },
    );

    // ---- File repository storage (columns required by @nocobase/app-plugin-file) ----
    await builder.createCollection('repairFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      // Business metadata; nullable because an upload supplies none of it.
      collection.string('uploadedById', { length: 36, nullable: true });
      collection.string('uploadedByName', { length: 128, nullable: true });
      collection.text('note', { nullable: true });
      collection.index('uploadedById');
    });

    // ---- Attachment association -----------------------------------------
    await builder.createCollection('repairTicketFiles', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.text('note', { nullable: true });
      collection.string('createdById', { length: 36, nullable: true });
      collection.string('createdByName', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.foreignKey('ticketId', {
        references: { collection: 'repairTickets', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.unique(['ticketId', 'fileId']);
      collection.index('ticketId');
      collection.index('fileId');
      collection.index('category');
    });

    // ---- Settlement -----------------------------------------------------
    await builder.createCollection('repairSettlements', (collection) => {
      collection.increments('id');
      collection.string('settlementNo', { length: 64, nullable: false });
      collection.integer('ticketId', { nullable: false });
      collection.decimal('materialCost', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.decimal('laborCost', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.decimal('totalAmount', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'settled',
      });
      collection.string('settledById', { length: 36, nullable: false });
      collection.string('settledByName', { length: 128, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('settledAt', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      // One settlement per ticket: a duplicate settlement cannot create a second bill.
      collection.unique('ticketId');
      collection.unique('settlementNo');
      collection.foreignKey('ticketId', {
        references: { collection: 'repairTickets', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.index('settledById');
    });

    // ---- Application role membership ------------------------------------
    await builder.createCollection('repairMembers', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 36, nullable: false });
      collection.string('role', { length: 32, nullable: false });
      collection.string('displayName', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('userId');
      collection.index('role');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('repairMembers');
    await builder.dropCollection('repairSettlements');
    await builder.dropCollection('repairTicketFiles');
    await builder.dropCollection('repairFiles');
    await builder.dropCollection('repairMaterialTransactions');
    await builder.dropCollection('repairTicketMaterials');
    await builder.dropCollection('repairTicketEvents');
    await builder.dropCollection('repairTickets');
    await builder.dropCollection('materials');
    await builder.dropCollection('equipment');
    await builder.dropCollection('rooms');
    await builder.dropCollection('buildings');
  },
});

export default migration;
