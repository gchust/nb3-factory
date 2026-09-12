import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Leave requests (请假申请).
 *
 * Every field is spelled out here so the migration stays self-contained even if the
 * server-side collection definitions evolve later. `applicantId` intentionally has no
 * foreign key: the `user` collection is owned by the Users plugin and may be created
 * after this migration runs; the application never relies on referential integrity.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_leave_requests',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('leaveRequests', (collection) => {
      collection.increments('id').primary();
      collection
        .integer('applicantId', { nullable: true })
        .index()
        .dbComment(
          'User id of the applicant; null for seeded fictional applicants.',
        );
      collection.string('applicantName', { length: 128 }).notNull();
      collection
        .string('type', { length: 32 })
        .notNull()
        .dbComment('personal | sick | annual | compensatory');
      collection.datetime('startAt', { nullable: false });
      collection.datetime('endAt', { nullable: false });
      collection
        .decimal('days', { precision: 5, scale: 1 })
        .notNull()
        .dbComment('Number of leave days, supports half-days.');
      collection.text('reason', { nullable: false });
      collection
        .string('status', { length: 32 })
        .notNull()
        .index()
        .dbComment('pending | approved | rejected');
      collection.text('approvalComment', { nullable: true });
      collection.integer('approvedById', { nullable: true });
      collection.string('approvedByName', { length: 128, nullable: true });
      collection.datetime('approvedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('leaveRequests');
  },
});

export default migration;
