import { defineMigration } from '@nocobase/db';

/**
 * Supplier compliance core schema.
 *
 * This migration is immutable history: every column, index and constraint is spelled out here and never imported
 * from a live collection definition. `down` reverses it in dependency order.
 */
export default defineMigration({
  name: '202609210001_create_compliance_core',
  async up({ builder }) {
    await builder.createCollection('procurementOrganizations', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('code', { length: 64, nullable: false });
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_procurement_org_code' });
    });

    await builder.createCollection('organizationMembers', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.integer('organizationId').nullable();
      // Procurement specialist | quality lead | legal counsel | supplier contact | administrator
      collection.string('role', { length: 32, nullable: false });
      // Only meaningful for a supplier contact; scopes the membership to one supplier.
      collection.integer('supplierId').nullable();
      collection.text('note').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('userId', { name: 'idx_org_member_user' });
      collection.index('organizationId', { name: 'idx_org_member_org' });
    });

    await builder.createCollection('suppliers', (collection) => {
      collection.increments('id');
      collection.integer('organizationId', { nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('code', { length: 64, nullable: false });
      collection.string('category', { length: 64 }).nullable();
      collection.string('contactName', { length: 255 }).nullable();
      collection.string('contactEmail', { length: 320 }).nullable();
      collection.string('contactPhone', { length: 64 }).nullable();
      // draft | pending_review | qualified | rejected | suspended
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('draft');
      collection.text('businessScope').nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.string('updatedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_supplier_code' });
      collection.index('organizationId', { name: 'idx_supplier_org' });
      collection.index('status', { name: 'idx_supplier_status' });
    });

    await builder.createCollection('supplierQualifications', (collection) => {
      collection.increments('id');
      collection.integer('supplierId', { nullable: false });
      // Denormalized so record scoping never needs a join.
      collection.integer('organizationId', { nullable: false });
      // business_license | quality_certification | environmental | safety | other
      collection.string('type', { length: 64, nullable: false });
      collection.string('certificateNo', { length: 128 }).nullable();
      collection.string('issuer', { length: 255 }).nullable();
      collection.datetime('issuedAt').nullable();
      collection.datetime('expiresAt').nullable();
      // active | expired | revoked
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('active');
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('supplierId', { name: 'idx_qualification_supplier' });
      collection.index('organizationId', { name: 'idx_qualification_org' });
      collection.index('expiresAt', { name: 'idx_qualification_expires' });
    });

    await builder.createCollection('supplierReviews', (collection) => {
      collection.increments('id');
      collection.integer('supplierId', { nullable: false });
      collection.integer('organizationId', { nullable: false });
      collection.string('reviewerId', { length: 64, nullable: false });
      collection.integer('reviewYear', { nullable: false });
      // approved | rejected
      collection.string('decision', { length: 32, nullable: false });
      // Required whenever the decision is rejected; enforced by the API.
      collection.text('reason').nullable();
      collection.text('comments').nullable();
      collection.datetime('reviewedAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('supplierId', { name: 'idx_review_supplier' });
      collection.index('reviewYear', { name: 'idx_review_year' });
    });

    await builder.createCollection('contracts', (collection) => {
      collection.increments('id');
      collection.integer('organizationId', { nullable: false });
      collection.integer('supplierId', { nullable: false });
      collection.string('contractNo', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.datetime('signedAt').nullable();
      collection.datetime('startDate').nullable();
      collection.datetime('endDate').nullable();
      collection.decimal('amount', { precision: 18, scale: 2 }).nullable();
      collection
        .string('currency', { length: 8, nullable: false })
        .defaultTo('CNY');
      // draft | active | expired | terminated
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('active');
      collection.text('legalNotes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('contractNo', { name: 'uq_contract_no' });
      collection.index('organizationId', { name: 'idx_contract_org' });
      collection.index('supplierId', { name: 'idx_contract_supplier' });
      collection.index('endDate', { name: 'idx_contract_end' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('contracts');
    await builder.dropCollection('supplierReviews');
    await builder.dropCollection('supplierQualifications');
    await builder.dropCollection('suppliers');
    await builder.dropCollection('organizationMembers');
    await builder.dropCollection('procurementOrganizations');
  },
});
