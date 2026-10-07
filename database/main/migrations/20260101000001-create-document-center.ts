import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Enterprise Document Center: departments, membership, documents, their
 * append-only versions, the department visibility links, backups and the
 * question log that makes a Q&A answer auditable.
 *
 * Every field, index and constraint is spelled out here rather than imported
 * from application code, because a migration is immutable history: a definition
 * that keeps evolving would silently change what an already-applied migration
 * means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260101000001-create-document-center',
  async up({ builder }) {
    await builder.createCollection('departments', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false, unique: true });
      collection.string('title', { length: 128, nullable: false });
      collection.string('description', { length: 512, nullable: true });
      collection.integer('sortOrder', { nullable: false, defaultValue: 0 });
      collection.boolean('active', { nullable: false, defaultValue: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['active', 'sortOrder']);
    });

    await builder.createCollection('departmentMembers', (collection) => {
      collection.increments('id');
      collection.integer('departmentId', { nullable: false });
      collection.string('userId', { length: 191, nullable: false });
      collection.boolean('primary', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['departmentId', 'userId']);
      collection.index(['userId']);
      collection.foreignKey('departmentId', {
        references: { collection: 'departments', fields: ['id'] },
        onDelete: 'cascade',
        name: 'departmentMembers_departmentId_fk',
      });
    });

    await builder.createCollection('documents', (collection) => {
      collection.increments('id');
      // Stable business key used by the idempotent seed and by imports. It is
      // optional so an administrator creating a document by hand never has to
      // invent one, but unique when present.
      collection.string('code', { length: 64, nullable: true, unique: true });
      collection.string('title', { length: 255, nullable: false });
      collection.string('category', {
        length: 32,
        nullable: false,
        defaultValue: 'policy',
      });
      collection.text('summary', { nullable: true });
      collection.text('content', { nullable: false });
      // draft | published
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'draft',
      });
      // departments | all
      collection.string('visibility', {
        length: 16,
        nullable: false,
        defaultValue: 'departments',
      });
      collection.integer('version', { nullable: false, defaultValue: 1 });
      collection.string('createdById', { length: 191, nullable: true });
      collection.string('updatedById', { length: 191, nullable: true });
      collection.datetime('deletedAt', { nullable: true });
      collection.string('deletedById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['status', 'deletedAt']);
      collection.index(['category']);
    });

    await builder.createCollection('documentDepartments', (collection) => {
      collection.increments('id');
      collection.integer('documentId', { nullable: false });
      collection.integer('departmentId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['documentId', 'departmentId']);
      collection.index(['departmentId']);
      collection.foreignKey('documentId', {
        references: { collection: 'documents', fields: ['id'] },
        onDelete: 'cascade',
        name: 'documentDepartments_documentId_fk',
      });
      collection.foreignKey('departmentId', {
        references: { collection: 'departments', fields: ['id'] },
        onDelete: 'cascade',
        name: 'documentDepartments_departmentId_fk',
      });
    });

    await builder.createCollection('documentVersions', (collection) => {
      collection.increments('id');
      collection.integer('documentId', { nullable: false });
      collection.integer('version', { nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.text('summary', { nullable: true });
      collection.text('content', { nullable: false });
      collection.string('visibility', {
        length: 16,
        nullable: false,
        defaultValue: 'departments',
      });
      // The department ids visible for this version, captured as JSON so a
      // restored version brings its visibility back with it.
      collection.json('departmentIds', { nullable: true });
      collection.string('changeNote', { length: 255, nullable: true });
      collection.string('createdById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['documentId', 'version']);
      collection.index(['documentId']);
      collection.foreignKey('documentId', {
        references: { collection: 'documents', fields: ['id'] },
        onDelete: 'cascade',
        name: 'documentVersions_documentId_fk',
      });
    });

    await builder.createCollection('documentBackups', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.integer('documentCount', { nullable: false, defaultValue: 0 });
      collection.integer('versionCount', { nullable: false, defaultValue: 0 });
      collection.json('snapshot', { nullable: false });
      collection.string('createdById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
    });

    await builder.createCollection('documentQuestions', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 191, nullable: true });
      collection.text('question', { nullable: false });
      collection.boolean('matched', { nullable: false, defaultValue: false });
      collection.integer('citationCount', { nullable: false, defaultValue: 0 });
      collection.json('citations', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index(['userId', 'createdAt']);
    });
  },
  async down({ builder }) {
    // Reverse dependency order: children before the tables they reference.
    await builder.dropCollection('documentQuestions');
    await builder.dropCollection('documentBackups');
    await builder.dropCollection('documentVersions');
    await builder.dropCollection('documentDepartments');
    await builder.dropCollection('documents');
    await builder.dropCollection('departmentMembers');
    await builder.dropCollection('departments');
  },
});

export default migration;
