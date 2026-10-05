// @vitest-environment node

// The corrective migration that adds the two acceptance columns to a database
// created from an earlier revision of `202611010001_service_schema`.
//
// It is deliberately conditional: `shouldRun` reads the physical table so the
// migration is a no-op on a fresh database (where the base migration already
// declared the columns) and only alters a stale one. Getting that condition
// backwards would either drop working columns or silently skip the repair, so
// both branches are pinned here.
//
// The DDL itself is exercised against the real database by `pnpm nocobase db
// apply`, which is how this migration was applied and verified; these cases pin
// the decision and the exact field operations it emits.
import { describe, expect, it } from 'vitest';

import type { MigrationContext } from '@nocobase/db';

import migration from '../../database/main/migrations/202611010003_service_acceptance_columns.js';

interface FieldOp {
  readonly op: 'add' | 'drop';
  readonly name: string;
  readonly length?: number;
  readonly notNull?: boolean;
  readonly defaultTo?: unknown;
}

interface FakeContextResult {
  readonly context: MigrationContext;
  readonly alterations: { name: string; fields: FieldOp[] }[];
}

function fakeContext(options: {
  hasCollection: boolean;
  hasNoteStatus: boolean;
  hasRunId: boolean;
}): FakeContextResult {
  const alterations: FakeContextResult['alterations'] = [];
  const context = {
    builder: {
      hasCollection: async () => options.hasCollection,
      alterCollection: async (
        name: string,
        callback: (collection: unknown) => void,
      ) => {
        const fields: FieldOp[] = [];
        const string = (field: string, fieldOptions?: { length?: number }) => {
          const add: FieldOp = {
            op: 'add',
            name: field,
            length: fieldOptions?.length,
          };
          const pending = {
            notNull: () => {
              add.notNull = true;
              return pending;
            },
            defaultTo: (value: unknown) => {
              add.defaultTo = value;
              return pending;
            },
          };
          fields.push(add);
          return pending;
        };
        const dropField = (field: string) => {
          fields.push({ op: 'drop', name: field });
        };
        callback({ string, dropField });
        alterations.push({ name, fields });
      },
    },
    connection: {
      client: async () => ({
        schema: {
          hasColumn: async (_table: string, column: string) =>
            column === 'accept_note_status'
              ? options.hasNoteStatus
              : options.hasRunId,
        },
      }),
    },
  } as unknown as MigrationContext;
  return { context, alterations };
}

describe('202611010003_service_acceptance_columns', () => {
  it('is a no-op where the base migration already created the columns', async () => {
    const { context } = fakeContext({
      hasCollection: true,
      hasNoteStatus: true,
      hasRunId: true,
    });
    await expect(migration.shouldRun!(context)).resolves.toBe(false);
  });

  it('runs only when the collection is missing a column', async () => {
    for (const missing of [
      { hasNoteStatus: false, hasRunId: true },
      { hasNoteStatus: true, hasRunId: false },
      { hasNoteStatus: false, hasRunId: false },
    ]) {
      const { context } = fakeContext({ hasCollection: true, ...missing });
      await expect(migration.shouldRun!(context)).resolves.toBe(true);
    }
  });

  it('never runs before the work-order collection exists', async () => {
    const { context } = fakeContext({
      hasCollection: false,
      hasNoteStatus: false,
      hasRunId: false,
    });
    await expect(migration.shouldRun!(context)).resolves.toBe(false);
  });

  it('adds both acceptance columns with the pending default', async () => {
    const { context, alterations } = fakeContext({
      hasCollection: true,
      hasNoteStatus: false,
      hasRunId: false,
    });
    await migration.up(context);
    expect(alterations).toEqual([
      {
        name: 'serviceWorkOrders',
        fields: [
          {
            op: 'add',
            name: 'acceptNoteStatus',
            length: 32,
            notNull: true,
            defaultTo: 'pending',
          },
          { op: 'add', name: 'acceptanceRunId', length: 64 },
        ],
      },
    ]);
  });

  it('drops exactly those columns on the way down', async () => {
    const { context, alterations } = fakeContext({
      hasCollection: true,
      hasNoteStatus: true,
      hasRunId: true,
    });
    await migration.down!(context);
    expect(alterations).toEqual([
      {
        name: 'serviceWorkOrders',
        fields: [
          { op: 'drop', name: 'acceptNoteStatus' },
          { op: 'drop', name: 'acceptanceRunId' },
        ],
      },
    ]);
  });
});
