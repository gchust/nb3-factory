// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createQualityService,
  INSPECTOR_ROLE,
  PRODUCTION_LEAD_ROLE,
  QUALITY_SUPERVISOR_ROLE,
  type QualityActor,
  type QualityService,
} from '../../server/providers/quality.js';
import {
  createQualityFileService,
  type QualityFileService,
} from '../../server/providers/quality-files.js';
import {
  createMemoryAttachmentStorage,
  createMemoryAttachmentStore,
  createQualityDatabase,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

const SUPERVISOR = 'user-supervisor';
const INSPECTOR_ONE = 'user-inspector-1';
const INSPECTOR_TWO = 'user-inspector-2';
const LEAD = 'user-lead-1';
const LEAD_TWO = 'user-lead-2';
const CIVILIAN = 'user-civilian';

const ROLES = new Map<string, readonly string[]>([
  [SUPERVISOR, [QUALITY_SUPERVISOR_ROLE]],
  [INSPECTOR_ONE, [INSPECTOR_ROLE]],
  [INSPECTOR_TWO, [INSPECTOR_ROLE]],
  [LEAD, [PRODUCTION_LEAD_ROLE]],
  [LEAD_TWO, [PRODUCTION_LEAD_ROLE]],
  [CIVILIAN, []],
]);

const BATCH_ID = 'batch-1';

function pngFile(name: string): File {
  return new File([new Uint8Array(64).fill(9)], name, { type: 'image/png' });
}

function textFile(name: string, body: string): File {
  return new File([body], name, { type: 'text/plain' });
}

describe('rectification rounds and reassignment', () => {
  let context: QualityTestDatabase;
  let quality: QualityService;
  let files: QualityFileService;
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
        id: 'product-1',
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
        productId: 'product-1',
        quantity: 100,
        productionLine: null,
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
    const storage = createMemoryAttachmentStorage();
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

  async function submittedTask(): Promise<{
    taskId: string;
    itemId: string;
    ncId: string;
  }> {
    const detail = await quality.createTask(supervisor, {
      batchId: BATCH_ID,
      inspectorId: INSPECTOR_ONE,
      assignedLeadId: LEAD,
      sampleSize: 5,
      items: [{ name: '外径' }],
    });
    const itemId = detail.items[0].id;
    await quality.recordItem(inspectorOne, detail.id, itemId, {
      result: 'unqualified',
      remark: '超差',
    });
    const submitted = await quality.submitTask(inspectorOne, detail.id);
    return { taskId: detail.id, itemId, ncId: submitted.nonconformances[0].id };
  }

  it('retains every round of evidence and review, and never overwrites an earlier round', async () => {
    const { ncId } = await submittedTask();

    const firstProblem = await files.upload(
      lead,
      { targetType: 'nonconformance', targetId: ncId, category: 'nc_problem' },
      pngFile('问题证据.png'),
    );
    const firstAfter = await files.upload(
      lead,
      { targetType: 'nonconformance', targetId: ncId, category: 'nc_after' },
      textFile('第一轮说明.txt', '第一轮处理说明'),
    );
    expect(firstProblem.round).toBe(1);
    expect(firstAfter.round).toBe(1);

    await quality.updateNonconformance(lead, ncId, {
      reason: '刀具磨损',
      measure: '更换刀具',
      submit: true,
    });
    const returned = await quality.reviewNonconformance(supervisor, ncId, {
      decision: 'return',
      comment: '措施不具体，退回补充',
    });
    expect(returned.status).toBe('returned');
    expect(returned.round).toBe(2);
    expect(returned.reviews).toHaveLength(1);
    expect(returned.reviews[0]).toMatchObject({
      round: 1,
      decision: 'return',
      comment: '措施不具体，退回补充',
    });

    // New evidence is filed in the current round and does not disturb round 1.
    const secondAfter = await files.upload(
      lead,
      { targetType: 'nonconformance', targetId: ncId, category: 'nc_after' },
      textFile('第二轮说明.txt', '第二轮补充'),
    );
    expect(secondAfter.round).toBe(2);

    const roundOne = await files.list(supervisor, {
      targetType: 'nonconformance',
      targetId: ncId,
      category: 'nc_after',
      round: 1,
    });
    expect(roundOne.files.map((file) => file.id)).toEqual([firstAfter.id]);
    expect(roundOne.canModify).toBe(false);

    const roundTwo = await files.list(lead, {
      targetType: 'nonconformance',
      targetId: ncId,
      category: 'nc_after',
      round: 2,
    });
    expect(roundTwo.files.map((file) => file.id)).toEqual([secondAfter.id]);
    expect(roundTwo.canModify).toBe(true);

    // Round 1 is history: it can still be read, but not changed or removed.
    await expect(files.remove(lead, firstAfter.id)).rejects.toMatchObject({
      code: 'READ_ONLY',
    });
    const stillThere = await files.list(supervisor, {
      targetType: 'nonconformance',
      targetId: ncId,
      category: 'nc_after',
      round: 1,
    });
    expect(stillThere.files.map((file) => file.id)).toEqual([firstAfter.id]);
    expect(firstProblem.round).toBe(1);

    // Closing keeps the earlier return comment alongside the new decision.
    await quality.updateNonconformance(lead, ncId, {
      reason: '刀具磨损（补充）',
      measure: '更换刀具并说明复检方案',
      submit: true,
    });
    const closed = await quality.reviewNonconformance(supervisor, ncId, {
      decision: 'close',
      comment: '同意关闭',
    });
    expect(closed.status).toBe('closed');
    expect(closed.reviews).toHaveLength(2);
    expect(closed.reviews.map((review) => review.decision)).toEqual([
      'return',
      'close',
    ]);
    expect(closed.reviews[0].comment).toBe('措施不具体，退回补充');
    expect(closed.reviews[1].comment).toBe('同意关闭');
    expect(closed.reviews[0].round).toBe(1);
    expect(closed.reviews[1].round).toBe(2);

    // A closed rectification is read-only in the current round as well.
    await expect(
      files.upload(
        lead,
        { targetType: 'nonconformance', targetId: ncId, category: 'nc_after' },
        textFile('x.txt', 'x'),
      ),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('keeps a return comment even when the following close carries none', async () => {
    const { ncId } = await submittedTask();
    await quality.updateNonconformance(lead, ncId, {
      reason: '原因',
      measure: '措施',
      submit: true,
    });
    await quality.reviewNonconformance(supervisor, ncId, {
      decision: 'return',
      comment: '补充复检方案',
    });
    await quality.updateNonconformance(lead, ncId, {
      reason: '原因',
      measure: '措施（补充）',
      submit: true,
    });
    const closed = await quality.reviewNonconformance(supervisor, ncId, {
      decision: 'close',
    });
    expect(closed.reviewComment).toBeNull();
    expect(closed.reviews.map((review) => review.comment)).toEqual([
      '补充复检方案',
      null,
    ]);
  });

  it('drops the previous inspector from task and evidence access after reassignment', async () => {
    const detail = await quality.createTask(supervisor, {
      batchId: BATCH_ID,
      inspectorId: INSPECTOR_ONE,
      assignedLeadId: LEAD,
      sampleSize: 5,
      items: [{ name: '外径' }],
    });
    const itemId = detail.items[0].id;
    const photo = await files.upload(
      inspectorOne,
      { targetType: 'item', targetId: itemId, category: 'item_photo' },
      pngFile('现场照片.png'),
    );

    await quality.reassignTask(supervisor, detail.id, {
      inspectorId: INSPECTOR_TWO,
    });

    // The old inspector's link is denied; the new inspector and supervisor see it.
    await expect(
      quality.getTask(inspectorOne, detail.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(files.open(inspectorOne, photo.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      files.list(inspectorTwo, {
        targetType: 'item',
        targetId: itemId,
        category: 'item_photo',
      }),
    ).resolves.toMatchObject({ files: [{ id: photo.id }] });
    await expect(files.open(supervisor, photo.id)).resolves.toMatchObject({
      filename: '现场照片.png',
    });
  });

  it('drops the previous production lead from rectification access after reassignment', async () => {
    const { ncId } = await submittedTask();
    const evidence = await files.upload(
      lead,
      { targetType: 'nonconformance', targetId: ncId, category: 'nc_problem' },
      pngFile('问题证据.png'),
    );

    await quality.reassignNonconformance(supervisor, ncId, {
      assignedToId: LEAD_TWO,
    });

    await expect(quality.getNonconformance(lead, ncId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(files.open(lead, evidence.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      quality.updateNonconformance(lead, ncId, {
        reason: '原因',
        measure: '措施',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const reassigned = await quality.getNonconformance(leadTwo, ncId);
    expect(reassigned.assignedToId).toBe(LEAD_TWO);
    await expect(files.open(leadTwo, evidence.id)).resolves.toMatchObject({
      filename: '问题证据.png',
    });
    await expect(files.open(supervisor, evidence.id)).resolves.toMatchObject({
      filename: '问题证据.png',
    });
  });

  it('only lets the supervisor reassign and validates the target role', async () => {
    const { taskId, ncId } = await submittedTask();

    await expect(
      quality.reassignTask(inspectorOne, taskId, {
        inspectorId: INSPECTOR_TWO,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      quality.reassignNonconformance(lead, ncId, { assignedToId: LEAD_TWO }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      quality.reassignTask(supervisor, taskId, { inspectorId: CIVILIAN }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      quality.reassignNonconformance(supervisor, ncId, {
        assignedToId: INSPECTOR_TWO,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      quality.reassignTask(supervisor, taskId, {}),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
