import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  createQualityDatabase,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

const SUPERVISOR = 'user-supervisor';
const INSPECTOR_ONE = 'user-inspector-1';
const INSPECTOR_TWO = 'user-inspector-2';
const LEAD = 'user-lead';
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

describe('quality service', () => {
  let context: QualityTestDatabase;
  let service: QualityService;
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

    service = createQualityService({
      database: context.database,
      directory: {
        rolesForUser: (userId) => Promise.resolve(ROLES.get(userId) ?? []),
        listUsers: () =>
          Promise.resolve([...ROLES.keys()].map((id) => ({ id, name: id }))),
      },
    });
    [supervisor, inspectorOne, inspectorTwo, lead, leadTwo] = await Promise.all(
      [
        service.resolveActor(SUPERVISOR, SUPERVISOR),
        service.resolveActor(INSPECTOR_ONE, INSPECTOR_ONE),
        service.resolveActor(INSPECTOR_TWO, INSPECTOR_TWO),
        service.resolveActor(LEAD, LEAD),
        service.resolveActor(LEAD_TWO, LEAD_TWO),
      ],
    );
  });

  afterEach(async () => {
    await context.dispose();
  });

  async function createTask(items: readonly string[]): Promise<string> {
    const detail = await service.createTask(supervisor, {
      batchId: BATCH_ID,
      inspectorId: INSPECTOR_ONE,
      assignedLeadId: LEAD,
      sampleSize: 5,
      items: items.map((name) => ({ name })),
    });
    return detail.id;
  }

  async function expectQualityError(
    run: () => Promise<unknown>,
    code: string,
  ): Promise<void> {
    await expect(run()).rejects.toMatchObject({ code });
  }

  it('lets only the supervisor define and assign inspection tasks', async () => {
    await expectQualityError(
      () =>
        service.createTask(inspectorOne, {
          batchId: BATCH_ID,
          inspectorId: INSPECTOR_ONE,
          assignedLeadId: LEAD,
          sampleSize: 5,
          items: [{ name: '外径' }],
        }),
      'FORBIDDEN',
    );

    const detail = await service.createTask(supervisor, {
      batchId: BATCH_ID,
      inspectorId: INSPECTOR_ONE,
      assignedLeadId: LEAD,
      sampleSize: 5,
      items: [{ name: '外径' }, { name: '内径' }],
    });
    expect(detail.status).toBe('pending');
    expect(detail.itemCount).toBe(2);
    expect(detail.taskNo).toMatch(/^QC-/);
  });

  it('rejects an inspector who is not assigned to the task', async () => {
    const taskId = await createTask(['外径']);
    await expectQualityError(
      () => service.getTask(inspectorTwo, taskId),
      'FORBIDDEN',
    );
    const detail = await service.getTask(inspectorOne, taskId);
    const itemId = detail.items[0].id;
    await expectQualityError(
      () =>
        service.recordItem(inspectorTwo, taskId, itemId, {
          result: 'qualified',
        }),
      'FORBIDDEN',
    );
  });

  it('refuses submission until every item is recorded', async () => {
    const taskId = await createTask(['外径', '内径']);
    await expectQualityError(
      () => service.submitTask(inspectorOne, taskId),
      'INCOMPLETE_ITEMS',
    );
  });

  it('creates one rectification per failed item and is idempotent on repeat submit', async () => {
    const taskId = await createTask(['外径', '内径']);
    let detail = await service.getTask(inspectorOne, taskId);
    await service.recordItem(inspectorOne, taskId, detail.items[0].id, {
      result: 'qualified',
      measuredValue: '10.01',
    });
    await service.recordItem(inspectorOne, taskId, detail.items[1].id, {
      result: 'unqualified',
      measuredValue: '10.20',
      remark: '超出上偏差',
    });

    detail = await service.submitTask(inspectorOne, taskId);
    expect(detail.status).toBe('submitted');
    expect(detail.result).toBe('unqualified');
    expect(detail.nonconformances).toHaveLength(1);
    expect(detail.nonconformances[0].assignedToId).toBe(LEAD);

    // A repeated submission must not create a second rectification.
    detail = await service.submitTask(inspectorOne, taskId);
    expect(detail.nonconformances).toHaveLength(1);
    const all = await context.connection.query
      .selectFrom('nonconformances')
      .select('id')
      .execute();
    expect(all).toHaveLength(1);
  });

  it('records a qualified inspection when no item fails', async () => {
    const taskId = await createTask(['外径']);
    const detail = await service.getTask(inspectorOne, taskId);
    await service.recordItem(inspectorOne, taskId, detail.items[0].id, {
      result: 'qualified',
      measuredValue: '10.00',
    });
    const submitted = await service.submitTask(inspectorOne, taskId);
    expect(submitted.result).toBe('qualified');
    expect(submitted.nonconformances).toHaveLength(0);

    const stats = await service.passRate(supervisor);
    expect(stats.total).toBe(1);
    expect(stats.qualified).toBe(1);
    expect(stats.passRate).toBe(1);
  });

  it('lets only the assigned production lead handle a rectification', async () => {
    const taskId = await createTask(['外径']);
    const detail = await service.getTask(inspectorOne, taskId);
    await service.recordItem(inspectorOne, taskId, detail.items[0].id, {
      result: 'unqualified',
      remark: '不合格',
    });
    const submitted = await service.submitTask(inspectorOne, taskId);
    const nc = submitted.nonconformances[0];

    await expectQualityError(
      () =>
        service.updateNonconformance(leadTwo, nc.id, {
          reason: '原因',
          measure: '措施',
          submit: true,
        }),
      'FORBIDDEN',
    );

    const handled = await service.updateNonconformance(lead, nc.id, {
      reason: '刀具磨损',
      measure: '更换刀具并复检',
      submit: true,
    });
    expect(handled.status).toBe('pending_review');
    expect(handled.handledAt).not.toBeNull();
  });

  it('does not let the production lead close a rectification', async () => {
    const taskId = await createTask(['外径']);
    const detail = await service.getTask(inspectorOne, taskId);
    await service.recordItem(inspectorOne, taskId, detail.items[0].id, {
      result: 'unqualified',
      remark: '不合格',
    });
    const submitted = await service.submitTask(inspectorOne, taskId);
    const ncId = submitted.nonconformances[0].id;
    await service.updateNonconformance(lead, ncId, {
      reason: '原因',
      measure: '措施',
      submit: true,
    });

    await expectQualityError(
      () => service.reviewNonconformance(lead, ncId, { decision: 'close' }),
      'FORBIDDEN',
    );
  });

  it('lets the supervisor return and then close a rectification', async () => {
    const taskId = await createTask(['外径']);
    const detail = await service.getTask(inspectorOne, taskId);
    await service.recordItem(inspectorOne, taskId, detail.items[0].id, {
      result: 'unqualified',
      remark: '不合格',
    });
    const submitted = await service.submitTask(inspectorOne, taskId);
    const ncId = submitted.nonconformances[0].id;
    await service.updateNonconformance(lead, ncId, {
      reason: '原因',
      measure: '措施',
      submit: true,
    });

    await expectQualityError(
      () =>
        service.reviewNonconformance(supervisor, ncId, { decision: 'return' }),
      'VALIDATION',
    );
    const returned = await service.reviewNonconformance(supervisor, ncId, {
      decision: 'return',
      comment: '措施不具体',
    });
    expect(returned.status).toBe('returned');

    // The lead may revise a returned rectification and submit it again.
    await service.updateNonconformance(lead, ncId, {
      reason: '原因（补充）',
      measure: '措施（补充）',
      submit: true,
    });
    const closed = await service.reviewNonconformance(supervisor, ncId, {
      decision: 'close',
      comment: '同意关闭',
    });
    expect(closed.status).toBe('closed');
    expect(closed.reviewedById).toBe(SUPERVISOR);
  });

  it('scopes task and rectification lists by role', async () => {
    const taskId = await createTask(['外径']);
    const detail = await service.getTask(inspectorOne, taskId);
    await service.recordItem(inspectorOne, taskId, detail.items[0].id, {
      result: 'unqualified',
      remark: '不合格',
    });
    await service.submitTask(inspectorOne, taskId);

    expect((await service.listTasks(inspectorOne, {})).length).toBe(1);
    expect((await service.listTasks(inspectorTwo, {})).length).toBe(0);
    expect((await service.listTasks(lead, {})).length).toBe(1);
    expect((await service.listTasks(leadTwo, {})).length).toBe(0);
    expect((await service.listTasks(supervisor, {})).length).toBe(1);

    expect((await service.listNonconformances(lead, {})).length).toBe(1);
    expect((await service.listNonconformances(leadTwo, {})).length).toBe(0);
    expect((await service.listNonconformances(inspectorOne, {})).length).toBe(
      1,
    );
  });

  it('restricts pass-rate statistics to the supervisor', async () => {
    await expectQualityError(() => service.passRate(inspectorOne), 'FORBIDDEN');
  });

  it('rejects a duplicate product code', async () => {
    await expectQualityError(
      () =>
        service.createProduct(supervisor, {
          code: 'P-1',
          name: 'Duplicate',
          unit: '件',
        }),
      'CONFLICT',
    );
  });

  it('reports the session capabilities for each role', () => {
    expect(service.session(supervisor).capabilities).toEqual({
      supervise: true,
      inspect: false,
      produce: false,
    });
    expect(service.session(inspectorOne).capabilities.inspect).toBe(true);
    expect(service.session(lead).capabilities.produce).toBe(true);
  });

  it('exposes a typed error for denied actions', async () => {
    await expect(service.passRate(inspectorOne)).rejects.toBeInstanceOf(
      QualityError,
    );
  });
});
