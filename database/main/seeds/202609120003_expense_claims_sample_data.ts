import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import type { QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Sample data for the expense reimbursement module (报销).
 *
 * Idempotent: demo users are created only when missing (matched by username),
 * and claims are created only when their claimNumber is not yet present, so
 * re-running the seed never duplicates or mutates existing rows.
 *
 * Claim numbers: BX-2026-0001 .. BX-2026-0004, two applicants, every status
 * represented, each claim with at least two detail lines whose amounts sum to
 * the claim total. Attachments are left empty.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609120003_expense_claims_sample_data',

  async run({ query }: SeedContext): Promise<void> {
    const now = new Date();

    const zhangWei = await ensureUser(query, 'zhang.wei', '张伟', now);
    const liNa = await ensureUser(query, 'li.na', '李娜', now);

    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const adminId = (admin?.id as string | undefined) ?? null;

    const sampleClaims = [
      {
        claimNumber: 'BX-2026-0001',
        applicantId: zhangWei.id,
        applicantName: '张伟',
        expenseType: 'travel',
        expenseDate: '2026-09-02',
        totalAmount: 3280,
        status: 'pending',
        description: '上海产品发布会差旅报销',
        reviewerId: null,
        reviewedAt: null,
        rejectReason: null,
        items: [
          { itemName: '高铁票（往返）', amount: 1180, note: '上海-苏州往返' },
          { itemName: '酒店住宿（2晚）', amount: 1600, note: '会议协议价' },
          { itemName: '市内交通', amount: 500, note: '出租车与地铁' },
        ],
      },
      {
        claimNumber: 'BX-2026-0002',
        applicantId: liNa.id,
        applicantName: '李娜',
        expenseType: 'office',
        expenseDate: '2026-09-05',
        totalAmount: 1250.5,
        status: 'pending',
        description: 'Q3 办公用品采购',
        reviewerId: null,
        reviewedAt: null,
        rejectReason: null,
        items: [
          { itemName: 'A4 打印纸（10箱）', amount: 450, note: '京东自营' },
          { itemName: '墨水与硒鼓', amount: 800.5, note: '原装耗材' },
        ],
      },
      {
        claimNumber: 'BX-2026-0003',
        applicantId: zhangWei.id,
        applicantName: '张伟',
        expenseType: 'entertainment',
        expenseDate: '2026-08-20',
        totalAmount: 862,
        status: 'approved',
        description: '客户接待用餐',
        reviewerId: adminId,
        reviewedAt: new Date('2026-08-22T09:30:00Z'),
        rejectReason: null,
        items: [
          { itemName: '晚餐（4人）', amount: 862, note: 'XX 客户一行' },
          { itemName: '停车费', amount: 0, note: '无' },
        ],
      },
      {
        claimNumber: 'BX-2026-0004',
        applicantId: liNa.id,
        applicantName: '李娜',
        expenseType: 'transport',
        expenseDate: '2026-08-15',
        totalAmount: 396,
        status: 'rejected',
        description: '月度市内交通报销',
        reviewerId: adminId,
        reviewedAt: new Date('2026-08-18T14:00:00Z'),
        rejectReason:
          '出租车发票未附行程单，且金额超出月度交通补贴标准，请重新整理后提交。',
        items: [
          { itemName: '出租车费用', amount: 296, note: '8月上旬市内出行' },
          { itemName: '地铁充值', amount: 100, note: '交通卡充值' },
        ],
      },
    ];

    const existing = await query
      .selectFrom('expense_claims')
      .select('claimNumber')
      .where(
        'claimNumber',
        'in',
        sampleClaims.map(({ claimNumber }) => claimNumber),
      )
      .execute();
    const existingNumbers = new Set(
      existing.map((row) => row.claimNumber as string),
    );

    for (const claim of sampleClaims) {
      if (existingNumbers.has(claim.claimNumber)) continue;

      const claimId = crypto.randomUUID();
      await query
        .insertInto('expense_claims')
        .values({
          id: claimId,
          claimNumber: claim.claimNumber,
          applicantId: claim.applicantId,
          applicantName: claim.applicantName,
          expenseType: claim.expenseType,
          expenseDate: claim.expenseDate,
          totalAmount: claim.totalAmount,
          description: claim.description,
          status: claim.status,
          reviewerId: claim.reviewerId,
          reviewedAt: claim.reviewedAt,
          rejectReason: claim.rejectReason,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      for (const item of claim.items) {
        await query
          .insertInto('expense_claim_items')
          .values({
            id: crypto.randomUUID(),
            claimId,
            itemName: item.itemName,
            amount: item.amount,
            note: item.note,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  },
});

async function ensureUser(
  query: QueryAdapter,
  username: string,
  name: string,
  now: Date,
): Promise<{ id: string }> {
  const existing = await query
    .selectFrom('user')
    .select(['id'])
    .where('username', '=', username)
    .executeTakeFirst();
  if (existing) return { id: existing.id as string };

  const id = crypto.randomUUID();
  await query
    .insertInto('user')
    .values({
      id,
      name,
      username,
      email: `${username}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      issuer: 'local:credential',
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: await hashPassword('demo1234'),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return { id };
}

export default seed;
