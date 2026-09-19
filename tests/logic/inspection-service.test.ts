import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  InspectionService,
  REPAIR_CLOSED,
  REPAIR_PROCESSING,
  REPAIR_REVIEW,
  REPAIR_RETURNED,
  TASK_SUBMITTED,
  type Actor,
} from '../../server/providers/inspection-service.js';

const INSPECTOR_1 = 'inspector-1';
const INSPECTOR_2 = 'inspector-2';
const REPAIRER_1 = 'repairer-1';
const REPAIRER_2 = 'repairer-2';
const MANAGER = 'manager-1';

const inspector1: Actor = {
  userId: INSPECTOR_1,
  roles: new Set(['inspector']),
};
const inspector2: Actor = {
  userId: INSPECTOR_2,
  roles: new Set(['inspector']),
};
const repairer1: Actor = { userId: REPAIRER_1, roles: new Set(['repairer']) };
const repairer2: Actor = { userId: REPAIRER_2, roles: new Set(['repairer']) };
const manager: Actor = {
  userId: MANAGER,
  roles: new Set(['equipment-manager']),
};
const administrator: Actor = {
  userId: 'admin-1',
  roles: new Set(['system-administrator']),
};

describe('inspection service', () => {
  let database: DatabaseManager;
  let service: InspectionService;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await migrateApp(database);
    service = new InspectionService(database);
    await seedFixture(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('rejects a submit while a check item is unanswered', async () => {
    const task = await service.createTask(manager, {
      equipmentId: 1,
      templateId: 1,
      assigneeId: INSPECTOR_1,
      plannedDate: '2026-09-19T01:00:00.000Z',
    });
    const detail = await service.getTask(inspector1, task.id);
    await expect(service.submitTask(inspector1, task.id)).rejects.toMatchObject(
      {
        code: 'VALIDATION',
      },
    );
    // Answer only the first of three items.
    await service.saveTaskResults(inspector1, task.id, [
      { resultId: detail.results[0]?.id, result: 'normal' },
    ]);
    await expect(service.submitTask(inspector1, task.id)).rejects.toMatchObject(
      {
        code: 'VALIDATION',
      },
    );
  });

  it('rejects an abnormal item without a remark', async () => {
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    await service.saveTaskResults(
      inspector1,
      task.id,
      detail.results.map((item, index) => ({
        resultId: item.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: '',
      })),
    );
    await expect(service.submitTask(inspector1, task.id)).rejects.toMatchObject(
      {
        code: 'VALIDATION',
      },
    );
  });

  it('creates exactly one repair order per abnormal item and refuses a second submit', async () => {
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    await service.saveTaskResults(
      inspector1,
      task.id,
      detail.results.map((item, index) => ({
        resultId: item.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: index === 0 ? '油位偏低。' : '',
      })),
    );
    await expect(service.submitTask(inspector1, task.id)).resolves.toEqual({
      repairOrders: 1,
    });
    const orders = await service.listRepairs(manager);
    expect(orders).toHaveLength(1);

    // A repeated submit must not create a duplicate.
    await expect(service.submitTask(inspector1, task.id)).rejects.toMatchObject(
      {
        code: 'CONFLICT',
      },
    );
    expect(await service.listRepairs(manager)).toHaveLength(1);
  });

  it('hands a new repair order to the least busy eligible repairer', async () => {
    const order = await createRepairOrderFromInspector1({
      defaultAssigneeIds: [REPAIRER_1, REPAIRER_2],
    });
    // Equal starting load: the deterministic tie-break picks the first id, and
    // that repairer can act without any manager assignment step.
    expect(order.assigneeId).toBe(REPAIRER_1);
    await expect(
      service.startRepair(repairer1, order.id),
    ).resolves.toBeUndefined();

    // The next anomaly avoids the now-busier repairer.
    const second = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, second.id);
    await service.saveTaskResults(
      inspector1,
      second.id,
      detail.results.map((item, index) => ({
        resultId: item.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: index === 0 ? '异常说明。' : '',
      })),
    );
    await service.submitTask(inspector1, second.id, {
      defaultAssigneeIds: [REPAIRER_1, REPAIRER_2],
    });
    const orders = await service.listRepairs(manager);
    expect(orders).toHaveLength(2);
    expect(orders[0]?.id).not.toBe(order.id);
    expect(orders[0]?.assigneeId).toBe(REPAIRER_2);
  });

  it('does not let an inspector open or fill another inspector task', async () => {
    const task = await createTaskAssignedToInspector1();
    await expect(service.getTask(inspector2, task.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      service.saveTaskResults(inspector2, task.id, []),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.submitTask(inspector2, task.id)).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
  });

  it('keeps each inspector list scoped to their own tasks', async () => {
    await createTaskAssignedToInspector1();
    await service.createTask(manager, {
      equipmentId: 2,
      templateId: 1,
      assigneeId: INSPECTOR_2,
      plannedDate: '2026-09-20T01:00:00.000Z',
    });
    const first = await service.listTasks(inspector1);
    const second = await service.listTasks(inspector2);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.assigneeId).toBe(INSPECTOR_1);
    expect(second[0]?.assigneeId).toBe(INSPECTOR_2);
    expect(await service.listTasks(manager)).toHaveLength(2);
  });

  it('does not let a repairer act on an unassigned or someone else work order', async () => {
    const order = await createRepairOrderFromInspector1();
    // Unassigned: even the intended repairer cannot touch it yet.
    await expect(
      service.startRepair(repairer1, order.id),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await service.assignRepair(manager, order.id, REPAIRER_1);
    await expect(
      service.startRepair(repairer2, order.id),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.getRepair(repairer2, order.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('does not let a repairer review their own work order', async () => {
    const order = await createRepairOrderFromInspector1();
    await service.assignRepair(manager, order.id, REPAIRER_1);
    await service.startRepair(repairer1, order.id);
    await service.addRepairRecord(repairer1, order.id, '已处理。');
    await service.submitRepairReview(repairer1, order.id);

    await expect(
      service.reviewRepair(repairer1, order.id, 'close', ''),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.reviewRepair(repairer1, order.id, 'return', '不合适'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await service.getRepair(manager, order.id)).status).toBe(
      REPAIR_REVIEW,
    );
  });

  it('lets a manager close or return a work order under review', async () => {
    const order = await createRepairOrderFromInspector1();
    await service.assignRepair(manager, order.id, REPAIRER_1);
    await service.startRepair(repairer1, order.id);
    await service.addRepairRecord(repairer1, order.id, '已处理。');
    await service.submitRepairReview(repairer1, order.id);
    await service.reviewRepair(manager, order.id, 'return', '请补充检测数据。');
    expect((await service.getRepair(manager, order.id)).status).toBe(
      REPAIR_RETURNED,
    );

    // A returned order is editable again by its repairer.
    await service.addRepairRecord(repairer1, order.id, '补充振动检测。');
    await service.startRepair(repairer1, order.id);
    expect((await service.getRepair(manager, order.id)).status).toBe(
      REPAIR_PROCESSING,
    );
    await service.submitRepairReview(repairer1, order.id);
    await service.reviewRepair(manager, order.id, 'close', '');
    expect((await service.getRepair(manager, order.id)).status).toBe(
      REPAIR_CLOSED,
    );
  });

  it('makes repair attachments read-only once review is submitted and closed', async () => {
    const order = await createRepairOrderFromInspector1();
    await service.assignRepair(manager, order.id, REPAIRER_1);
    await service.addRepairFiles(
      repairer1,
      order.id,
      'before',
      [fileInput()],
      null,
    );
    await service.startRepair(repairer1, order.id);
    await service.addRepairRecord(repairer1, order.id, '已处理。');
    await service.addRepairFiles(
      repairer1,
      order.id,
      'after',
      [fileInput()],
      null,
    );
    await service.submitRepairReview(repairer1, order.id);

    await expect(
      service.addRepairFiles(repairer1, order.id, 'after', [fileInput()], null),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const detail = await service.getRepair(manager, order.id);
    expect(detail.beforeFiles).toHaveLength(1);
    expect(detail.afterFiles).toHaveLength(1);
  });

  it('makes inspection attachments read-only after the task is submitted', async () => {
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    const first = detail.results[0];
    if (!first) throw new Error('missing result');
    await service.addInspectionFiles(
      inspector1,
      task.id,
      first.id,
      [fileInput()],
      '现场照片',
    );
    let view = await service.getTask(inspector1, task.id);
    expect(view.results[0]?.attachments).toHaveLength(1);

    await service.saveTaskResults(
      inspector1,
      task.id,
      detail.results.map((item) => ({ resultId: item.id, result: 'normal' })),
    );
    await service.submitTask(inspector1, task.id);
    view = await service.getTask(inspector1, task.id);
    expect(view.status).toBe(TASK_SUBMITTED);
    await expect(
      service.addInspectionFiles(
        inspector1,
        task.id,
        first.id,
        [fileInput()],
        null,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      service.removeInspectionAttachment(
        inspector1,
        view.results[0]?.attachments[0]?.id ?? 0,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('scopes file access to the task owner', async () => {
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    const first = detail.results[0];
    if (!first) throw new Error('missing result');
    await service.addInspectionFiles(
      inspector1,
      task.id,
      first.id,
      [fileInput('file-1')],
      null,
    );

    await expect(service.canAccessFile(inspector1, 'file-1')).resolves.toBe(
      true,
    );
    await expect(service.canAccessFile(inspector2, 'file-1')).resolves.toBe(
      false,
    );
    await expect(service.canAccessFile(repairer1, 'file-1')).resolves.toBe(
      false,
    );
    await expect(service.canAccessFile(manager, 'file-1')).resolves.toBe(true);
    await expect(service.canAccessFile(administrator, 'file-1')).resolves.toBe(
      true,
    );
  });

  it('keeps the two inspections of one equipment and their photos apart', async () => {
    // The same equipment inspected twice: two tasks, two independent sets of
    // check items, and no shared attachment rows.
    const firstTask = await createTaskAssignedToInspector1();
    const secondTask = await service.createTask(manager, {
      equipmentId: 1,
      templateId: 1,
      assigneeId: INSPECTOR_1,
      plannedDate: '2026-09-25T01:00:00.000Z',
    });
    const firstDetail = await service.getTask(inspector1, firstTask.id);
    const secondDetail = await service.getTask(inspector1, secondTask.id);
    const firstItem = firstDetail.results[0];
    const secondItem = secondDetail.results[0];
    if (!firstItem || !secondItem) throw new Error('missing result');

    // Same filename, different stored files: each attachment carries its own
    // fileId and therefore its own stored object.
    await service.addInspectionFiles(
      inspector1,
      firstTask.id,
      firstItem.id,
      [fileInput('file-first')],
      '第一次巡检',
    );
    await service.addInspectionFiles(
      inspector1,
      secondTask.id,
      secondItem.id,
      [fileInput('file-second')],
      '第二次巡检',
    );

    let firstView = await service.getTask(inspector1, firstTask.id);
    let secondView = await service.getTask(inspector1, secondTask.id);
    expect(firstView.results[0]?.attachments).toHaveLength(1);
    expect(secondView.results[0]?.attachments).toHaveLength(1);
    expect(firstView.results[0]?.attachments[0]?.fileId).toBe('file-first');
    expect(secondView.results[0]?.attachments[0]?.fileId).toBe('file-second');

    // Removing an attachment from one inspection leaves the other untouched.
    await service.removeInspectionAttachment(
      inspector1,
      firstView.results[0]?.attachments[0]?.id ?? 0,
    );
    firstView = await service.getTask(inspector1, firstTask.id);
    secondView = await service.getTask(inspector1, secondTask.id);
    expect(firstView.results[0]?.attachments).toHaveLength(0);
    expect(secondView.results[0]?.attachments).toHaveLength(1);
    await expect(
      service.canAccessFile(inspector1, 'file-second'),
    ).resolves.toBe(true);
  });

  it('shows the source evidence on the repair order and only to its repairer', async () => {
    // Attach the inspector's site photo to the abnormal item before submitting,
    // then raise the work order from that item.
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    const item = detail.results[0];
    if (!item) throw new Error('missing result');
    await service.addInspectionFiles(
      inspector1,
      task.id,
      item.id,
      [fileInput('site-photo')],
      '现场照片',
    );
    await service.saveTaskResults(
      inspector1,
      task.id,
      detail.results.map((entry, index) => ({
        resultId: entry.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: index === 0 ? '轴承温度过高。' : '',
      })),
    );
    await service.submitTask(inspector1, task.id, {
      defaultAssigneeIds: [REPAIRER_1, REPAIRER_2],
    });
    const [order] = await service.listRepairs(manager);
    if (!order) throw new Error('missing repair order');
    expect(order.sourceResultId).toBe(item.id);

    expect(
      (await service.getRepair(manager, order.id)).sourceFiles,
    ).toHaveLength(1);

    // The assigned repairer sees the evidence; another repairer and another
    // inspector do not, even with the fileId.
    expect(order.assigneeId).toBe(REPAIRER_1);
    await expect(service.canAccessFile(repairer1, 'site-photo')).resolves.toBe(
      true,
    );
    await expect(service.canAccessFile(repairer2, 'site-photo')).resolves.toBe(
      false,
    );
    await expect(service.canAccessFile(inspector2, 'site-photo')).resolves.toBe(
      false,
    );
    await expect(service.canAccessFile(manager, 'site-photo')).resolves.toBe(
      true,
    );
  });

  it('follows work order status for records and files, and keeps viewing open', async () => {
    const order = await createRepairOrderFromInspector1();
    await service.assignRepair(manager, order.id, REPAIRER_1);

    // Returned keeps the repairer able to edit both records and files.
    await service.startRepair(repairer1, order.id);
    await service.addRepairRecord(repairer1, order.id, '已处理。');
    await service.addRepairFiles(
      repairer1,
      order.id,
      'after',
      [fileInput('after-1')],
      null,
    );
    await service.submitRepairReview(repairer1, order.id);
    await service.reviewRepair(manager, order.id, 'return', '请补充数据。');
    await service.addRepairRecord(repairer1, order.id, '补充检测。');
    await service.addRepairFiles(
      repairer1,
      order.id,
      'after',
      [fileInput('after-2')],
      null,
    );

    // Submitting for review flips both to read-only immediately.
    await service.startRepair(repairer1, order.id);
    await service.submitRepairReview(repairer1, order.id);
    await expect(
      service.addRepairRecord(repairer1, order.id, '复核后再补。'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      service.addRepairFiles(
        repairer1,
        order.id,
        'after',
        [fileInput('after-3')],
        null,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Closing keeps them read-only but the evidence stays viewable.
    await service.reviewRepair(manager, order.id, 'close', '');
    await expect(
      service.addRepairRecord(repairer1, order.id, '关单后补。'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      service.removeRepairAttachment(
        repairer1,
        (await service.getRepair(manager, order.id)).afterFiles[0]?.id ?? 0,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(service.canAccessFile(repairer1, 'after-1')).resolves.toBe(
      true,
    );
    await expect(service.canAccessFile(repairer2, 'after-1')).resolves.toBe(
      false,
    );
  });

  it('leaves historical inspection and repair files intact when the equipment photo changes', async () => {
    // Build a submitted inspection with evidence and its repair order, then add
    // work-order material.
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    const item = detail.results[0];
    if (!item) throw new Error('missing result');
    await service.addInspectionFiles(
      inspector1,
      task.id,
      item.id,
      [fileInput('history-photo')],
      null,
    );
    await service.saveTaskResults(
      inspector1,
      task.id,
      detail.results.map((entry, index) => ({
        resultId: entry.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: index === 0 ? '异常。' : '',
      })),
    );
    await service.submitTask(inspector1, task.id);
    const [order] = await service.listRepairs(manager);
    if (!order) throw new Error('missing repair order');
    await service.addRepairFiles(
      manager,
      order.id,
      'before',
      [fileInput('history-repair')],
      null,
    );

    // Replace, then remove, the equipment's main photo.
    await service.setEquipmentPhoto(manager, 1, 'equipment-photo-a');
    await service.setEquipmentPhoto(manager, 1, 'equipment-photo-b');
    await service.setEquipmentPhoto(manager, 1, null);

    expect((await service.getEquipment(1)).photoFileId).toBeNull();
    const after = await service.getTask(inspector1, task.id);
    expect(after.results[0]?.attachments).toHaveLength(1);
    expect(
      (await service.getRepair(manager, order.id)).beforeFiles,
    ).toHaveLength(1);
    await expect(
      service.canAccessFile(inspector1, 'history-photo'),
    ).resolves.toBe(true);
    await expect(
      service.canAccessFile(manager, 'history-repair'),
    ).resolves.toBe(true);
  });

  it('reports dashboard counts for managers and inspectors', async () => {
    await createTaskAssignedToInspector1();
    const overdue = await service.createTask(manager, {
      equipmentId: 2,
      templateId: 1,
      assigneeId: INSPECTOR_1,
      plannedDate: '2020-01-01T00:00:00.000Z',
    });
    const detail = await service.getTask(inspector1, overdue.id);
    await service.saveTaskResults(
      inspector1,
      overdue.id,
      detail.results.map((item, index) => ({
        resultId: item.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: index === 0 ? '异常。' : '',
      })),
    );
    await service.submitTask(inspector1, overdue.id);

    const counts = await service.dashboard(manager);
    expect(counts.pending).toBe(1);
    expect(counts.overdue).toBe(0);
    expect(counts.abnormal).toBe(1);
    expect(counts.pendingReview).toBe(0);
  });

  it('counts an unsubmitted task past its planned date as overdue', async () => {
    await service.createTask(manager, {
      equipmentId: 1,
      templateId: 1,
      assigneeId: INSPECTOR_1,
      plannedDate: '2020-01-01T00:00:00.000Z',
    });
    const counts = await service.dashboard(manager);
    expect(counts.pending).toBe(1);
    expect(counts.overdue).toBe(1);
    const own = await service.dashboard(inspector1);
    expect(own.overdue).toBe(1);
  });

  async function createTaskAssignedToInspector1() {
    return service.createTask(manager, {
      equipmentId: 1,
      templateId: 1,
      assigneeId: INSPECTOR_1,
      plannedDate: '2026-09-19T01:00:00.000Z',
    });
  }

  async function createRepairOrderFromInspector1(options?: {
    defaultAssigneeIds?: readonly string[];
  }) {
    const task = await createTaskAssignedToInspector1();
    const detail = await service.getTask(inspector1, task.id);
    await service.saveTaskResults(
      inspector1,
      task.id,
      detail.results.map((item, index) => ({
        resultId: item.id,
        result: index === 0 ? 'abnormal' : 'normal',
        remark: index === 0 ? '异常说明。' : '',
      })),
    );
    await service.submitTask(inspector1, task.id, options);
    const [order] = await service.listRepairs(manager);
    if (!order) throw new Error('missing repair order');
    return order;
  }
});

async function migrateApp(database: DatabaseManager): Promise<void> {
  // The account-default migration alters the authentication plugin's table,
  // so migrate that plugin first; it also provides the `user` table.
  await migratePackage(database, '@nocobase/app-plugin-authentication');
  await createMigrator({
    database,
    packageName: 'app',
    directory: path.resolve('database/main/migrations'),
  }).latest();
}

async function migratePackage(
  database: DatabaseManager,
  packageName: string,
): Promise<void> {
  const { default: plugin } = await import(packageName + '/server');
  if (!plugin.baseDir || !plugin.database?.migrations) {
    throw new Error('Missing plugin migrations: ' + packageName);
  }
  await createMigrator({
    database,
    packageName,
    directory: path.resolve(plugin.baseDir, plugin.database.migrations),
  }).latest();
}

function fileInput(id = `file-${Math.random().toString(36).slice(2)}`) {
  return {
    id,
    filename: 'photo.png',
    mimeType: 'image/png',
    size: 1024,
    ext: 'png',
  };
}

async function seedFixture(database: DatabaseManager): Promise<void> {
  const query = database.query();
  const now = new Date();
  await query
    .insertInto('equipment')
    .values({
      id: 1,
      code: 'EQ-001',
      name: '数控车床',
      model: 'CNC-L450',
      location: '一号车间',
      commissionedAt: now,
      status: 'running',
      photoFileId: null,
      remark: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('equipment')
    .values({
      id: 2,
      code: 'EQ-002',
      name: '加工中心',
      model: 'VMC-850',
      location: '一号车间',
      commissionedAt: now,
      status: 'running',
      photoFileId: null,
      remark: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('inspectionTemplates')
    .values({
      id: 1,
      name: '日常巡检',
      description: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('inspectionTemplateItems')
    .values([
      {
        id: 1,
        templateId: 1,
        seq: 1,
        title: '润滑油位',
        standard: '油位正常',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        templateId: 1,
        seq: 2,
        title: '运行声音',
        standard: '无异常噪音',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 3,
        templateId: 1,
        seq: 3,
        title: '轴承温度',
        standard: '低于 70℃',
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
}
