// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  SEED_DISK_ENV,
  publishLocalDiskLocation,
} from '../../cli/seed-disk.js';
import sampleFilesSeed, {
  SEED_FILE_RECORDS,
} from '../../database/main/seeds/202609200011_seed_project_delivery_sample_files.js';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  delete process.env[SEED_DISK_ENV];
});

interface Insert {
  readonly table: string;
  readonly values: Record<string, unknown>;
}

/**
 * The smallest query adapter the seed's `insertMissing` helper touches. It
 * records every row so the test can assert both what was written and that a
 * second run inserts nothing.
 */
function createQuery(): { query: unknown; inserts: Insert[] } {
  const inserted = new Set<string>();
  const inserts: Insert[] = [];
  let table = '';
  let key: unknown;

  const query = {
    selectFrom(name: string) {
      table = name;
      return query;
    },
    select() {
      return query;
    },
    where(column: string, _operator: string, value: unknown) {
      if (column === 'id') key = value;
      return query;
    },
    limit() {
      return query;
    },
    async executeTakeFirst() {
      return inserted.has(`${table}#${String(key)}`) ? { id: key } : undefined;
    },
    insertInto(name: string) {
      return {
        values(values: Record<string, unknown>) {
          return {
            async execute() {
              inserts.push({ table: name, values });
              inserted.add(`${name}#${String(values.id)}`);
            },
          };
        },
      };
    },
  };

  return { query, inserts };
}

describe('seed disk location', () => {
  it('publishes the configured filesystem disk location', () => {
    delete process.env[SEED_DISK_ENV];
    publishLocalDiskLocation({ get: () => undefined } as never);
    expect(process.env[SEED_DISK_ENV]).toBeUndefined();

    publishLocalDiskLocation({
      get: () => ({ disks: { local: { driver: 's3' } } }),
    } as never);
    expect(process.env[SEED_DISK_ENV]).toBeUndefined();

    publishLocalDiskLocation({
      get: () => ({
        disks: { local: { driver: 'fs', location: '/srv/data' } },
      }),
    } as never);
    expect(process.env[SEED_DISK_ENV]).toBe('/srv/data');
    delete process.env[SEED_DISK_ENV];
  });
});

describe('sample file seed', () => {
  it('writes every sample into the published disk directory, idempotently', async () => {
    const parent = path.resolve('tests/.tmp');
    const root = mkdtempSync(path.join(parent, 'seed-files-'));
    roots.push(root);
    // The verification configuration points the disk outside the application;
    // publishing it is exactly what makes the seeded bytes readable.
    process.env[SEED_DISK_ENV] = root;

    const { query, inserts } = createQuery();
    await sampleFilesSeed.run({ query } as never);

    for (const record of SEED_FILE_RECORDS) {
      const relative = `objects/${record.id}.${record.sample.ext}`;
      const file = path.join(root, relative);
      expect(existsSync(file), `${record.sample.filename} should exist`).toBe(
        true,
      );
      expect(readFileSync(file).equals(record.sample.bytes)).toBe(true);

      const metadata = inserts.find(
        (entry) => entry.values.id === record.id && entry.values.key,
      );
      expect(metadata?.values.key).toBe(relative);
      expect(metadata?.values.disk).toBe('local');
    }

    // Every file gets a metadata row and a link row, and a second run adds
    // nothing, so a clean installation rebuilds the same demonstration set.
    expect(inserts.length).toBe(SEED_FILE_RECORDS.length * 2);
    await sampleFilesSeed.run({ query } as never);
    expect(inserts.length).toBe(SEED_FILE_RECORDS.length * 2);
  });
});
