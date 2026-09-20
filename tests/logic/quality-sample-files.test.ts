// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDriveManager } from '@nocobase/drive';

import rolesSeed from '../../database/main/seeds/202609190002_seed_quality_roles_and_users.js';
import sampleSeed from '../../database/main/seeds/202609190003_seed_quality_sample_data.js';
import filesSeed from '../../database/main/seeds/202609190006_seed_quality_sample_files_and_reviews.js';
import { attachmentPreviewKind } from '../../client/components/quality/lib.js';
import {
  ensureQualitySampleObjects,
  type QualitySampleObjectStorage,
} from '../../server/providers/quality-sample-objects.js';
import {
  createIdentityTables,
  createQualityDatabase,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

describe('quality sample files', () => {
  let context: QualityTestDatabase;
  let storageDir: string;
  let storage: QualitySampleObjectStorage;

  beforeEach(async () => {
    context = await createQualityDatabase();
    await createIdentityTables(context.connection);
    storageDir = mkdtempSync(path.join(tmpdir(), 'quality-files-'));
    // The real fs drive, configured like the application so the test exercises
    // the same key-to-path resolution the server uses.
    const drive = createDriveManager({
      default: 'local',
      disks: {
        local: { driver: 'fs', location: storageDir, visibility: 'private' },
      },
    });
    storage = {
      exists: async (disk, key) => await drive.use(disk).exists(key),
      put: async (disk, key, contents, contentType) => {
        await drive.use(disk).put(key, contents, { contentType });
      },
    };
    await rolesSeed.run({
      query: context.connection.query,
      connection: context.connection,
    });
    await sampleSeed.run({
      query: context.connection.query,
      connection: context.connection,
    });
  });

  afterEach(async () => {
    await context.dispose();
    rmSync(storageDir, { recursive: true, force: true });
  });

  async function runFilesSeed(): Promise<void> {
    await filesSeed.run({
      query: context.connection.query,
      connection: context.connection,
    });
  }

  it('seeds metadata only, then materializes real previewable bytes on the configured drive', async () => {
    await runFilesSeed();
    await runFilesSeed();

    const rows = await context.connection.query
      .selectFrom('qualityAttachments')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(10);

    // The seed alone writes nothing: the bytes belong on the drive the running
    // application configures, which a seed cannot reach.
    expect(readdirSync(storageDir)).toEqual([]);

    const written = await ensureQualitySampleObjects({
      database: context.database,
      storage,
    });
    expect(written).toBe(10);
    // Idempotent: an existing object is never rewritten.
    expect(
      await ensureQualitySampleObjects({
        database: context.database,
        storage,
      }),
    ).toBe(0);

    for (const row of rows) {
      const absolute = path.join(storageDir, row.key);
      const bytes = readFileSync(absolute);
      expect(statSync(absolute).size).toBe(Number(row.size));
      expect(bytes.length).toBe(Number(row.size));
    }

    const byName = new Map(rows.map((row) => [row.filename, row]));
    const image = byName.get('现场照片-轴承外径.png')!;
    const report = byName.get('测量报告-QC-20260801-001.pdf')!;
    const note = byName.get('检验记录-QC-20260801-001.txt')!;
    const binary = byName.get('原始数据-外径.dat')!;

    const png = readFileSync(path.join(storageDir, image.key));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    const pdf = readFileSync(path.join(storageDir, report.key)).toString(
      'latin1',
    );
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 3');
    expect((pdf.match(/\/Type \/Page[^s]/g) ?? []).length).toBe(3);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    expect(readFileSync(path.join(storageDir, note.key), 'utf8')).toContain(
      '不含真实个人信息',
    );

    // The seeded formats classify as previewable; the raw data file does not,
    // so the UI offers a download instead of an empty preview.
    expect(attachmentPreviewKind(image)).toBe('image');
    expect(attachmentPreviewKind(report)).toBe('pdf');
    expect(attachmentPreviewKind(note)).toBe('text');
    expect(attachmentPreviewKind(binary)).toBe('unsupported');

    // Multi-round evidence stays separated and the review history is recorded.
    const ncFive = await context.connection.query
      .selectFrom('nonconformances')
      .select(['id', 'round', 'status'])
      .where('id', '=', 'qnc000000000000000000000000005')
      .executeTakeFirstOrThrow();
    expect(ncFive.round).toBe(2);
    const roundTwo = rows.filter(
      (row) => row.targetId === ncFive.id && row.round === 2,
    );
    expect(roundTwo).toHaveLength(1);
    expect(roundTwo[0].category).toBe('nc_after');

    const reviews = await context.connection.query
      .selectFrom('nonconformanceReviews')
      .select(['nonconformanceId', 'round', 'decision'])
      .orderBy('round', 'asc')
      .execute();
    expect(reviews).toHaveLength(2);
    expect(reviews.map((review) => review.decision).sort()).toEqual([
      'close',
      'return',
    ]);
  });

  it('repairs a stale size column so the content length matches the served bytes', async () => {
    await runFilesSeed();
    await context.connection.query
      .updateTable('qualityAttachments')
      .set({ size: 1 })
      .where('filename', '=', '检验记录-QC-20260801-001.txt')
      .execute();

    await ensureQualitySampleObjects({
      database: context.database,
      storage,
    });

    const row = await context.connection.query
      .selectFrom('qualityAttachments')
      .select(['key', 'size'])
      .where('filename', '=', '检验记录-QC-20260801-001.txt')
      .executeTakeFirstOrThrow();
    expect(Number(row.size)).toBe(
      statSync(path.join(storageDir, row.key)).size,
    );
  });

  it('does nothing when the sample business data is absent', async () => {
    const empty = await createQualityDatabase();
    try {
      await createIdentityTables(empty.connection);
      await filesSeed.run({
        query: empty.connection.query,
        connection: empty.connection,
      });
      const rows = await empty.connection.query
        .selectFrom('qualityAttachments')
        .select('id')
        .execute();
      expect(rows).toHaveLength(0);
      expect(
        await ensureQualitySampleObjects({
          database: empty.database,
          storage,
        }),
      ).toBe(0);
      expect(readdirSync(storageDir)).toEqual([]);
    } finally {
      await empty.dispose();
    }
  });
});
