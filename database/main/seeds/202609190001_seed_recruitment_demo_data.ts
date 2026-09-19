import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Recruitment demo data.
 *
 * Everything here is fictitious. The demo accounts share one password so each
 * role can be tried out; the credentials are listed in the task report and are
 * not real credentials.
 *
 * The seed is idempotent: every insert is guarded by a natural key, so running
 * it again (or against a database that already contains the demo rows) leaves
 * the data unchanged.
 */

export const DEMO_PASSWORD = 'Recruit123!';

export const RECRUITMENT_ROLE_KEYS = {
  hrManager: 'recruitment-hr-manager',
  recruiter: 'recruitment-recruiter',
  interviewer: 'recruitment-interviewer',
} as const;

export const RECRUITMENT_PAGE_IDS = [
  'recruitment-positions',
  'recruitment-candidates',
  'recruitment-interviews',
  'recruitment-onboarding',
  'recruitment-stats',
] as const;

const STAFF = [
  {
    username: 'hr.manager',
    name: '陈慧',
    email: 'hr.manager@example.com',
    role: RECRUITMENT_ROLE_KEYS.hrManager,
  },
  {
    username: 'recruiter.li',
    name: '李娜',
    email: 'recruiter.li@example.com',
    role: RECRUITMENT_ROLE_KEYS.recruiter,
  },
  {
    username: 'recruiter.wang',
    name: '王强',
    email: 'recruiter.wang@example.com',
    role: RECRUITMENT_ROLE_KEYS.recruiter,
  },
  {
    username: 'interviewer.zhang',
    name: '张伟',
    email: 'interviewer.zhang@example.com',
    role: RECRUITMENT_ROLE_KEYS.interviewer,
  },
  {
    username: 'interviewer.chen',
    name: '刘敏',
    email: 'interviewer.chen@example.com',
    role: RECRUITMENT_ROLE_KEYS.interviewer,
  },
] as const;

const ROLE_TITLES: Readonly<Record<string, string>> = {
  [RECRUITMENT_ROLE_KEYS.hrManager]: '招聘负责人',
  [RECRUITMENT_ROLE_KEYS.recruiter]: '招聘专员',
  [RECRUITMENT_ROLE_KEYS.interviewer]: '面试官',
};

const ROLE_PAGES: Readonly<Record<string, readonly string[]>> = {
  [RECRUITMENT_ROLE_KEYS.hrManager]: RECRUITMENT_PAGE_IDS,
  [RECRUITMENT_ROLE_KEYS.recruiter]: RECRUITMENT_PAGE_IDS,
  [RECRUITMENT_ROLE_KEYS.interviewer]: ['recruitment-interviews'],
};

interface PositionSeed {
  readonly title: string;
  readonly department: string;
  readonly headcount: number;
  readonly status: 'open' | 'closed';
  readonly description: string;
}

const POSITIONS: readonly PositionSeed[] = [
  {
    title: '前端工程师',
    department: '研发部',
    headcount: 2,
    status: 'open',
    description: '负责招聘系统与内部平台的前端开发。',
  },
  {
    title: '后端工程师',
    department: '研发部',
    headcount: 3,
    status: 'open',
    description: '负责招聘系统 API 与服务端架构。',
  },
  {
    title: '产品经理',
    department: '产品部',
    headcount: 1,
    status: 'open',
    description: '负责招聘系统的产品规划与需求梳理。',
  },
  {
    title: '市场专员',
    department: '市场部',
    headcount: 1,
    status: 'closed',
    description: '负责品牌活动与渠道运营。',
  },
];

interface CandidateSeed {
  readonly name: string;
  readonly position: string;
  readonly recruiter: string;
  readonly stage: string;
  readonly phone: string;
  readonly email: string;
  readonly source: string;
}

const CANDIDATES: readonly CandidateSeed[] = [
  {
    name: '赵敏',
    position: '前端工程师',
    recruiter: 'recruiter.li',
    stage: 'onboarded',
    phone: '13800000001',
    email: 'zhaomin@example.com',
    source: '内推',
  },
  {
    name: '钱伟',
    position: '前端工程师',
    recruiter: 'recruiter.wang',
    stage: 'offered',
    phone: '13800000002',
    email: 'qianwei@example.com',
    source: '招聘网站',
  },
  {
    name: '孙丽',
    position: '后端工程师',
    recruiter: 'recruiter.li',
    stage: 'pending_offer',
    phone: '13800000003',
    email: 'sunli@example.com',
    source: '猎头',
  },
  {
    name: '李强',
    position: '后端工程师',
    recruiter: 'recruiter.wang',
    stage: 'interviewed',
    phone: '13800000004',
    email: 'liqiang@example.com',
    source: '招聘网站',
  },
  {
    name: '周敏',
    position: '产品经理',
    recruiter: 'recruiter.li',
    stage: 'pending',
    phone: '13800000005',
    email: 'zhoumin@example.com',
    source: '内推',
  },
  {
    name: '吴磊',
    position: '前端工程师',
    recruiter: 'recruiter.wang',
    stage: 'rejected',
    phone: '13800000006',
    email: 'wulei@example.com',
    source: '招聘网站',
  },
  {
    name: '郑爽',
    position: '后端工程师',
    recruiter: 'recruiter.li',
    stage: 'pending',
    phone: '13800000007',
    email: 'zhengshuang@example.com',
    source: '校园招聘',
  },
  {
    name: '王芳',
    position: '市场专员',
    recruiter: 'recruiter.wang',
    stage: 'pending',
    phone: '13800000008',
    email: 'wangfang@example.com',
    source: '招聘网站',
  },
  {
    name: '冯涛',
    position: '产品经理',
    recruiter: 'recruiter.li',
    stage: 'interviewed',
    phone: '13800000009',
    email: 'fengtao@example.com',
    source: '猎头',
  },
  {
    name: '陈静',
    position: '前端工程师',
    recruiter: 'recruiter.wang',
    stage: 'pending',
    phone: '13800000010',
    email: 'chenjing@example.com',
    source: '内推',
  },
  {
    name: '褚磊',
    position: '后端工程师',
    recruiter: 'recruiter.li',
    stage: 'pending_offer',
    phone: '13800000011',
    email: 'chulei@example.com',
    source: '招聘网站',
  },
  {
    name: '卫红',
    position: '市场专员',
    recruiter: 'recruiter.wang',
    stage: 'rejected',
    phone: '13800000012',
    email: 'weihong@example.com',
    source: '校园招聘',
  },
];

interface InterviewSeed {
  readonly candidate: string;
  readonly interviewer: string;
  readonly scheduledAt: string;
  readonly method: 'onsite' | 'video' | 'phone';
  readonly status: 'scheduled' | 'completed';
  readonly result?: 'pass' | 'fail';
  readonly score?: number;
  readonly evaluation?: string;
}

const INTERVIEWS: readonly InterviewSeed[] = [
  {
    candidate: '赵敏',
    interviewer: 'interviewer.zhang',
    scheduledAt: '2026-09-05T02:00:00.000Z',
    method: 'onsite',
    status: 'completed',
    result: 'pass',
    score: 92,
    evaluation: '基础扎实，项目经验丰富，沟通清晰。',
  },
  {
    candidate: '钱伟',
    interviewer: 'interviewer.chen',
    scheduledAt: '2026-09-08T06:00:00.000Z',
    method: 'video',
    status: 'completed',
    result: 'pass',
    score: 88,
    evaluation: '框架理解到位，建议加强工程化实践。',
  },
  {
    candidate: '孙丽',
    interviewer: 'interviewer.zhang',
    scheduledAt: '2026-09-10T01:30:00.000Z',
    method: 'onsite',
    status: 'completed',
    result: 'pass',
    score: 90,
    evaluation: '后端基础好，对数据库有深入理解。',
  },
  {
    candidate: '李强',
    interviewer: 'interviewer.chen',
    scheduledAt: '2026-09-12T07:00:00.000Z',
    method: 'video',
    status: 'completed',
    result: 'pass',
    score: 82,
    evaluation: '学习能力强，需补充分布式经验。',
  },
  {
    candidate: '冯涛',
    interviewer: 'interviewer.zhang',
    scheduledAt: '2026-09-15T03:00:00.000Z',
    method: 'onsite',
    status: 'completed',
    result: 'pass',
    score: 85,
    evaluation: '产品思维清晰，能结合数据做判断。',
  },
  {
    candidate: '褚磊',
    interviewer: 'interviewer.chen',
    scheduledAt: '2026-09-17T08:00:00.000Z',
    method: 'video',
    status: 'completed',
    result: 'pass',
    score: 87,
    evaluation: '工程能力扎实，团队协作意识好。',
  },
  {
    candidate: '周敏',
    interviewer: 'interviewer.zhang',
    scheduledAt: '2026-09-22T02:00:00.000Z',
    method: 'onsite',
    status: 'scheduled',
  },
  {
    candidate: '郑爽',
    interviewer: 'interviewer.chen',
    scheduledAt: '2026-09-24T06:30:00.000Z',
    method: 'video',
    status: 'scheduled',
  },
];

interface OnboardingSeed {
  readonly candidate: string;
  readonly title: string;
  readonly status: 'pending' | 'done';
}

const ONBOARDING_TODOS: readonly OnboardingSeed[] = [
  { candidate: '赵敏', title: '提交身份证与学历证明', status: 'done' },
  { candidate: '赵敏', title: '签署劳动合同', status: 'pending' },
  { candidate: '赵敏', title: '开通办公账号与门禁', status: 'pending' },
  { candidate: '钱伟', title: '发出录用通知书', status: 'pending' },
  { candidate: '钱伟', title: '确认入职日期', status: 'pending' },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190001_seed_recruitment_demo_data',

  async run({ query }) {
    const now = new Date();

    // 1. Demo accounts.
    const userIds = new Map<string, string>();
    for (const member of STAFF) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', member.username)
        .executeTakeFirst();
      if (existing) {
        userIds.set(member.username, String(existing.id));
        continue;
      }
      const userId = crypto.randomUUID();
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: member.name,
          username: member.username,
          email: member.email,
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
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(DEMO_PASSWORD),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      userIds.set(member.username, userId);
    }

    // 2. Recruitment roles as permission sets, with page access grants.
    for (const member of STAFF) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', member.role)
        .executeTakeFirst();
      if (!existingSet) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: crypto.randomUUID(),
            key: member.role,
            title: ROLE_TITLES[member.role] ?? member.role,
            grants: JSON.stringify(grantsForRole(member.role)),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
      const userId = userIds.get(member.username);
      if (!userId) continue;
      const assignmentId = `user:${userId}:${member.role}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!existingAssignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: member.role,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    // 3. Positions.
    const positionIds = new Map<string, string>();
    for (const position of POSITIONS) {
      const existing = await query
        .selectFrom('recruitmentPositions')
        .select('id')
        .where('title', '=', position.title)
        .executeTakeFirst();
      if (existing) {
        positionIds.set(position.title, String(existing.id));
        continue;
      }
      const positionId = crypto.randomUUID();
      await query
        .insertInto('recruitmentPositions')
        .values({
          id: positionId,
          title: position.title,
          department: position.department,
          headcount: position.headcount,
          ownerUsername: 'hr.manager',
          ownerName: '陈慧',
          status: position.status,
          description: position.description,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      positionIds.set(position.title, positionId);
    }

    // 4. Candidates.
    const candidateIds = new Map<string, string>();
    const recruiterNames = new Map<string, string>(
      STAFF.map((s) => [s.username, s.name]),
    );
    for (const candidate of CANDIDATES) {
      const positionId = positionIds.get(candidate.position);
      if (!positionId) continue;
      const existing = await query
        .selectFrom('recruitmentCandidates')
        .select('id')
        .where('name', '=', candidate.name)
        .where('positionId', '=', positionId)
        .executeTakeFirst();
      if (existing) {
        candidateIds.set(candidate.name, String(existing.id));
        continue;
      }
      const stageTimestamps = stageFields(candidate.stage, now);
      const candidateId = crypto.randomUUID();
      await query
        .insertInto('recruitmentCandidates')
        .values({
          id: candidateId,
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          positionId,
          recruiterUsername: candidate.recruiter,
          recruiterName: recruiterNames.get(candidate.recruiter) ?? null,
          stage: candidate.stage,
          source: candidate.source,
          note: null,
          hireConfirmedBy: stageTimestamps.hireConfirmedBy,
          hireConfirmedAt: stageTimestamps.hireConfirmedAt,
          offeredAt: stageTimestamps.offeredAt,
          onboardedAt: stageTimestamps.onboardedAt,
          rejectedBy: stageTimestamps.rejectedBy,
          rejectionReason: stageTimestamps.rejectionReason,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      candidateIds.set(candidate.name, candidateId);
    }

    // 5. Interviews.
    for (const interview of INTERVIEWS) {
      const candidateId = candidateIds.get(interview.candidate);
      const candidateSeed = CANDIDATES.find(
        (item) => item.name === interview.candidate,
      );
      if (!candidateId || !candidateSeed) continue;
      const positionId = positionIds.get(candidateSeed.position);
      const scheduledAt = new Date(interview.scheduledAt);
      const existing = await query
        .selectFrom('recruitmentInterviews')
        .select(['id', 'scheduledAt'])
        .where('candidateId', '=', candidateId)
        .where('interviewerUsername', '=', interview.interviewer)
        .execute();
      const alreadyScheduled = existing.some(
        (row) =>
          new Date(String(row.scheduledAt)).getTime() === scheduledAt.getTime(),
      );
      if (alreadyScheduled) continue;
      await query
        .insertInto('recruitmentInterviews')
        .values({
          id: crypto.randomUUID(),
          candidateId,
          positionId: positionId ?? '',
          interviewerUsername: interview.interviewer,
          interviewerName: recruiterNames.get(interview.interviewer) ?? null,
          scheduledAt,
          method: interview.method,
          status: interview.status,
          result: interview.result ?? null,
          score: interview.score ?? null,
          evaluation: interview.evaluation ?? null,
          completedAt: interview.status === 'completed' ? scheduledAt : null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // 6. Onboarding todos.
    for (const todo of ONBOARDING_TODOS) {
      const candidateId = candidateIds.get(todo.candidate);
      if (!candidateId) continue;
      const existing = await query
        .selectFrom('recruitmentOnboardingTodos')
        .select('id')
        .where('candidateId', '=', candidateId)
        .where('title', '=', todo.title)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('recruitmentOnboardingTodos')
        .values({
          id: crypto.randomUUID(),
          candidateId,
          title: todo.title,
          status: todo.status,
          dueAt: null,
          completedAt: todo.status === 'done' ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

function grantsForRole(role: string) {
  return (ROLE_PAGES[role] ?? []).map((pageId) => ({
    resource: { type: 'page', id: pageId },
    actions: [{ action: 'access' }],
  }));
}

function stageFields(stage: string, now: Date) {
  const hr = 'hr.manager';
  switch (stage) {
    case 'offered':
      return {
        hireConfirmedBy: hr,
        hireConfirmedAt: now,
        offeredAt: now,
        onboardedAt: null,
        rejectedBy: null,
        rejectionReason: null,
      };
    case 'onboarded':
      return {
        hireConfirmedBy: hr,
        hireConfirmedAt: now,
        offeredAt: now,
        onboardedAt: now,
        rejectedBy: null,
        rejectionReason: null,
      };
    case 'rejected':
      return {
        hireConfirmedBy: null,
        hireConfirmedAt: null,
        offeredAt: null,
        onboardedAt: null,
        rejectedBy: 'recruiter.wang',
        rejectionReason: '与岗位要求不匹配',
      };
    default:
      return {
        hireConfirmedBy: null,
        hireConfirmedAt: null,
        offeredAt: null,
        onboardedAt: null,
        rejectedBy: null,
        rejectionReason: null,
      };
  }
}

export default seed;
