import { defineSeed } from '@nocobase/db';

interface EquipmentRow {
  id: number;
  assetCode: string;
  name: string;
  category: string | null;
  notes: string | null;
  createdAt: string;
}

interface EquipmentLoanRow {
  id: number;
  equipmentId: number;
  borrower: string;
  purpose: string | null;
  borrowedAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  createdAt: string;
}

interface EquipmentSpec {
  assetCode: string;
  name: string;
  category: string;
  notes: string;
}

interface LoanSpec {
  assetCode: string;
  borrower: string;
  purpose: string;
  /** Days before the seed runs that the device was taken. */
  borrowedDaysAgo: number;
  /** Days from the seed run to the agreed return; negative means already due. */
  expectedReturnInDays: number;
  /** When set, the loan was returned this many days ago. */
  returnedDaysAgo?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Five devices that together cover every state the ledger can show: available,
 * on loan and on time, overdue, and a device whose earlier loan was returned.
 * The names are business data, not interface copy, so they are not translated.
 */
const EQUIPMENT: readonly EquipmentSpec[] = [
  {
    assetCode: 'EQ-2024-001',
    name: '笔记本电脑 ThinkPad T14',
    category: '电脑设备',
    notes: '标配办公笔记本，配有电源适配器和扩展坞。',
  },
  {
    assetCode: 'EQ-2024-002',
    name: '投影仪 Epson CB-X06',
    category: '显示设备',
    notes: '含 HDMI 线与便携包。',
  },
  {
    assetCode: 'EQ-2024-003',
    name: '无线麦克风 Shure BLX24',
    category: '音频设备',
    notes: '两支手持话筒，含接收机。',
  },
  {
    assetCode: 'EQ-2024-004',
    name: '单反相机 Canon EOS R6',
    category: '影像设备',
    notes: '含 24-105mm 镜头与两块电池。',
  },
  {
    assetCode: 'EQ-2024-005',
    name: '三脚架 Manfrotto MT055',
    category: '影像设备',
    notes: '碳纤维脚架，承重 9kg。',
  },
];

const LOANS: readonly LoanSpec[] = [
  {
    assetCode: 'EQ-2024-002',
    borrower: '李静',
    purpose: '客户现场方案演示',
    borrowedDaysAgo: 3,
    expectedReturnInDays: 2,
  },
  {
    assetCode: 'EQ-2024-003',
    borrower: '王强',
    purpose: '年会主持使用',
    borrowedDaysAgo: 20,
    expectedReturnInDays: -13,
  },
  {
    assetCode: 'EQ-2024-004',
    borrower: '赵敏',
    purpose: '产品宣传照拍摄',
    borrowedDaysAgo: 40,
    expectedReturnInDays: -33,
    returnedDaysAgo: 34,
  },
  {
    assetCode: 'EQ-2024-005',
    borrower: '陈磊',
    purpose: '办公区延时摄影',
    borrowedDaysAgo: 12,
    expectedReturnInDays: -5,
    returnedDaysAgo: 5,
  },
];

function shiftDays(reference: Date, days: number): string {
  return new Date(reference.getTime() + days * DAY_MS).toISOString();
}

/**
 * Installation data for a fresh application. Re-running it leaves an existing
 * installation alone: a device is created only when its asset code is absent,
 * and the loans for a device are inserted only when that device has none, so a
 * later edit by a user survives a second run.
 */
const seed = defineSeed({
  name: '202609030001_default_equipment',
  async run(context) {
    const equipmentRepository = context.repository<EquipmentRow>('equipment');
    const loanRepository =
      context.repository<EquipmentLoanRow>('equipmentLoans');
    const now = new Date();
    const nowIso = now.toISOString();

    const equipmentIdByAssetCode = new Map<string, number>();

    for (const spec of EQUIPMENT) {
      const existing = await equipmentRepository.findOne({
        filter: { assetCode: spec.assetCode },
      });
      if (existing) {
        equipmentIdByAssetCode.set(spec.assetCode, existing.id);
        continue;
      }

      const created = await equipmentRepository.createOne({
        values: {
          assetCode: spec.assetCode,
          name: spec.name,
          category: spec.category,
          notes: spec.notes,
          createdAt: nowIso,
        },
      });
      equipmentIdByAssetCode.set(spec.assetCode, created.record.id);
    }

    for (const spec of LOANS) {
      const equipmentId = equipmentIdByAssetCode.get(spec.assetCode);
      if (equipmentId === undefined) {
        continue;
      }

      const existingLoans = await loanRepository.count({
        filter: { equipmentId },
      });
      if (existingLoans > 0) {
        continue;
      }

      await loanRepository.createOne({
        values: {
          equipmentId,
          borrower: spec.borrower,
          purpose: spec.purpose,
          borrowedAt: shiftDays(now, -spec.borrowedDaysAgo),
          expectedReturnAt: shiftDays(now, spec.expectedReturnInDays),
          returnedAt:
            spec.returnedDaysAgo === undefined
              ? null
              : shiftDays(now, -spec.returnedDaysAgo),
          createdAt: nowIso,
        },
      });
    }
  },
});

export default seed;
