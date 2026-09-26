import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Sample ledger for the office equipment borrowing feature.
 *
 * The dataset answers "what do the two pages need to show?" — at least one
 * available device, one normally borrowed device, one overdue device and one
 * already returned loan — so both pages have every state visible without the
 * tester having to create records first.
 *
 * Dates are relative to the moment the seed first runs, so the overdue loan is
 * actually overdue and the normal loan is actually in the future whenever the
 * application is installed. The seed is idempotent: equipment is matched by its
 * unique asset number and a loan by `(equipment, borrower)`, so running it twice
 * updates the same rows instead of duplicating them.
 */
interface EquipmentRecord {
  readonly id: number;
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
  readonly status: 'available' | 'borrowed';
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

interface LoanRecord {
  readonly id: number;
  readonly equipmentId: number;
  readonly borrower: string;
  readonly purpose: string;
  readonly borrowedAt: string | Date;
  readonly expectedReturnAt: string | Date;
  readonly returnedAt: string | Date | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

interface EquipmentSeed {
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
  readonly status: 'available' | 'borrowed';
}

interface LoanSeed {
  readonly assetNo: string;
  readonly borrower: string;
  readonly purpose: string;
  /** Days before "now" the device was borrowed. */
  readonly borrowedDaysAgo: number;
  /** Days from "now" the return is expected; negative means it is already past due. */
  readonly dueInDays: number;
  /** Days before "now" the device was returned; omitted means the loan is still open. */
  readonly returnedDaysAgo?: number;
}

const EQUIPMENT: readonly EquipmentSeed[] = [
  {
    assetNo: 'EQ-1001',
    name: 'Dell Latitude 5440 笔记本电脑',
    category: '笔记本电脑',
    notes: '行政部备用机，配备 65W 电源适配器。',
    status: 'available',
  },
  {
    assetNo: 'EQ-1002',
    name: 'ThinkPad X1 Carbon 笔记本电脑',
    category: '笔记本电脑',
    notes: '销售部常用出差机型。',
    status: 'borrowed',
  },
  {
    assetNo: 'EQ-1003',
    name: 'Epson CB-X06 投影仪',
    category: '会议设备',
    notes: '含遥控器、HDMI 线与便携包。',
    status: 'borrowed',
  },
  {
    assetNo: 'EQ-1004',
    name: 'Canon EOS R50 相机',
    category: '影像设备',
    notes: '含 18-45mm 镜头与 64G 存储卡。',
    status: 'available',
  },
  {
    assetNo: 'EQ-1005',
    name: 'iPad Pro 11 英寸',
    category: '移动设备',
    notes: '用于展厅演示。',
    status: 'available',
  },
];

const LOANS: readonly LoanSeed[] = [
  {
    assetNo: 'EQ-1002',
    borrower: '李伟',
    purpose: '客户现场为期一个月的驻场开发。',
    borrowedDaysAgo: 12,
    dueInDays: 18,
  },
  {
    assetNo: 'EQ-1003',
    borrower: '王芳',
    purpose: '季度发布会彩排与现场放映。',
    borrowedDaysAgo: 40,
    dueInDays: -25,
  },
  {
    assetNo: 'EQ-1004',
    borrower: '张敏',
    purpose: '员工入职照与活动跟拍。',
    borrowedDaysAgo: 35,
    dueInDays: -20,
    returnedDaysAgo: 21,
  },
];

function daysFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

const seed: SeedDefinition = defineSeed({
  name: '202607200003_seed_office_equipment_demo',

  async run(context: SeedContext): Promise<void> {
    const now = new Date();
    const equipmentRepository =
      context.repository<EquipmentRecord>('officeEquipment');
    const loanRepository = context.repository<LoanRecord>('equipmentLoans');
    const equipmentIds = new Map<string, number>();

    for (const item of EQUIPMENT) {
      const existing = await equipmentRepository.findOne({
        filter: { assetNo: item.assetNo },
      });
      if (existing) {
        equipmentIds.set(item.assetNo, existing.id);
        await equipmentRepository.updateOne({
          filter: { id: existing.id },
          values: { ...item, updatedAt: now },
        });
      } else {
        const created = await equipmentRepository.createOne({
          values: { ...item, createdAt: now, updatedAt: now },
        });
        equipmentIds.set(item.assetNo, created.record.id);
      }
    }

    for (const loan of LOANS) {
      const equipmentId = equipmentIds.get(loan.assetNo);
      if (equipmentId === undefined) {
        continue;
      }
      const borrowedAt = daysFromNow(now, -loan.borrowedDaysAgo);
      const expectedReturnAt = daysFromNow(now, loan.dueInDays);
      const returnedAt =
        loan.returnedDaysAgo === undefined
          ? null
          : daysFromNow(now, -loan.returnedDaysAgo);
      const values = {
        equipmentId,
        borrower: loan.borrower,
        purpose: loan.purpose,
        borrowedAt,
        expectedReturnAt,
        returnedAt,
      };

      const existing = await loanRepository.findOne({
        filter: (filter) =>
          filter.and([
            filter.number('equipmentId').eq(equipmentId),
            filter.string('borrower').eq(loan.borrower),
          ]),
      });
      if (existing) {
        await loanRepository.updateOne({
          filter: { id: existing.id },
          values: { ...values, updatedAt: now },
        });
      } else {
        await loanRepository.createOne({
          values: { ...values, createdAt: now, updatedAt: now },
        });
      }
    }
  },
});

export default seed;
