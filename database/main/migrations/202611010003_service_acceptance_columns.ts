import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Repairs the `serviceWorkOrders` acceptance columns on databases created from
 * an earlier revision of `202611010001_service_schema`.
 *
 * That migration is the schema's source of truth and already declares both
 * columns, so a database migrated from the current source never needs this.
 * It exists because the first revision was applied before `acceptNoteStatus`
 * and `acceptanceRunId` were added, and an already-recorded migration cannot be
 * replayed: `db redo` refuses to roll back the mixed batch it shares with an
 * irreversible plugin migration, and editing the recorded file changes nothing
 * on its own. `shouldRun` makes this a no-op wherever the columns are already
 * present, so it is safe on a fresh database and only touches a stale one.
 *
 * The column check reads the physical table because the Collection registry
 * exposes existence (`hasCollection`) but not per-field membership, and the
 * migration must not assume the metadata document has caught up with the table.
 * Names follow the connection's default snake_case naming; this app has only
 * ever used that strategy.
 */
interface SchemaInspectorClient {
  schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

async function acceptanceColumnsAreMissing(
  context: MigrationContext,
): Promise<boolean> {
  if (!(await context.builder.hasCollection('serviceWorkOrders'))) {
    return false;
  }
  const client = await context.connection.client<SchemaInspectorClient>();
  const hasNoteStatus = await client.schema.hasColumn(
    'service_work_orders',
    'accept_note_status',
  );
  const hasRunId = await client.schema.hasColumn(
    'service_work_orders',
    'acceptance_run_id',
  );
  return !hasNoteStatus || !hasRunId;
}

const migration: MigrationDefinition = defineMigration({
  name: '202611010003_service_acceptance_columns',
  async shouldRun(context) {
    return acceptanceColumnsAreMissing(context);
  },
  async up({ builder }) {
    await builder.alterCollection('serviceWorkOrders', (collection) => {
      collection
        .string('acceptNoteStatus', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('acceptanceRunId', { length: 64 });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('serviceWorkOrders', (collection) => {
      collection.dropField('acceptNoteStatus');
      collection.dropField('acceptanceRunId');
    });
  },
});

export default migration;
