import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Fictional leave requests so a fresh installation has something to show in every
 * status. Idempotent: skips when the table already holds any request so re-running
 * never duplicates or overwrites user data. Applicants are fictional names with a
 * null `applicantId` because a fresh database has no users at seed time.
 *
 * The `main` connection is bound explicitly, matching the database/main directory
 * this seed lives in.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609130003_seed_leave_requests',
  async run({ query }: SeedContext): Promise<void> {
    const now = Date.now();

    const existing = await query
      .selectFrom('leaveRequests')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) {
      return;
    }

    const make = (
      index: number,
      applicantName: string,
      type: string,
      startAt: number,
      endAt: number,
      days: number,
      reason: string,
      status: string,
      approval?: { comment: string; byName: string; at: number },
    ): {
      applicantId: null;
      applicantName: string;
      type: string;
      startAt: Date;
      endAt: Date;
      days: number;
      reason: string;
      status: string;
      approvalComment: string | null;
      approvedById: null;
      approvedByName: string | null;
      approvedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } => {
      const createdAt = new Date(startAt - 26 * 3600 * 1000 * index);
      return {
        applicantId: null,
        applicantName,
        type,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        days,
        reason,
        status,
        approvalComment: approval?.comment ?? null,
        approvedById: null,
        approvedByName: approval?.byName ?? null,
        approvedAt: approval ? new Date(approval.at) : null,
        createdAt,
        updatedAt: approval ? new Date(approval.at) : createdAt,
      };
    };

    const rows = [
      make(
        1,
        '张三',
        'personal',
        now + 86_400_000 * 2,
        now + 86_400_000 * 2 + 8 * 3600 * 1000,
        1,
        '家里有事，需要请假一天处理家事。',
        'pending',
      ),
      make(
        2,
        '张三',
        'sick',
        now + 86_400_000 * 14,
        now + 86_400_000 * 15,
        2,
        '感冒发烧，医生建议休息两天。',
        'pending',
      ),
      make(
        3,
        '李四',
        'annual',
        now - 86_400_000 * 40,
        now - 86_400_000 * 37,
        3,
        '带家人外出旅行，申请年假三天。',
        'approved',
        {
          comment: '同意，旅途愉快。',
          byName: '王主管',
          at: now - 86_400_000 * 38,
        },
      ),
      make(
        4,
        '李四',
        'personal',
        now + 86_400_000 * 5,
        now + 86_400_000 * 5 + 4 * 3600_000,
        0.5,
        '下午参加孩子学校的家长会。',
        'approved',
        {
          comment: '同意，请提前安排好手头工作。',
          byName: '王主管',
          at: now - 86_400_000 * 1,
        },
      ),
      make(
        5,
        '王五',
        'compensatory',
        now - 86_400_000 * 60,
        now - 86_400_000 * 59,
        1,
        '上周末加班一天，申请调休一天。',
        'approved',
        {
          comment: '同意。',
          byName: '赵经理',
          at: now - 86_400_000 * 58,
        },
      ),
      make(
        6,
        '王五',
        'sick',
        now - 86_400_000 * 20,
        now - 86_400_000 * 19,
        1,
        '请半天病假去医院复诊。',
        'rejected',
        {
          comment: '本周有重要评审，请调整时间后重新申请。',
          byName: '王主管',
          at: now - 86_400_000 * 18,
        },
      ),
    ];

    for (const row of rows) {
      await query.insertInto('leaveRequests').values(row).execute();
    }
  },
});

export default seed;
