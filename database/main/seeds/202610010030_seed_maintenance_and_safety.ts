import { defineSeed } from '@nocobase/db';

/**
 * Work orders with their event trail, safety inspections and training records.
 *
 * The open high-severity inspection in LAB-A is intentional: it is the state a
 * verifier needs in order to see the "cannot restore equipment while a high risk
 * inspection is open" rule actually fire.
 */

const CREATED_AT = new Date('2026-02-02T08:00:00.000Z');
const UPDATED_AT = new Date('2026-03-18T08:00:00.000Z');

interface WorkOrderEventSeed {
  action: string;
  fromStatus: string | null;
  toStatus: string;
  comment: string;
  actor: string;
  at: string;
}

interface WorkOrderSeed {
  code: string;
  assetNo: string;
  labCode: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  assignee: string | null;
  createdBy: string;
  resolvedAt: string | null;
  reviewComment: string | null;
  reviewedBy: string | null;
  events: WorkOrderEventSeed[];
}

const WORK_ORDERS: WorkOrderSeed[] = [
  {
    code: 'WO-2026-001',
    assetNo: 'EQ-2026-003',
    labCode: 'LAB-A',
    title: '离心机运行时异响，需检查转子与轴承',
    description:
      '3 月 10 日学生反映离心机升速阶段出现周期性异响，已停机断电并挂牌。',
    type: 'repair',
    priority: 'high',
    status: 'in_progress',
    assignee: 'demo-tech1',
    createdBy: 'demo-teacher1',
    resolvedAt: null,
    reviewComment: null,
    reviewedBy: null,
    events: [
      {
        action: 'create',
        fromStatus: null,
        toStatus: 'open',
        comment: '教师报修，设备已挂牌停用。',
        actor: 'demo-teacher1',
        at: '2026-03-10T02:15:00.000Z',
      },
      {
        action: 'assign',
        fromStatus: 'open',
        toStatus: 'assigned',
        comment: '指派设备技术员陈刚处理。',
        actor: 'demo-labadmin',
        at: '2026-03-10T03:00:00.000Z',
      },
      {
        action: 'start',
        fromStatus: 'assigned',
        toStatus: 'in_progress',
        comment: '已拆检转子，等待轴承备件到货。',
        actor: 'demo-tech1',
        at: '2026-03-11T01:30:00.000Z',
      },
    ],
  },
  {
    code: 'WO-2026-002',
    assetNo: 'EQ-2026-005',
    labCode: 'LAB-A',
    title: '干燥箱温度均匀度超差，申请报废',
    description: '年度校准判定温度均匀度超差，维修成本高于重置成本。',
    type: 'scrap',
    priority: 'low',
    status: 'completed',
    assignee: 'demo-tech1',
    createdBy: 'demo-tech1',
    resolvedAt: '2026-04-08T09:00:00.000Z',
    reviewComment:
      '经复核温度均匀度超差且无维修价值，同意报废并办理资产处置手续。',
    reviewedBy: 'demo-labadmin',
    events: [
      {
        action: 'create',
        fromStatus: null,
        toStatus: 'open',
        comment: '校准结论为不合格，申请报废。',
        actor: 'demo-tech1',
        at: '2026-04-02T01:00:00.000Z',
      },
      {
        action: 'assign',
        fromStatus: 'open',
        toStatus: 'assigned',
        comment: '由技术员评估维修价值。',
        actor: 'demo-labadmin',
        at: '2026-04-02T02:00:00.000Z',
      },
      {
        action: 'start',
        fromStatus: 'assigned',
        toStatus: 'in_progress',
        comment: '完成维修成本评估。',
        actor: 'demo-tech1',
        at: '2026-04-03T01:00:00.000Z',
      },
      {
        action: 'submit_review',
        fromStatus: 'in_progress',
        toStatus: 'pending_review',
        comment: '维修报价超过新购价格 60%，建议报废。',
        actor: 'demo-tech1',
        at: '2026-04-04T01:00:00.000Z',
      },
      {
        action: 'complete',
        fromStatus: 'pending_review',
        toStatus: 'completed',
        comment:
          '经复核温度均匀度超差且无维修价值，同意报废并办理资产处置手续。',
        actor: 'demo-labadmin',
        at: '2026-04-08T09:00:00.000Z',
      },
    ],
  },
  {
    code: 'WO-2026-003',
    assetNo: 'EQ-2026-002',
    labCode: 'LAB-A',
    title: '万用表校准证书过期，申请复校',
    description: '万用表校准证书已于 5 月 31 日到期，需安排送检复校。',
    type: 'calibration',
    priority: 'normal',
    status: 'open',
    assignee: null,
    createdBy: 'demo-safety1',
    resolvedAt: null,
    reviewComment: null,
    reviewedBy: null,
    events: [
      {
        action: 'create',
        fromStatus: null,
        toStatus: 'open',
        comment: '安全检查发现证书过期，登记待处理。',
        actor: 'demo-safety1',
        at: '2026-06-05T06:20:00.000Z',
      },
    ],
  },
];

interface SafetyCheckSeed {
  labCode: string;
  title: string;
  checkType: string;
  result: string;
  severity: string | null;
  status: string;
  findings: string;
  checkedAt: string;
  checkedBy: string;
  closedAt: string | null;
  closedBy: string | null;
}

const SAFETY_CHECKS: SafetyCheckSeed[] = [
  {
    labCode: 'LAB-A',
    title: '第三季度化学品柜与通风系统检查',
    checkType: 'quarterly',
    result: 'issue',
    severity: 'high',
    status: 'open',
    findings: '通风柜面风速仅 0.32 m/s，低于 0.5 m/s 要求，需更换风机后复检。',
    checkedAt: '2026-09-15T02:00:00.000Z',
    checkedBy: 'demo-safety1',
    closedAt: null,
    closedBy: null,
  },
  {
    labCode: 'LAB-A',
    title: '九月用电与消防通道检查',
    checkType: 'monthly',
    result: 'pass',
    severity: null,
    status: 'closed',
    findings: '插座无过载、灭火器压力正常、消防通道畅通。',
    checkedAt: '2026-09-01T01:00:00.000Z',
    checkedBy: 'demo-safety1',
    closedAt: '2026-09-01T03:00:00.000Z',
    closedBy: 'demo-labadmin',
  },
  {
    labCode: 'LAB-B',
    title: '第三季度危化品存放检查',
    checkType: 'quarterly',
    result: 'pass',
    severity: null,
    status: 'closed',
    findings: '危险化学品账物相符，存放柜通风与标识符合要求。',
    checkedAt: '2026-09-16T02:00:00.000Z',
    checkedBy: 'demo-lab2admin',
    closedAt: '2026-09-16T05:00:00.000Z',
    closedBy: 'demo-lab2admin',
  },
];

interface TrainingSeed {
  labCode: string;
  assetNo: string | null;
  title: string;
  trainer: string;
  trainedAt: string;
  participantCount: number;
  notes: string;
  createdBy: string;
}

const TRAINING: TrainingSeed[] = [
  {
    labCode: 'LAB-A',
    assetNo: 'EQ-2026-001',
    title: '电子天平安全操作培训',
    trainer: '孙芳',
    trainedAt: '2026-03-02',
    participantCount: 8,
    notes: '含开机预热、水平调节、称量记录与清洁保养演示。',
    createdBy: 'demo-teacher1',
  },
  {
    labCode: 'LAB-A',
    assetNo: 'EQ-2026-003',
    title: '离心机安全操作培训',
    trainer: '陈刚',
    trainedAt: '2026-03-05',
    participantCount: 6,
    notes: '含配平方法、异常处置与紧急停机流程。',
    createdBy: 'demo-tech1',
  },
  {
    labCode: 'LAB-A',
    assetNo: null,
    title: '实验室应急处置演练',
    trainer: '周涛',
    trainedAt: '2026-03-12',
    participantCount: 12,
    notes: '含化学品泄漏、火情初期处置与疏散路线演练。',
    createdBy: 'demo-safety1',
  },
];

const seed = defineSeed({
  name: '202610010030_seed_maintenance_and_safety',
  async run({ query }) {
    const labIds = new Map<string, number>();
    for (const code of ['LAB-A', 'LAB-B']) {
      const lab = await query
        .selectFrom('laboratories')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirstOrThrow();
      labIds.set(code, Number(lab.id));
    }

    const equipmentIds = new Map<string, number>();
    const referencedAssets = [
      ...WORK_ORDERS.map((order) => order.assetNo),
      ...TRAINING.map((training) => training.assetNo).filter(
        (value): value is string => value !== null,
      ),
    ];
    for (const assetNo of new Set(referencedAssets)) {
      const equipment = await query
        .selectFrom('equipment')
        .select('id')
        .where('assetNo', '=', assetNo)
        .executeTakeFirstOrThrow();
      equipmentIds.set(assetNo, Number(equipment.id));
    }

    for (const order of WORK_ORDERS) {
      const labId = labIds.get(order.labCode);
      const equipmentId = equipmentIds.get(order.assetNo);
      if (labId === undefined || equipmentId === undefined) {
        throw new Error(
          `Seed work order ${order.code} references unknown equipment or laboratory`,
        );
      }

      const existing = await query
        .selectFrom('work_orders')
        .select('id')
        .where('code', '=', order.code)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      await query
        .insertInto('work_orders')
        .values({
          code: order.code,
          equipmentId,
          labId,
          title: order.title,
          description: order.description,
          type: order.type,
          priority: order.priority,
          status: order.status,
          assigneeId: order.assignee,
          createdById: order.createdBy,
          resolvedAt: order.resolvedAt ? new Date(order.resolvedAt) : null,
          reviewComment: order.reviewComment,
          reviewedById: order.reviewedBy,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        })
        .execute();

      const inserted = await query
        .selectFrom('work_orders')
        .select('id')
        .where('code', '=', order.code)
        .executeTakeFirstOrThrow();
      const workOrderId = Number(inserted.id);

      for (const event of order.events) {
        await query
          .insertInto('work_order_events')
          .values({
            workOrderId,
            action: event.action,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            comment: event.comment,
            actorId: event.actor,
            createdAt: new Date(event.at),
          })
          .execute();
      }
    }

    for (const check of SAFETY_CHECKS) {
      const labId = labIds.get(check.labCode);
      if (labId === undefined) {
        throw new Error(
          `Seed safety check references unknown laboratory ${check.labCode}`,
        );
      }
      const existing = await query
        .selectFrom('safety_checks')
        .select('id')
        .where('labId', '=', labId)
        .where('title', '=', check.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('safety_checks')
        .values({
          labId,
          title: check.title,
          checkType: check.checkType,
          result: check.result,
          severity: check.severity,
          status: check.status,
          findings: check.findings,
          checkedAt: new Date(check.checkedAt),
          checkedById: check.checkedBy,
          closedAt: check.closedAt ? new Date(check.closedAt) : null,
          closedById: check.closedBy,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        })
        .execute();
    }

    for (const training of TRAINING) {
      const labId = labIds.get(training.labCode);
      if (labId === undefined) {
        throw new Error(
          `Seed training record references unknown laboratory ${training.labCode}`,
        );
      }
      const existing = await query
        .selectFrom('training_records')
        .select('id')
        .where('labId', '=', labId)
        .where('title', '=', training.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('training_records')
        .values({
          labId,
          equipmentId: training.assetNo
            ? (equipmentIds.get(training.assetNo) ?? null)
            : null,
          title: training.title,
          trainer: training.trainer,
          trainedAt: new Date(`${training.trainedAt}T00:00:00.000Z`),
          participantCount: training.participantCount,
          notes: training.notes,
          createdById: training.createdBy,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        })
        .execute();
    }
  },
});

export default seed;
