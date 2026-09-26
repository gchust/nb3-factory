import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface LoanSeed {
  readonly assetNo: string;
  readonly borrower: string;
  readonly purpose: string;
  readonly borrowedAt: string;
  readonly dueAt: string;
  readonly returnedAt: string | null;
}

/**
 * Three loans over the seeded devices: one normal active loan, one active loan
 * that is past due, and one historical loan that was returned, so the ledger
 * and the records page both show every state out of the box.
 *
 * The dates are fixed rather than relative to the run so repeated runs stay
 * reproducible. The normal loan's due date is deliberately far ahead: a sample
 * device must not turn overdue merely because the application is opened later.
 */
const LOANS: readonly LoanSeed[] = [
  {
    assetNo: 'EQ-2026-002',
    borrower: '张伟',
    purpose: '新员工入职办公使用',
    borrowedAt: '2026-09-20T02:00:00.000Z',
    dueAt: '2027-09-20T02:00:00.000Z',
    returnedAt: null,
  },
  {
    assetNo: 'EQ-2026-003',
    borrower: '李娜',
    purpose: '客户现场方案演示',
    borrowedAt: '2026-08-01T02:00:00.000Z',
    dueAt: '2026-08-20T02:00:00.000Z',
    returnedAt: null,
  },
  {
    assetNo: 'EQ-2026-004',
    borrower: '王强',
    purpose: '季度总结会现场拍摄',
    borrowedAt: '2026-06-01T02:00:00.000Z',
    dueAt: '2026-06-15T02:00:00.000Z',
    returnedAt: '2026-06-10T06:00:00.000Z',
  },
];

/**
 * Borrow-record sample data. A loan is seeded only when no loan already exists
 * for the same device and borrower, so a repeat run changes nothing.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609260004_seed_equipment_loan_samples',
  async run(context) {
    const equipment = context.repository('equipment');
    const loans = context.repository('equipmentLoans');

    for (const item of LOANS) {
      const device = await equipment.findOne({
        filter: { assetNo: item.assetNo },
      });
      if (!device) {
        continue;
      }

      const equipmentId = Number((device as { id: number }).id);
      const existing = await loans.findOne({
        filter: { equipmentId, borrower: item.borrower },
      });
      if (existing) {
        continue;
      }

      await loans.createOne({
        values: {
          equipmentId,
          borrower: item.borrower,
          purpose: item.purpose,
          borrowedAt: item.borrowedAt,
          dueAt: item.dueAt,
          returnedAt: item.returnedAt,
          createdAt: item.borrowedAt,
          updatedAt: item.returnedAt ?? item.borrowedAt,
        },
      });
    }
  },
});

export default seed;
