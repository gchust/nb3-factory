import { defineSeed, type SeedDefinition } from '@nocobase/db';

const INSPECTOR_1 = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a01';
const INSPECTOR_2 = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a02';
const REPAIRER_1 = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b01';
const REPAIRER_2 = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b02';

interface TemplateItem {
  readonly id: number;
  readonly seq: number;
  readonly title: string;
  readonly standard: string;
}

interface TemplateSeed {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly items: readonly TemplateItem[];
}

interface TaskSeed {
  readonly id: number;
  readonly code: string;
  readonly equipmentId: number;
  readonly templateId: number;
  readonly assigneeId: string;
  readonly plannedDate: string;
  readonly status: 'pending' | 'in_progress' | 'submitted';
  readonly submittedAt?: string;
}

const EQUIPMENT = [
  {
    id: 1,
    code: 'EQ-001',
    name: '数控车床',
    model: 'CNC-L450',
    location: '一号车间 A 区',
    commissionedAt: '2021-03-12T00:00:00.000Z',
    status: 'running',
  },
  {
    id: 2,
    code: 'EQ-002',
    name: '立式加工中心',
    model: 'VMC-850',
    location: '一号车间 B 区',
    commissionedAt: '2022-07-01T00:00:00.000Z',
    status: 'running',
  },
  {
    id: 3,
    code: 'EQ-003',
    name: '焊接机器人',
    model: 'IR-2000',
    location: '焊接车间',
    commissionedAt: '2023-01-20T00:00:00.000Z',
    status: 'running',
  },
  {
    id: 4,
    code: 'EQ-004',
    name: '空气压缩机',
    model: 'AC-75',
    location: '动力站',
    commissionedAt: '2020-05-06T00:00:00.000Z',
    status: 'maintenance',
  },
  {
    id: 5,
    code: 'EQ-005',
    name: '注塑机',
    model: 'IM-320',
    location: '二号车间 A 区',
    commissionedAt: '2022-11-15T00:00:00.000Z',
    status: 'running',
  },
  {
    id: 6,
    code: 'EQ-006',
    name: '电动叉车',
    model: 'FD-30',
    location: '物流区',
    commissionedAt: '2023-06-08T00:00:00.000Z',
    status: 'idle',
  },
  {
    id: 7,
    code: 'EQ-007',
    name: '激光切割机',
    model: 'LC-3015',
    location: '一号车间 C 区',
    commissionedAt: '2021-09-30T00:00:00.000Z',
    status: 'running',
  },
  {
    id: 8,
    code: 'EQ-008',
    name: '干式变压器',
    model: 'TR-800KVA',
    location: '配电房',
    commissionedAt: '2019-12-01T00:00:00.000Z',
    status: 'running',
  },
] as const;

const TEMPLATES: readonly TemplateSeed[] = [
  {
    id: 1,
    name: '日常巡检（机械）',
    description: '机械设备的日常运行状态检查。',
    items: [
      {
        id: 1,
        seq: 1,
        title: '润滑油位',
        standard: '油位处于油标中线以上，无渗漏',
      },
      {
        id: 2,
        seq: 2,
        title: '运行声音',
        standard: '运转平稳，无异常噪音或撞击声',
      },
      { id: 3, seq: 3, title: '轴承温度', standard: '轴承温度低于 70℃' },
      {
        id: 4,
        seq: 4,
        title: '安全防护',
        standard: '防护罩、急停按钮完好有效',
      },
    ],
  },
  {
    id: 2,
    name: '电气巡检',
    description: '供配电与电气控制柜的巡检内容。',
    items: [
      {
        id: 5,
        seq: 1,
        title: '电压电流',
        standard: '三相电压 380V±10%，三相电流基本平衡',
      },
      {
        id: 6,
        seq: 2,
        title: '接线端子',
        standard: '接线牢固，无松动、无烧灼痕迹',
      },
      {
        id: 7,
        seq: 3,
        title: '接地保护',
        standard: '接地线连接可靠，接地电阻合格',
      },
      { id: 8, seq: 4, title: '指示灯', standard: '运行、故障指示灯显示正常' },
      { id: 9, seq: 5, title: '绝缘电阻', standard: '绝缘电阻大于 1MΩ' },
    ],
  },
];

const TASKS: readonly TaskSeed[] = [
  {
    id: 1,
    code: 'IT-20260919-001',
    equipmentId: 1,
    templateId: 1,
    assigneeId: INSPECTOR_1,
    plannedDate: '2026-09-19T01:00:00.000Z',
    status: 'pending',
  },
  {
    id: 2,
    code: 'IT-20260919-002',
    equipmentId: 2,
    templateId: 1,
    assigneeId: INSPECTOR_2,
    plannedDate: '2026-09-20T01:00:00.000Z',
    status: 'pending',
  },
  {
    id: 3,
    code: 'IT-20260919-003',
    equipmentId: 3,
    templateId: 2,
    assigneeId: INSPECTOR_1,
    plannedDate: '2026-09-18T01:00:00.000Z',
    status: 'pending',
  },
  {
    id: 4,
    code: 'IT-20260919-004',
    equipmentId: 4,
    templateId: 2,
    assigneeId: INSPECTOR_2,
    plannedDate: '2026-09-15T01:00:00.000Z',
    status: 'pending',
  },
  {
    id: 5,
    code: 'IT-20260919-005',
    equipmentId: 5,
    templateId: 1,
    assigneeId: INSPECTOR_1,
    plannedDate: '2026-09-19T01:00:00.000Z',
    status: 'in_progress',
  },
  {
    id: 6,
    code: 'IT-20260919-006',
    equipmentId: 6,
    templateId: 1,
    assigneeId: INSPECTOR_2,
    plannedDate: '2026-09-21T01:00:00.000Z',
    status: 'in_progress',
  },
  {
    id: 7,
    code: 'IT-20260919-007',
    equipmentId: 7,
    templateId: 2,
    assigneeId: INSPECTOR_1,
    plannedDate: '2026-09-16T01:00:00.000Z',
    status: 'submitted',
    submittedAt: '2026-09-16T03:20:00.000Z',
  },
  {
    id: 8,
    code: 'IT-20260919-008',
    equipmentId: 8,
    templateId: 2,
    assigneeId: INSPECTOR_2,
    plannedDate: '2026-09-17T01:00:00.000Z',
    status: 'submitted',
    submittedAt: '2026-09-17T02:05:00.000Z',
  },
  {
    id: 9,
    code: 'IT-20260919-009',
    equipmentId: 1,
    templateId: 1,
    assigneeId: INSPECTOR_1,
    plannedDate: '2026-09-12T01:00:00.000Z',
    status: 'submitted',
    submittedAt: '2026-09-12T04:10:00.000Z',
  },
  {
    id: 10,
    code: 'IT-20260919-010',
    equipmentId: 3,
    templateId: 1,
    assigneeId: INSPECTOR_2,
    plannedDate: '2026-09-22T01:00:00.000Z',
    status: 'pending',
  },
];

interface Outcome {
  readonly result: 'normal' | 'abnormal';
  readonly remark?: string;
}

const OUTCOMES: Readonly<Record<string, Outcome>> = {
  '5:1': { result: 'normal' },
  '5:2': { result: 'normal' },
  '6:1': { result: 'normal' },
  '7:5': { result: 'normal' },
  '7:6': {
    result: 'abnormal',
    remark: 'B 相接线端子有烧灼痕迹，紧固后仍发热。',
  },
  '7:7': { result: 'normal' },
  '7:8': { result: 'normal' },
  '7:9': { result: 'normal' },
  '8:5': { result: 'normal' },
  '8:6': { result: 'normal' },
  '8:7': { result: 'normal' },
  '8:8': { result: 'normal' },
  '8:9': { result: 'abnormal', remark: '绝缘电阻仅 0.4MΩ，低于标准值。' },
  '9:1': { result: 'abnormal', remark: '油位低于下限，油标处有渗漏痕迹。' },
  '9:2': { result: 'abnormal', remark: '运转时有周期性撞击声。' },
  '9:3': { result: 'normal' },
  '9:4': { result: 'normal' },
};

const seed: SeedDefinition = defineSeed({
  name: '202609190103_seed_demo_business_data',

  async run({ query }) {
    const existing = await query
      .selectFrom('equipment')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const now = new Date();
    const at = (value: string): Date => new Date(value);
    const administrator = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const administratorId =
      typeof administrator?.id === 'string' ? administrator.id : REPAIRER_1;

    await query
      .insertInto('equipment')
      .values(
        EQUIPMENT.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          model: item.model,
          location: item.location,
          commissionedAt: at(item.commissionedAt),
          status: item.status,
          photoFileId: null,
          remark: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();

    await query
      .insertInto('inspectionTemplates')
      .values(
        TEMPLATES.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();

    await query
      .insertInto('inspectionTemplateItems')
      .values(
        TEMPLATES.flatMap((template) =>
          template.items.map((item) => ({
            id: item.id,
            templateId: template.id,
            seq: item.seq,
            title: item.title,
            standard: item.standard,
            createdAt: now,
            updatedAt: now,
          })),
        ),
      )
      .execute();

    const resultIds = new Map<string, number>();
    const resultRows: Record<string, unknown>[] = [];
    let nextResultId = 1;
    for (const task of TASKS) {
      const template = TEMPLATES.find((item) => item.id === task.templateId);
      if (!template) continue;
      for (const item of template.items) {
        const id = nextResultId++;
        resultIds.set(`${task.id}:${item.id}`, id);
        const outcome = OUTCOMES[`${task.id}:${item.id}`];
        resultRows.push({
          id,
          taskId: task.id,
          templateItemId: item.id,
          title: item.title,
          standard: item.standard,
          result: outcome?.result ?? null,
          remark: outcome?.remark ?? null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await query.insertInto('inspectionResults').values(resultRows).execute();

    await query
      .insertInto('inspectionTasks')
      .values(
        TASKS.map((task) => ({
          id: task.id,
          code: task.code,
          equipmentId: task.equipmentId,
          templateId: task.templateId,
          assigneeId: task.assigneeId,
          plannedDate: at(task.plannedDate),
          status: task.status,
          submittedAt: task.submittedAt ? at(task.submittedAt) : null,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();

    const repairOrders = [
      {
        id: 1,
        code: 'RO-20260916-001',
        equipmentId: 7,
        sourceResultId: required(resultIds, '7:6'),
        assigneeId: REPAIRER_1,
        priority: 'high',
        status: 'pending',
        description: 'B 相接线端子有烧灼痕迹，紧固后仍发热。',
        reviewedById: null,
        reviewRemark: null,
        closedAt: null,
      },
      {
        id: 2,
        code: 'RO-20260917-001',
        equipmentId: 8,
        sourceResultId: required(resultIds, '8:9'),
        assigneeId: REPAIRER_2,
        priority: 'normal',
        status: 'processing',
        description: '绝缘电阻仅 0.4MΩ，低于标准值。',
        reviewedById: null,
        reviewRemark: null,
        closedAt: null,
      },
      {
        id: 3,
        code: 'RO-20260912-001',
        equipmentId: 1,
        sourceResultId: required(resultIds, '9:1'),
        assigneeId: REPAIRER_1,
        priority: 'urgent',
        status: 'review',
        description: '油位低于下限，油标处有渗漏痕迹。',
        reviewedById: null,
        reviewRemark: null,
        closedAt: null,
      },
      {
        id: 4,
        code: 'RO-20260912-002',
        equipmentId: 1,
        sourceResultId: required(resultIds, '9:2'),
        assigneeId: REPAIRER_2,
        priority: 'low',
        status: 'returned',
        description: '运转时有周期性撞击声。',
        reviewedById: administratorId,
        reviewRemark: '请补充振动检测数据后再提交复核。',
        closedAt: null,
      },
    ];

    await query
      .insertInto('repairOrders')
      .values(
        repairOrders.map((order) => ({
          ...order,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();

    await query
      .insertInto('repairOrderRecords')
      .values([
        {
          id: 1,
          repairOrderId: 2,
          authorId: REPAIRER_2,
          content: '已更换接触器并重新紧固端子，等待绝缘复测。',
          createdAt: at('2026-09-17T06:00:00.000Z'),
        },
        {
          id: 2,
          repairOrderId: 3,
          authorId: REPAIRER_1,
          content: '补充润滑油并更换油封，运行 30 分钟无渗漏。',
          createdAt: at('2026-09-12T07:30:00.000Z'),
        },
        {
          id: 3,
          repairOrderId: 4,
          authorId: REPAIRER_2,
          content: '初检未发现明显噪音，建议更换轴承。',
          createdAt: at('2026-09-12T08:10:00.000Z'),
        },
        {
          id: 4,
          repairOrderId: 4,
          authorId: administratorId,
          content: '资料不足，退回补充振动检测数据。',
          createdAt: at('2026-09-13T02:00:00.000Z'),
        },
      ])
      .execute();
  },
});

function required(map: Map<string, number>, key: string): number {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing seeded result ${key}`);
  return value;
}

export default seed;
