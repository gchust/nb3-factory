import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Reproducible sample data for the quality inspection system:
 * 4 products, 8 production batches, 12 inspection tasks with check items,
 * and 5 nonconformances covering every status.
 *
 * Dates and identifiers are fixed so a re-run is harmless and the pass-rate
 * statistics are stable.
 *
 * The seed loader executes each file on its own, so this file repeats the trial
 * user ids rather than importing the sibling role seed; the two must stay in
 * step with `202609190002_seed_quality_roles_and_users.ts`.
 */
const TRIAL_USER_IDS = {
  supervisor: 'qcuser00000000000000000000000001',
  inspector: 'qcuser00000000000000000000000002',
  inspectorTwo: 'qcuser00000000000000000000000003',
  productionLead: 'qcuser00000000000000000000000004',
} as const;

const SEEDED_AT = new Date('2026-08-28T02:00:00.000Z');

interface ProductSeed {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly specification: string;
  readonly unit: string;
}

const PRODUCTS: readonly ProductSeed[] = [
  {
    id: 'qproduct0000000000000000000001',
    code: 'P-1001',
    name: '精密轴承',
    specification: '6204-2RS / φ20×47×14mm',
    unit: '件',
  },
  {
    id: 'qproduct0000000000000000000002',
    code: 'P-1002',
    name: '铝合金外壳',
    specification: 'AL-6061 / 120×80×35mm',
    unit: '件',
  },
  {
    id: 'qproduct0000000000000000000003',
    code: 'P-1003',
    name: '不锈钢螺栓',
    specification: 'M8×40 / 8.8级',
    unit: '个',
  },
  {
    id: 'qproduct0000000000000000000004',
    code: 'P-1004',
    name: '液压阀体',
    specification: 'HV-32 / DN32',
    unit: '件',
  },
];

interface BatchSeed {
  readonly id: string;
  readonly batchNo: string;
  readonly productId: string;
  readonly quantity: number;
  readonly productionLine: string;
  readonly producedAt: string;
  readonly status: string;
}

const BATCHES: readonly BatchSeed[] = [
  {
    id: 'qbatch000000000000000000000001',
    batchNo: 'B-2026-001',
    productId: PRODUCTS[0].id,
    quantity: 500,
    productionLine: '一号线',
    producedAt: '2026-08-01T00:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'qbatch000000000000000000000002',
    batchNo: 'B-2026-002',
    productId: PRODUCTS[0].id,
    quantity: 480,
    productionLine: '一号线',
    producedAt: '2026-08-05T00:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'qbatch000000000000000000000003',
    batchNo: 'B-2026-003',
    productId: PRODUCTS[1].id,
    quantity: 300,
    productionLine: '二号线',
    producedAt: '2026-08-08T00:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'qbatch000000000000000000000004',
    batchNo: 'B-2026-004',
    productId: PRODUCTS[1].id,
    quantity: 320,
    productionLine: '二号线',
    producedAt: '2026-08-12T00:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'qbatch000000000000000000000005',
    batchNo: 'B-2026-005',
    productId: PRODUCTS[2].id,
    quantity: 5000,
    productionLine: '三号线',
    producedAt: '2026-08-15T00:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'qbatch000000000000000000000006',
    batchNo: 'B-2026-006',
    productId: PRODUCTS[2].id,
    quantity: 4200,
    productionLine: '三号线',
    producedAt: '2026-08-19T00:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'qbatch000000000000000000000007',
    batchNo: 'B-2026-007',
    productId: PRODUCTS[3].id,
    quantity: 150,
    productionLine: '四号线',
    producedAt: '2026-08-22T00:00:00.000Z',
    status: 'in_production',
  },
  {
    id: 'qbatch000000000000000000000008',
    batchNo: 'B-2026-008',
    productId: PRODUCTS[3].id,
    quantity: 180,
    productionLine: '四号线',
    producedAt: '2026-08-26T00:00:00.000Z',
    status: 'completed',
  },
];

interface ItemSeed {
  readonly name: string;
  readonly method: string;
  readonly standard: string;
  readonly unit: string;
  readonly result: 'pending' | 'qualified' | 'unqualified';
  readonly measuredValue?: string;
  readonly remark?: string;
}

interface TaskSeed {
  readonly id: string;
  readonly taskNo: string;
  readonly batchId: string;
  readonly inspectorId: string;
  readonly sampleSize: number;
  readonly status: 'pending' | 'in_progress' | 'submitted';
  readonly result?: 'qualified' | 'unqualified';
  readonly submittedAt?: string;
  readonly items: readonly ItemSeed[];
}

function item(
  name: string,
  method: string,
  standard: string,
  unit: string,
  result: ItemSeed['result'],
  measuredValue?: string,
  remark?: string,
): ItemSeed {
  return {
    name,
    method,
    standard,
    unit,
    result,
    ...(measuredValue === undefined ? {} : { measuredValue }),
    ...(remark === undefined ? {} : { remark }),
  };
}

const INSPECTOR_ONE = TRIAL_USER_IDS.inspector;
const INSPECTOR_TWO = TRIAL_USER_IDS.inspectorTwo;
const SUPERVISOR = TRIAL_USER_IDS.supervisor;

const TASKS: readonly TaskSeed[] = [
  {
    id: 'qtask000000000000000000000001',
    taskNo: 'QC-20260801-001',
    batchId: BATCHES[0].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 20,
    status: 'submitted',
    result: 'qualified',
    submittedAt: '2026-08-02T03:20:00.000Z',
    items: [
      item(
        '外径尺寸',
        '游标卡尺测量',
        'φ20 ±0.01mm',
        'mm',
        'qualified',
        '20.004',
      ),
      item(
        '内径尺寸',
        '内径千分尺',
        'φ47 +0.012/0',
        'mm',
        'qualified',
        '47.006',
      ),
      item('宽度', '游标卡尺测量', '14 ±0.02mm', 'mm', 'qualified', '14.01'),
      item('外观', '目视检查', '无裂纹、无锈蚀', '-', 'qualified'),
    ],
  },
  {
    id: 'qtask000000000000000000000002',
    taskNo: 'QC-20260805-002',
    batchId: BATCHES[1].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 20,
    status: 'submitted',
    result: 'unqualified',
    submittedAt: '2026-08-06T06:10:00.000Z',
    items: [
      item(
        '外径尺寸',
        '游标卡尺测量',
        'φ20 ±0.01mm',
        'mm',
        'qualified',
        '20.008',
      ),
      item(
        '内径尺寸',
        '内径千分尺',
        'φ47 +0.012/0',
        'mm',
        'unqualified',
        '47.031',
        '超出上偏差',
      ),
      item('宽度', '游标卡尺测量', '14 ±0.02mm', 'mm', 'qualified', '13.995'),
      item(
        '圆度',
        '圆度仪',
        '≤0.004mm',
        'mm',
        'unqualified',
        '0.009',
        '圆度超差',
      ),
    ],
  },
  {
    id: 'qtask000000000000000000000003',
    taskNo: 'QC-20260808-003',
    batchId: BATCHES[2].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 15,
    status: 'submitted',
    result: 'qualified',
    submittedAt: '2026-08-09T02:40:00.000Z',
    items: [
      item('外形尺寸', '三坐标测量', '120 ±0.1mm', 'mm', 'qualified', '120.03'),
      item('壁厚', '超声测厚仪', '3.5 ±0.1mm', 'mm', 'qualified', '3.52'),
      item('表面粗糙度', '粗糙度仪', 'Ra ≤1.6', 'μm', 'qualified', '1.2'),
    ],
  },
  {
    id: 'qtask000000000000000000000004',
    taskNo: 'QC-20260812-004',
    batchId: BATCHES[3].id,
    inspectorId: INSPECTOR_TWO,
    sampleSize: 15,
    status: 'submitted',
    result: 'qualified',
    submittedAt: '2026-08-13T07:05:00.000Z',
    items: [
      item('外形尺寸', '三坐标测量', '120 ±0.1mm', 'mm', 'qualified', '119.98'),
      item('壁厚', '超声测厚仪', '3.5 ±0.1mm', 'mm', 'qualified', '3.47'),
      item('表面粗糙度', '粗糙度仪', 'Ra ≤1.6', 'μm', 'qualified', '1.4'),
    ],
  },
  {
    id: 'qtask000000000000000000000005',
    taskNo: 'QC-20260815-005',
    batchId: BATCHES[4].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 30,
    status: 'submitted',
    result: 'unqualified',
    submittedAt: '2026-08-16T05:30:00.000Z',
    items: [
      item('螺纹通规', '通规检测', '通规通过', '-', 'qualified'),
      item(
        '抗拉强度',
        '拉伸试验',
        '≥800MPa',
        'MPa',
        'unqualified',
        '742',
        '强度不足',
      ),
      item(
        '硬度',
        '洛氏硬度计',
        'HRC 22-32',
        'HRC',
        'unqualified',
        '18',
        '硬度偏低',
      ),
    ],
  },
  {
    id: 'qtask000000000000000000000006',
    taskNo: 'QC-20260819-006',
    batchId: BATCHES[5].id,
    inspectorId: INSPECTOR_TWO,
    sampleSize: 30,
    status: 'submitted',
    result: 'unqualified',
    submittedAt: '2026-08-20T04:15:00.000Z',
    items: [
      item(
        '螺纹通规',
        '通规检测',
        '通规通过',
        '-',
        'unqualified',
        undefined,
        '止规通过，螺纹超差',
      ),
      item('抗拉强度', '拉伸试验', '≥800MPa', 'MPa', 'qualified', '815'),
      item('硬度', '洛氏硬度计', 'HRC 22-32', 'HRC', 'qualified', '26'),
    ],
  },
  {
    id: 'qtask000000000000000000000007',
    taskNo: 'QC-20260822-007',
    batchId: BATCHES[6].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 10,
    status: 'pending',
    items: [
      item('阀体密封面', '目视+量具', '无划伤，平面度≤0.02mm', 'mm', 'pending'),
      item('内腔尺寸', '内径量表', 'φ32 +0.05/0', 'mm', 'pending'),
      item('耐压试验', '水压试验', '2.5MPa 保压 3min 无渗漏', 'MPa', 'pending'),
    ],
  },
  {
    id: 'qtask000000000000000000000008',
    taskNo: 'QC-20260826-008',
    batchId: BATCHES[7].id,
    inspectorId: INSPECTOR_TWO,
    sampleSize: 10,
    status: 'pending',
    items: [
      item('阀体密封面', '目视+量具', '无划伤，平面度≤0.02mm', 'mm', 'pending'),
      item('内腔尺寸', '内径量表', 'φ32 +0.05/0', 'mm', 'pending'),
      item('耐压试验', '水压试验', '2.5MPa 保压 3min 无渗漏', 'MPa', 'pending'),
    ],
  },
  {
    id: 'qtask000000000000000000000009',
    taskNo: 'QC-20260802-009',
    batchId: BATCHES[0].id,
    inspectorId: INSPECTOR_TWO,
    sampleSize: 20,
    status: 'in_progress',
    items: [
      item(
        '外径尺寸',
        '游标卡尺测量',
        'φ20 ±0.01mm',
        'mm',
        'qualified',
        '20.002',
      ),
      item('内径尺寸', '内径千分尺', 'φ47 +0.012/0', 'mm', 'pending'),
      item('宽度', '游标卡尺测量', '14 ±0.02mm', 'mm', 'pending'),
      item('外观', '目视检查', '无裂纹、无锈蚀', '-', 'pending'),
    ],
  },
  {
    id: 'qtask000000000000000000000010',
    taskNo: 'QC-20260809-010',
    batchId: BATCHES[2].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 15,
    status: 'in_progress',
    items: [
      item('外形尺寸', '三坐标测量', '120 ±0.1mm', 'mm', 'qualified', '120.06'),
      item('壁厚', '超声测厚仪', '3.5 ±0.1mm', 'mm', 'pending'),
      item('表面粗糙度', '粗糙度仪', 'Ra ≤1.6', 'μm', 'pending'),
    ],
  },
  {
    id: 'qtask000000000000000000000011',
    taskNo: 'QC-20260816-011',
    batchId: BATCHES[4].id,
    inspectorId: INSPECTOR_TWO,
    sampleSize: 30,
    status: 'pending',
    items: [
      item('螺纹通规', '通规检测', '通规通过', '-', 'pending'),
      item('抗拉强度', '拉伸试验', '≥800MPa', 'MPa', 'pending'),
      item('硬度', '洛氏硬度计', 'HRC 22-32', 'HRC', 'pending'),
    ],
  },
  {
    id: 'qtask000000000000000000000012',
    taskNo: 'QC-20260827-012',
    batchId: BATCHES[7].id,
    inspectorId: INSPECTOR_ONE,
    sampleSize: 10,
    status: 'pending',
    items: [
      item('阀体密封面', '目视+量具', '无划伤，平面度≤0.02mm', 'mm', 'pending'),
      item('内腔尺寸', '内径量表', 'φ32 +0.05/0', 'mm', 'pending'),
      item('耐压试验', '水压试验', '2.5MPa 保压 3min 无渗漏', 'MPa', 'pending'),
    ],
  },
];

interface NonconformanceSeed {
  readonly id: string;
  readonly code: string;
  readonly taskId: string;
  readonly itemIndex: number;
  readonly status: string;
  readonly reason?: string;
  readonly measure?: string;
  readonly handledAt?: string;
  readonly reviewedById?: string;
  readonly reviewedAt?: string;
  readonly reviewComment?: string;
}

const LEAD = TRIAL_USER_IDS.productionLead;

const NONCONFORMANCES: readonly NonconformanceSeed[] = [
  {
    id: 'qnc000000000000000000000000001',
    code: 'NC-2026-001',
    taskId: TASKS[1].id,
    itemIndex: 1,
    status: 'open',
  },
  {
    id: 'qnc000000000000000000000000002',
    code: 'NC-2026-002',
    taskId: TASKS[1].id,
    itemIndex: 3,
    status: 'processing',
    reason: '圆度超差初步判断为磨削工序砂轮磨损',
  },
  {
    id: 'qnc000000000000000000000000003',
    code: 'NC-2026-003',
    taskId: TASKS[4].id,
    itemIndex: 1,
    status: 'pending_review',
    reason: '原材料批次抗拉强度低于标准，供应商来料检验漏检',
    measure: '退换该批次原材料，加严来料抽检比例至 20%，并对已投产螺栓全检',
    handledAt: '2026-08-17T08:00:00.000Z',
  },
  {
    id: 'qnc000000000000000000000000004',
    code: 'NC-2026-004',
    taskId: TASKS[4].id,
    itemIndex: 2,
    status: 'closed',
    reason: '热处理炉温控制偏差导致硬度偏低',
    measure: '校准热处理炉温控系统，返工重新热处理并复检合格',
    handledAt: '2026-08-17T09:30:00.000Z',
    reviewedById: SUPERVISOR,
    reviewedAt: '2026-08-18T01:00:00.000Z',
    reviewComment: '措施有效，复检结果合格，同意关闭。',
  },
  {
    id: 'qnc000000000000000000000000005',
    code: 'NC-2026-005',
    taskId: TASKS[5].id,
    itemIndex: 0,
    status: 'returned',
    reason: '螺纹加工刀具磨损',
    measure: '更换刀具',
    handledAt: '2026-08-21T02:00:00.000Z',
    reviewedById: SUPERVISOR,
    reviewedAt: '2026-08-21T09:00:00.000Z',
    reviewComment: '措施过于笼统，未说明复检方案与责任工序，退回补充。',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190003_seed_quality_sample_data',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('products'))) {
      return;
    }

    const existing = await query
      .selectFrom('products')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    await insertProducts(query);
    await insertBatches(query);
    await insertTasksAndItems(query);
    await insertNonconformances(query);
  },
});

type SeedQuery = SeedContext['query'];

async function insertProducts(query: SeedQuery): Promise<void> {
  await query
    .insertInto('products')
    .values(
      PRODUCTS.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        specification: product.specification,
        unit: product.unit,
        status: 'active',
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      })),
    )
    .execute();
}

async function insertBatches(query: SeedQuery): Promise<void> {
  await query
    .insertInto('productionBatches')
    .values(
      BATCHES.map((batch) => ({
        id: batch.id,
        batchNo: batch.batchNo,
        productId: batch.productId,
        quantity: batch.quantity,
        productionLine: batch.productionLine,
        producedAt: new Date(batch.producedAt),
        status: batch.status,
        createdById: TRIAL_USER_IDS.supervisor,
        remark: null,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      })),
    )
    .execute();
}

async function insertTasksAndItems(query: SeedQuery): Promise<void> {
  await query
    .insertInto('inspectionTasks')
    .values(
      TASKS.map((task) => {
        const batch = BATCHES.find(
          (candidate) => candidate.id === task.batchId,
        )!;
        return {
          id: task.id,
          taskNo: task.taskNo,
          batchId: task.batchId,
          productId: batch.productId,
          inspectorId: task.inspectorId,
          supervisorId: TRIAL_USER_IDS.supervisor,
          assignedLeadId: LEAD,
          sampleSize: task.sampleSize,
          status: task.status,
          result: task.result ?? null,
          remark: null,
          submittedAt: task.submittedAt ? new Date(task.submittedAt) : null,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        };
      }),
    )
    .execute();

  const items = TASKS.flatMap((task) =>
    task.items.map((entry, index) => ({
      id: `${task.id.replace('qtask', 'qitem')}${String(index + 1).padStart(2, '0')}`,
      taskId: task.id,
      seq: index + 1,
      name: entry.name,
      method: entry.method || null,
      standard: entry.standard || null,
      unit: entry.unit || null,
      result: entry.result,
      measuredValue: entry.measuredValue ?? null,
      remark: entry.remark ?? null,
      inspectedAt: entry.result === 'pending' ? null : SEEDED_AT,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    })),
  );
  await query.insertInto('inspectionItems').values(items).execute();
}

async function insertNonconformances(query: SeedQuery): Promise<void> {
  const rows = NONCONFORMANCES.map((entry) => {
    const task = TASKS.find((candidate) => candidate.id === entry.taskId)!;
    const batch = BATCHES.find((candidate) => candidate.id === task.batchId)!;
    const failedItem = task.items[entry.itemIndex];
    return {
      id: entry.id,
      code: entry.code,
      taskId: task.id,
      itemId: `${task.id.replace('qtask', 'qitem')}${String(entry.itemIndex + 1).padStart(2, '0')}`,
      batchId: batch.id,
      productId: batch.productId,
      title: `${failedItem.name}不合格（${task.taskNo}）`,
      description: failedItem.remark ?? failedItem.standard ?? null,
      status: entry.status,
      assignedToId: LEAD,
      reason: entry.reason ?? null,
      measure: entry.measure ?? null,
      handledAt: entry.handledAt ? new Date(entry.handledAt) : null,
      reviewedById: entry.reviewedById ?? null,
      reviewedAt: entry.reviewedAt ? new Date(entry.reviewedAt) : null,
      reviewComment: entry.reviewComment ?? null,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    };
  });
  await query.insertInto('nonconformances').values(rows).execute();
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
