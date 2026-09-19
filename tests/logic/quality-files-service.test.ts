// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';

import {
  createQualityService,
  INSPECTOR_ROLE,
  PRODUCTION_LEAD_ROLE,
  QUALITY_SUPERVISOR_ROLE,
  QualityError,
  type QualityActor,
  type QualityService,
} from '../../server/providers/quality.js';
import {
  createQualityFileService,
  createRepositoryStore,
  MAX_ATTACHMENT_SIZE,
  type QualityFileService,
} from '../../server/providers/quality-files.js';
import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import {
  createMemoryAttachmentStorage,
  createMemoryAttachmentStore,
  createQualityDatabase,
  type MemoryAttachmentStorage,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

const SUPERVISOR = 'user-supervisor';
const INSPECTOR_ONE = 'user-inspector-1';
const INSPECTOR_TWO = 'user-inspector-2';
const LEAD = 'user-lead-1';
const LEAD_TWO = 'user-lead-2';

const ROLES = new Map<string, readonly string[]>([
  [SUPERVISOR, [QUALITY_SUPERVISOR_ROLE]],
  [INSPECTOR_ONE, [INSPECTOR_ROLE]],
  [INSPECTOR_TWO, [INSPECTOR_ROLE]],
  [LEAD, [PRODUCTION_LEAD_ROLE]],
  [LEAD_TWO, [PRODUCTION_LEAD_ROLE]],
]);

const PRODUCT_ID = 'product-1';
const BATCH_ID = 'batch-1';

function pngFile(name = '现场照片.png', bytes = 128): File {
  return new File([new Uint8Array(bytes).fill(7)], name, {
    type: 'image/png',
  });
}

describe('quality attachment service', () => {
  let context: QualityTestDatabase;
  let quality: QualityService;
  let files: QualityFileService;
  let storage: MemoryAttachmentStorage;
  let supervisor: QualityActor;
  let inspectorOne: QualityActor;
  let inspectorTwo: QualityActor;
  let lead: QualityActor;
  let leadTwo: QualityActor;

  beforeEach(async () => {
    context = await createQualityDatabase();
    const now = new Date();
    await context.connection.query
      .insertInto('products')
      .values({
        id: PRODUCT_ID,
        code: 'P-1',
        name: 'Product',
        specification: null,
        unit: '件',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await context.connection.query
      .insertInto('productionBatches')
      .values({
        id: BATCH_ID,
        batchNo: 'B-1',
        productId: PRODUCT_ID,
        quantity: 100,
        productionLine: '一号线',
        producedAt: now,
        status: 'completed',
        createdById: SUPERVISOR,
        remark: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const directory = {
      rolesForUser: (userId: string) =>
        Promise.resolve(ROLES.get(userId) ?? []),
      listUsers: () =>
        Promise.resolve(
          [...ROLES.keys()].map((id) => ({ id, name: `名 ${id}` })),
        ),
    };
    quality = createQualityService({ database: context.database, directory });
    storage = createMemoryAttachmentStorage();
    files = createQualityFileService({
      database: context.database,
      directory,
      store: createMemoryAttachmentStore(context, storage),
      storage,
    });
    [supervisor, inspectorOne, inspectorTwo, lead, leadTwo] = await Promise.all(
      [
        quality.resolveActor(SUPERVISOR, '主管'),
        quality.resolveActor(INSPECTOR_ONE, '检验员一'),
        quality.resolveActor(INSPECTOR_TWO, '检验员二'),
        quality.resolveActor(LEAD, '负责人一'),
        quality.resolveActor(LEAD_TWO, '负责人二'),
      ],
    );
  });

  afterEach(async () => {
    await context.dispose();
  });

  async function createOpenTask(): Promise<{ taskId: string; itemId: string }> {
    const detail = await quality.createTask(supervisor, {
      batchId: BATCH_ID,
      inspectorId: INSPECTOR_ONE,
      assignedLeadId: LEAD,
      sampleSize: 5,
      items: [{ name: '外径' }],
    });
    return { taskId: detail.id, itemId: detail.items[0].id };
  }

  async function createSubmittedTask(): Promise<{
    taskId: string;
    itemId: string;
    ncId: string;
  }> {
    const { taskId, itemId } = await createOpenTask();
    await quality.recordItem(inspectorOne, taskId, itemId, {
      result: 'unqualified',
      remark: '超差',
    });
    const submitted = await quality.submitTask(inspectorOne, taskId);
    return { taskId, itemId, ncId: submitted.nonconformances[0].id };
  }

  it('lets the assigned inspector attach evidence while the task is open', async () => {
    const { itemId } = await createOpenTask();

    const view = await files.upload(
      inspectorOne,
      { targetType: 'item', targetId: itemId, category: 'item_photo' },
      pngFile(),
    );
    expect(view.filename).toBe('现场照片.png');
    expect(view.size).toBe(128);
    expect(view.uploadedById).toBe(INSPECTOR_ONE);
    expect(view.uploadedByName).toBe('名 user-inspector-1');

    const own = await files.list(inspectorOne, {
      targetType: 'item',
      targetId: itemId,
      category: 'item_photo',
    });
    expect(own.canModify).toBe(true);
    expect(own.files).toHaveLength(1);

    const supervisorList = await files.list(supervisor, {
      targetType: 'item',
      targetId: itemId,
      category: 'item_photo',
    });
    expect(supervisorList.files).toHaveLength(1);
    expect(supervisorList.canModify).toBe(false);

    await expect(
      files.list(inspectorTwo, {
        targetType: 'item',
        targetId: itemId,
        category: 'item_photo',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('makes inspection evidence read-only after submission', async () => {
    const { itemId } = await createSubmittedTask();
    await expect(
      files.upload(
        inspectorOne,
        { targetType: 'item', targetId: itemId, category: 'item_photo' },
        pngFile(),
      ),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('rejects an inspector who is not assigned to the task', async () => {
    const { itemId } = await createOpenTask();
    await expect(
      files.upload(
        inspectorTwo,
        { targetType: 'item', targetId: itemId, category: 'item_photo' },
        pngFile(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('scopes rectification evidence to the assigned production lead and status', async () => {
    const { ncId } = await createSubmittedTask();

    await expect(
      files.upload(
        leadTwo,
        {
          targetType: 'nonconformance',
          targetId: ncId,
          category: 'nc_problem',
        },
        pngFile(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const view = await files.upload(
      lead,
      { targetType: 'nonconformance', targetId: ncId, category: 'nc_problem' },
      pngFile('问题证据.png'),
    );
    expect(view.category).toBe('nc_problem');

    // Sending the rectification for review makes its evidence read-only.
    await quality.updateNonconformance(lead, ncId, {
      reason: '原因',
      measure: '措施',
      submit: true,
    });
    await expect(
      files.upload(
        lead,
        { targetType: 'nonconformance', targetId: ncId, category: 'nc_after' },
        pngFile('处理后.png'),
      ),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });

    // A returned rectification is editable again.
    await quality.reviewNonconformance(supervisor, ncId, {
      decision: 'return',
      comment: '补充证据',
    });
    await expect(
      files.upload(
        lead,
        { targetType: 'nonconformance', targetId: ncId, category: 'nc_after' },
        pngFile('处理后.png'),
      ),
    ).resolves.toMatchObject({ category: 'nc_after' });
  });

  it('denies content access to a user who cannot view the record', async () => {
    const { itemId } = await createOpenTask();
    const view = await files.upload(
      inspectorOne,
      { targetType: 'item', targetId: itemId, category: 'item_photo' },
      pngFile(),
    );

    const allowed = await files.open(supervisor, view.id);
    expect(allowed.filename).toBe('现场照片.png');
    expect(allowed.mimeType).toBe('image/png');

    await expect(files.open(inspectorTwo, view.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('removes metadata and object, and keeps groups separate', async () => {
    const { itemId } = await createOpenTask();
    const photo = await files.upload(
      inspectorOne,
      { targetType: 'item', targetId: itemId, category: 'item_photo' },
      pngFile(),
    );
    const note = await files.upload(
      inspectorOne,
      { targetType: 'item', targetId: itemId, category: 'item_note' },
      new File(['记录内容'], '记录.txt', { type: 'text/plain' }),
    );
    expect(storage.objects.size).toBe(2);

    const photos = await files.list(supervisor, {
      targetType: 'item',
      targetId: itemId,
      category: 'item_photo',
    });
    expect(photos.files.map((file) => file.id)).toEqual([photo.id]);

    const opened = await files.open(supervisor, note.id);
    expect(await streamText(opened.stream)).toBe('记录内容');

    await files.remove(inspectorOne, photo.id);
    expect(storage.objects.size).toBe(1);
    await expect(files.open(supervisor, photo.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // The unrelated group is untouched.
    const notes = await files.list(supervisor, {
      targetType: 'item',
      targetId: itemId,
      category: 'item_note',
    });
    expect(notes.files.map((file) => file.id)).toEqual([note.id]);
  });

  it('validates target, category and file size', async () => {
    const { itemId } = await createOpenTask();
    const cases: readonly [unknown, string][] = [
      [
        { targetType: 'item', targetId: itemId, category: 'nc_problem' },
        'VALIDATION',
      ],
      [
        { targetType: 'widget', targetId: itemId, category: 'item_photo' },
        'VALIDATION',
      ],
      [
        { targetType: 'item', targetId: '', category: 'item_photo' },
        'VALIDATION',
      ],
    ];
    for (const [target, code] of cases) {
      await expect(
        files.upload(
          inspectorOne,
          target as { targetType: string; targetId: string; category: string },
          pngFile(),
        ),
      ).rejects.toMatchObject({ code });
    }

    await expect(
      files.upload(
        inspectorOne,
        { targetType: 'item', targetId: itemId, category: 'item_photo' },
        new File([], 'empty.png', { type: 'image/png' }),
      ),
    ).rejects.toMatchObject({ code: 'EMPTY_FILE' });

    await expect(
      files.upload(
        inspectorOne,
        { targetType: 'item', targetId: itemId, category: 'item_photo' },
        pngFile('big.png', MAX_ATTACHMENT_SIZE + 1),
      ),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });

    // A supervisor may attach a batch factory report but not item evidence.
    await expect(
      files.upload(
        supervisor,
        {
          targetType: 'batch',
          targetId: BATCH_ID,
          category: 'batch_factory_report',
        },
        pngFile('出厂报告.png'),
      ),
    ).resolves.toMatchObject({ category: 'batch_factory_report' });
  });

  it('reports a typed error for denied access', async () => {
    const { itemId } = await createSubmittedTask();
    await expect(
      files.list(inspectorTwo, {
        targetType: 'item',
        targetId: itemId,
        category: 'item_photo',
      }),
    ).rejects.toBeInstanceOf(QualityError);
  });
});

describe('quality attachment repository store', () => {
  let context: QualityTestDatabase;

  afterEach(async () => {
    await context.dispose();
  });

  it('stores a file through the file plugin with its business columns', async () => {
    context = await createQualityDatabase();
    const objects = new Map<string, { buffer: Buffer; type: string }>();
    const disk = {
      async putStream(
        key: string,
        stream: AsyncIterable<Uint8Array>,
        options?: { contentType?: string },
      ) {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        objects.set(key, {
          buffer: Buffer.concat(chunks),
          type: options?.contentType ?? 'application/octet-stream',
        });
      },
      async getMetaData(key: string) {
        const object = objects.get(key);
        return object
          ? { contentLength: object.buffer.length, contentType: object.type }
          : {};
      },
      async exists(key: string) {
        return objects.has(key);
      },
      async delete(key: string) {
        objects.delete(key);
      },
      async getVisibility() {
        return 'private' as const;
      },
      async getUrl(key: string) {
        return `/files/${key}`;
      },
      async getSignedUrl(key: string) {
        return `/files/${key}?signed=1`;
      },
      async getStream(key: string) {
        const object = objects.get(key);
        if (!object) throw new Error('missing');
        return Readable.from(object.buffer);
      },
    };
    const manager = new ServerFileRepositoryManager(context.database, {
      // The drive manager contract names its accessor `use`.
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
      use: () => disk,
    } as never);
    const store = createRepositoryStore(manager, 'local');

    const stored = await store.upload({
      file: pngFile('报告.png', 64),
      targetType: 'item',
      targetId: 'item-1',
      category: 'item_photo',
      uploadedById: SUPERVISOR,
    });
    expect(stored.filename).toBe('报告.png');
    expect(stored.ext).toBe('png');
    expect(stored.size).toBe(64);
    expect(stored.mimeType).toBe('image/png');

    const row = await context.connection.query
      .selectFrom('qualityAttachments')
      .selectAll()
      .where('id', '=', stored.id)
      .executeTakeFirst();
    expect(row).toMatchObject({
      targetType: 'item',
      targetId: 'item-1',
      category: 'item_photo',
      uploadedById: SUPERVISOR,
      filename: '报告.png',
    });
  });
});

async function streamText(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
