import { defineSeed, type SeedDefinition } from '@nocobase/db';
import type { QueryAdapter } from '@nocobase/db';
// The same hashing Better Auth applies to a credential account, so the demo
// accounts created here sign in through the normal password flow.
import { hashPassword } from 'better-auth/crypto';

/**
 * Demo content for the training application: accounts for each role, the three
 * roles themselves, and a small but complete set of courses, sessions,
 * enrollments, assignments, submissions and review history.
 *
 * Every record is keyed on a stable business identifier and inserted only when
 * absent, so running the seed again leaves existing data untouched.
 */

const DEMO_PASSWORD = 'Train@2026';
const ROLE_ADMIN = 'training-admin';
const ROLE_INSTRUCTOR = 'training-instructor';
const ROLE_STUDENT = 'training-student';

interface DemoUser {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly role: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    id: 'demo-admin',
    name: '培训管理员',
    username: 'admin.train',
    role: ROLE_ADMIN,
  },
  {
    id: 'demo-instructor-li',
    name: '李讲师',
    username: 'instructor.li',
    role: ROLE_INSTRUCTOR,
  },
  {
    id: 'demo-instructor-wang',
    name: '王讲师',
    username: 'instructor.wang',
    role: ROLE_INSTRUCTOR,
  },
  {
    id: 'demo-student-zhao',
    name: '赵一',
    username: 'student.zhao',
    role: ROLE_STUDENT,
  },
  {
    id: 'demo-student-qian',
    name: '钱二',
    username: 'student.qian',
    role: ROLE_STUDENT,
  },
  {
    id: 'demo-student-sun',
    name: '孙三',
    username: 'student.sun',
    role: ROLE_STUDENT,
  },
  {
    id: 'demo-student-li',
    name: '李四',
    username: 'student.li',
    role: ROLE_STUDENT,
  },
  {
    id: 'demo-student-zhou',
    name: '周五',
    username: 'student.zhou',
    role: ROLE_STUDENT,
  },
  {
    id: 'demo-student-wu',
    name: '吴六',
    username: 'student.wu',
    role: ROLE_STUDENT,
  },
];

/**
 * Page ids a role may open. A route's client guard checks
 * `page:<route name>` with the `access` action, so a role with no page grant
 * signs in successfully but sees "Access denied" on every business page. The
 * page ids below must stay in step with the route names in `client/routes.ts`.
 */
const PAGE_CATALOG = 'trainingCatalog';
const PAGE_MY_LEARNING = 'trainingMyLearning';
const PAGE_GRADING = 'trainingGrading';
const PAGE_STATS = 'trainingStats';
const PAGE_MANAGE = 'trainingManage';
const PAGE_SESSION_DETAIL = 'trainingSessionDetail';
const PAGE_ASSIGNMENT_DETAIL = 'trainingAssignmentDetail';

/**
 * Pages every signed-in user may open, independent of an explicit role.
 *
 * Self-registration is how an internal learner gets an account, so a brand
 * new user must be able to browse the catalog and their own learning without
 * an administrator assigning a role first. The direct `training-student` role
 * stays what an administrator grants when someone should be enrollable; this
 * default only carries the read-only pages.
 */
const LEARNER_DEFAULT_SET = 'training-learner';
const LEARNER_DEFAULT_PAGES: readonly string[] = [
  PAGE_CATALOG,
  PAGE_MY_LEARNING,
  PAGE_SESSION_DETAIL,
  PAGE_ASSIGNMENT_DETAIL,
];

const ROLES: readonly {
  key: string;
  title: string;
  pages: readonly string[];
}[] = [
  {
    key: ROLE_ADMIN,
    title: '培训管理员',
    pages: [
      PAGE_CATALOG,
      PAGE_MY_LEARNING,
      PAGE_GRADING,
      PAGE_STATS,
      PAGE_MANAGE,
      PAGE_SESSION_DETAIL,
      PAGE_ASSIGNMENT_DETAIL,
    ],
  },
  {
    key: ROLE_INSTRUCTOR,
    title: '讲师',
    pages: [
      PAGE_CATALOG,
      PAGE_MY_LEARNING,
      PAGE_GRADING,
      PAGE_STATS,
      PAGE_SESSION_DETAIL,
      PAGE_ASSIGNMENT_DETAIL,
    ],
  },
  {
    key: ROLE_STUDENT,
    title: '学员',
    pages: [
      PAGE_CATALOG,
      PAGE_MY_LEARNING,
      PAGE_SESSION_DETAIL,
      PAGE_ASSIGNMENT_DETAIL,
    ],
  },
];

interface DemoCourse {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly level: string;
  readonly status: string;
}

const COURSES: readonly DemoCourse[] = [
  {
    code: 'TRN-101',
    title: '新员工入职培训',
    description: '帮助新同事了解公司文化、制度与岗位职责。',
    category: '通用',
    level: '入门',
    status: 'published',
  },
  {
    code: 'TRN-201',
    title: '销售技能提升',
    description: '围绕客户拜访、话术与方案书编写提升成交能力。',
    category: '销售',
    level: '进阶',
    status: 'published',
  },
  {
    code: 'TRN-301',
    title: '数据安全与合规',
    description: '解读数据分级、权限管理与合规风险处置要求。',
    category: '合规',
    level: '进阶',
    status: 'published',
  },
];

interface DemoSession {
  readonly code: string;
  readonly courseCode: string;
  readonly title: string;
  readonly instructorId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly capacity: number;
  readonly location: string;
  readonly status: string;
  readonly students: readonly string[];
}

const SESSIONS: readonly DemoSession[] = [
  {
    code: 'SES-101-A',
    courseCode: 'TRN-101',
    title: '2026 秋季新员工一班',
    instructorId: 'demo-instructor-li',
    startAt: '2026-08-01T01:00:00.000Z',
    endAt: '2026-09-30T09:00:00.000Z',
    capacity: 30,
    location: '线上直播',
    status: 'in_progress',
    students: [
      'demo-student-zhao',
      'demo-student-qian',
      'demo-student-sun',
      'demo-student-li',
    ],
  },
  {
    code: 'SES-101-B',
    courseCode: 'TRN-101',
    title: '2026 冬季新员工二班',
    instructorId: 'demo-instructor-wang',
    startAt: '2026-11-01T01:00:00.000Z',
    endAt: '2026-12-20T09:00:00.000Z',
    capacity: 25,
    location: '北京总部',
    status: 'planned',
    students: ['demo-student-zhou', 'demo-student-wu'],
  },
  {
    code: 'SES-201-A',
    courseCode: 'TRN-201',
    title: '销售精英进阶班',
    instructorId: 'demo-instructor-li',
    startAt: '2026-08-15T01:00:00.000Z',
    endAt: '2026-10-15T09:00:00.000Z',
    capacity: 20,
    location: '上海分部',
    status: 'in_progress',
    students: ['demo-student-zhao', 'demo-student-qian', 'demo-student-zhou'],
  },
  {
    code: 'SES-301-A',
    courseCode: 'TRN-301',
    title: '数据安全合规集训',
    instructorId: 'demo-instructor-wang',
    startAt: '2026-06-01T01:00:00.000Z',
    endAt: '2026-07-15T09:00:00.000Z',
    capacity: 40,
    location: '线上直播',
    status: 'completed',
    students: ['demo-student-sun', 'demo-student-li', 'demo-student-wu'],
  },
];

interface DemoAssignment {
  readonly sessionCode: string;
  readonly title: string;
  readonly description: string;
  readonly dueAt: string;
  readonly maxScore: number;
  readonly status: string;
}

const ASSIGNMENTS: readonly DemoAssignment[] = [
  {
    sessionCode: 'SES-101-A',
    title: '入职第一周学习心得',
    description: '结合课程内容，写一篇不少于 300 字的学习心得。',
    dueAt: '2026-08-15T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-101-A',
    title: '公司制度测试',
    description: '完成公司规章制度在线测试并说明失分点。',
    dueAt: '2026-09-05T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-101-A',
    title: '岗位实践报告',
    description: '提交岗位实践记录与改进计划。',
    dueAt: '2026-10-10T09:00:00.000Z',
    maxScore: 100,
    status: 'draft',
  },
  {
    sessionCode: 'SES-101-B',
    title: '新员工自我介绍',
    description: '录制一段两分钟的自我介绍视频并提交文字稿。',
    dueAt: '2026-11-20T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-101-B',
    title: '培训出勤与纪律',
    description: '总结出勤与课堂纪律要求。',
    dueAt: '2026-12-10T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-101-B',
    title: '结业总结',
    description: '培训结业总结，包含收获与后续计划。',
    dueAt: '2026-12-18T09:00:00.000Z',
    maxScore: 100,
    status: 'draft',
  },
  {
    sessionCode: 'SES-201-A',
    title: '客户拜访情景演练',
    description: '按给定场景编写拜访脚本并录制演练。',
    dueAt: '2026-09-10T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-201-A',
    title: '销售话术复盘',
    description: '复盘一次真实沟通，分析话术得失。',
    dueAt: '2026-09-25T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-201-A',
    title: '大客户方案书',
    description: '输出一份完整的大客户解决方案书。',
    dueAt: '2026-08-30T09:00:00.000Z',
    maxScore: 100,
    status: 'closed',
  },
  {
    sessionCode: 'SES-301-A',
    title: '数据安全案例分析',
    description: '选取一个真实案例，分析数据泄露成因与处置。',
    dueAt: '2026-07-01T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-301-A',
    title: '合规风险自查',
    description: '提交本岗位合规风险自查清单。',
    dueAt: '2026-07-10T09:00:00.000Z',
    maxScore: 100,
    status: 'published',
  },
  {
    sessionCode: 'SES-301-A',
    title: '安全事件应急演练',
    description: '记录应急演练过程与改进建议。',
    dueAt: '2026-07-15T09:00:00.000Z',
    maxScore: 100,
    status: 'closed',
  },
];

interface DemoSubmission {
  readonly sessionCode: string;
  readonly assignmentTitle: string;
  readonly studentId: string;
  readonly attempt: number;
  readonly status: 'submitted' | 'graded' | 'returned';
  readonly content: string;
  readonly submittedAt: string;
  readonly isLate: boolean;
  readonly score?: number;
  readonly feedback?: string;
  readonly reviewedById?: string;
  readonly reviewedAt?: string;
}

const SUBMISSIONS: readonly DemoSubmission[] = [
  // SES-101-A / 入职第一周学习心得
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '入职第一周学习心得',
    studentId: 'demo-student-zhao',
    attempt: 1,
    status: 'graded',
    content: '这一周我系统了解了公司的发展历程与价值观，收获很大。',
    submittedAt: '2026-08-13T08:00:00.000Z',
    isLate: false,
    score: 88,
    feedback: '结构完整，建议补充一个具体事例。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-08-16T03:00:00.000Z',
  },
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '入职第一周学习心得',
    studentId: 'demo-student-qian',
    attempt: 1,
    status: 'submitted',
    content: '课程内容清晰，我对岗位职责有了更明确的认识。',
    submittedAt: '2026-08-14T10:00:00.000Z',
    isLate: false,
  },
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '入职第一周学习心得',
    studentId: 'demo-student-sun',
    attempt: 1,
    status: 'returned',
    content: '学习心得：公司很好，课程很好。',
    submittedAt: '2026-08-15T06:00:00.000Z',
    isLate: false,
    feedback: '内容过于简略，请结合课程要点补充后再提交。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-08-17T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '入职第一周学习心得',
    studentId: 'demo-student-sun',
    attempt: 2,
    status: 'submitted',
    content:
      '补充版：我重点学习了信息安全制度与考勤规范，并制定了个人学习计划。',
    submittedAt: '2026-08-18T06:00:00.000Z',
    isLate: true,
  },
  // SES-101-A / 公司制度测试
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '公司制度测试',
    studentId: 'demo-student-zhao',
    attempt: 1,
    status: 'graded',
    content: '测试得分 95，失分点在报销流程时限。',
    submittedAt: '2026-09-04T07:00:00.000Z',
    isLate: false,
    score: 95,
    feedback: '完成质量高。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-09-06T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '公司制度测试',
    studentId: 'demo-student-qian',
    attempt: 1,
    status: 'graded',
    content: '测试得分 72，主要失分在假期制度。',
    submittedAt: '2026-09-07T10:00:00.000Z',
    isLate: true,
    score: 72,
    feedback: '逾期提交，请尽快补齐制度学习。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-09-08T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-101-A',
    assignmentTitle: '公司制度测试',
    studentId: 'demo-student-sun',
    attempt: 1,
    status: 'submitted',
    content: '测试得分 80，已复习错题。',
    submittedAt: '2026-09-06T11:00:00.000Z',
    isLate: true,
  },
  // SES-201-A / 客户拜访情景演练
  {
    sessionCode: 'SES-201-A',
    assignmentTitle: '客户拜访情景演练',
    studentId: 'demo-student-zhao',
    attempt: 1,
    status: 'graded',
    content: '按场景完成了拜访脚本与角色演练。',
    submittedAt: '2026-09-09T08:00:00.000Z',
    isLate: false,
    score: 80,
    feedback: '开场提问可以更聚焦客户痛点。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-09-11T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-201-A',
    assignmentTitle: '客户拜访情景演练',
    studentId: 'demo-student-qian',
    attempt: 1,
    status: 'graded',
    content: '提交了拜访脚本，演练录音已上传。',
    submittedAt: '2026-09-12T08:00:00.000Z',
    isLate: true,
    score: 60,
    feedback: '逾期提交，脚本结构需要重写。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-09-13T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-201-A',
    assignmentTitle: '客户拜访情景演练',
    studentId: 'demo-student-zhou',
    attempt: 1,
    status: 'submitted',
    content: '完成演练并记录了客户异议处理过程。',
    submittedAt: '2026-09-10T07:00:00.000Z',
    isLate: false,
  },
  // SES-201-A / 销售话术复盘
  {
    sessionCode: 'SES-201-A',
    assignmentTitle: '销售话术复盘',
    studentId: 'demo-student-zhao',
    attempt: 1,
    status: 'submitted',
    content: '复盘了上周的客户沟通，总结了三条改进点。',
    submittedAt: '2026-09-20T08:00:00.000Z',
    isLate: false,
  },
  {
    sessionCode: 'SES-201-A',
    assignmentTitle: '销售话术复盘',
    studentId: 'demo-student-zhou',
    attempt: 1,
    status: 'returned',
    content: '话术复盘：还需要多练习。',
    submittedAt: '2026-09-21T08:00:00.000Z',
    isLate: false,
    feedback: '缺少具体对话记录，请补充后重做。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-09-22T02:00:00.000Z',
  },
  // SES-201-A / 大客户方案书
  {
    sessionCode: 'SES-201-A',
    assignmentTitle: '大客户方案书',
    studentId: 'demo-student-zhao',
    attempt: 1,
    status: 'graded',
    content: '完成大客户方案书，含预算与实施计划。',
    submittedAt: '2026-08-28T08:00:00.000Z',
    isLate: false,
    score: 90,
    feedback: '方案完整，报价部分可再细化。',
    reviewedById: 'demo-instructor-li',
    reviewedAt: '2026-08-31T02:00:00.000Z',
  },
  // SES-301-A / 数据安全案例分析
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '数据安全案例分析',
    studentId: 'demo-student-sun',
    attempt: 1,
    status: 'graded',
    content: '分析了某公司数据泄露事件，提出三点整改措施。',
    submittedAt: '2026-06-28T08:00:00.000Z',
    isLate: false,
    score: 85,
    feedback: '分析到位。',
    reviewedById: 'demo-instructor-wang',
    reviewedAt: '2026-07-02T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '数据安全案例分析',
    studentId: 'demo-student-li',
    attempt: 1,
    status: 'graded',
    content: '结合岗位实际分析了内部数据外发风险。',
    submittedAt: '2026-06-29T08:00:00.000Z',
    isLate: false,
    score: 78,
    feedback: '建议补充法规依据。',
    reviewedById: 'demo-instructor-wang',
    reviewedAt: '2026-07-02T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '数据安全案例分析',
    studentId: 'demo-student-wu',
    attempt: 1,
    status: 'graded',
    content: '从权限管理角度分析了越权访问案例。',
    submittedAt: '2026-06-30T08:00:00.000Z',
    isLate: false,
    score: 91,
    feedback: '视角新颖。',
    reviewedById: 'demo-instructor-wang',
    reviewedAt: '2026-07-02T02:00:00.000Z',
  },
  // SES-301-A / 合规风险自查
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '合规风险自查',
    studentId: 'demo-student-sun',
    attempt: 1,
    status: 'submitted',
    content: '提交了岗位合规风险自查清单。',
    submittedAt: '2026-07-08T08:00:00.000Z',
    isLate: false,
  },
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '合规风险自查',
    studentId: 'demo-student-li',
    attempt: 1,
    status: 'graded',
    content: '自查清单覆盖数据权限与对外共享。',
    submittedAt: '2026-07-09T08:00:00.000Z',
    isLate: false,
    score: 88,
    feedback: '清单完整。',
    reviewedById: 'demo-instructor-wang',
    reviewedAt: '2026-07-11T02:00:00.000Z',
  },
  // SES-301-A / 安全事件应急演练
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '安全事件应急演练',
    studentId: 'demo-student-sun',
    attempt: 1,
    status: 'graded',
    content: '记录了演练流程与响应时间。',
    submittedAt: '2026-07-13T08:00:00.000Z',
    isLate: false,
    score: 70,
    feedback: '响应流程需要更清晰的升级路径。',
    reviewedById: 'demo-instructor-wang',
    reviewedAt: '2026-07-16T02:00:00.000Z',
  },
  {
    sessionCode: 'SES-301-A',
    assignmentTitle: '安全事件应急演练',
    studentId: 'demo-student-wu',
    attempt: 1,
    status: 'graded',
    content: '提交演练记录与改进建议。',
    submittedAt: '2026-07-14T08:00:00.000Z',
    isLate: false,
    score: 65,
    feedback: '建议补充复盘会议结论。',
    reviewedById: 'demo-instructor-wang',
    reviewedAt: '2026-07-16T02:00:00.000Z',
  },
  // SES-101-B / 新员工自我介绍
  {
    sessionCode: 'SES-101-B',
    assignmentTitle: '新员工自我介绍',
    studentId: 'demo-student-zhou',
    attempt: 1,
    status: 'submitted',
    content: '提交了自我介绍文字稿与视频链接。',
    submittedAt: '2026-11-18T08:00:00.000Z',
    isLate: false,
  },
  // SES-101-B / 培训出勤与纪律
  {
    sessionCode: 'SES-101-B',
    assignmentTitle: '培训出勤与纪律',
    studentId: 'demo-student-wu',
    attempt: 1,
    status: 'submitted',
    content: '总结了出勤与课堂纪律要求。',
    submittedAt: '2026-12-08T08:00:00.000Z',
    isLate: false,
  },
];

interface SeedContext {
  readonly query: QueryAdapter;
}

const seed: SeedDefinition = defineSeed({
  name: '202609190002_seed_training_demo',

  async run({ query }) {
    const context: SeedContext = { query };
    const now = new Date();

    await seedUsers(context, now);
    await seedRoles(context, now);
    await seedCourses(context, now);
    await seedSessions(context, now);
    await seedAssignments(context, now);
    await seedSubmissions(context, now);
  },
});

async function seedUsers({ query }: SeedContext, now: Date): Promise<void> {
  for (const user of DEMO_USERS) {
    const existingUser = await query
      .selectFrom('user')
      .select('id')
      .where('id', '=', user.id)
      .executeTakeFirst();
    if (!existingUser) {
      const email = `${user.username}@example.com`;
      await query
        .insertInto('user')
        .values({
          id: user.id,
          name: user.name,
          username: user.username,
          email,
          emailVerified: true,
          image: null,
          disabledAt: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const existingAccount = await query
      .selectFrom('account')
      .select('id')
      .where('issuer', '=', 'local:credential')
      .where('accountId', '=', user.id)
      .executeTakeFirst();
    if (!existingAccount) {
      await query
        .insertInto('account')
        .values({
          id: `demo-account-${user.id}`,
          issuer: 'local:credential',
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          accessToken: null,
          refreshToken: null,
          idToken: null,
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          scope: null,
          password: await hashPassword(DEMO_PASSWORD),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  }
}

async function seedRoles({ query }: SeedContext, now: Date): Promise<void> {
  const hasPermissionSets = await tableExists(
    query,
    'authorizationPermissionSets',
  );
  if (!hasPermissionSets) return;

  for (const role of ROLES) {
    const desiredGrants = pageAccessGrants(role.pages);
    const existing = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', role.key)
      .executeTakeFirst();
    if (!existing) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: `demo-permission-set-${role.key}`,
          key: role.key,
          title: role.title,
          grants: JSON.stringify(desiredGrants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      continue;
    }
    // Repair a permission set that exists without the page access this role
    // needs (for example a set created before page grants were seeded). Merge
    // instead of replacing so an administrator's other grants survive.
    const grants = mergeGrants(parseGrants(existing.grants), desiredGrants);
    if (grants === undefined) continue;
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(grants), updatedAt: now })
      .where('key', '=', role.key)
      .execute();
  }

  const hasAssignments = await tableExists(
    query,
    'authorizationPermissionSetAssignments',
  );
  if (!hasAssignments) return;

  for (const user of DEMO_USERS) {
    const existing = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', user.id)
      .where('permissionSetKey', '=', user.role)
      .executeTakeFirst();
    if (existing) continue;
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: `demo-assignment-${user.id}-${user.role}`,
        subjectType: 'user',
        subjectId: user.id,
        permissionSetKey: user.role,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  await seedLearnerDefault(query, now);
}

/**
 * Grants the read-only learner pages to every signed-in user through the
 * `authenticated` audience, so a self-registered account can open the catalog
 * and its own learning before an administrator assigns a role.
 */
async function seedLearnerDefault(
  query: QueryAdapter,
  now: Date,
): Promise<void> {
  const desiredGrants = pageAccessGrants(LEARNER_DEFAULT_PAGES);
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', LEARNER_DEFAULT_SET)
    .executeTakeFirst();
  if (!existing) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: `demo-permission-set-${LEARNER_DEFAULT_SET}`,
        key: LEARNER_DEFAULT_SET,
        title: '学员（默认）',
        grants: JSON.stringify(desiredGrants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  } else {
    const grants = mergeGrants(parseGrants(existing.grants), desiredGrants);
    if (grants !== undefined) {
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(grants), updatedAt: now })
        .where('key', '=', LEARNER_DEFAULT_SET)
        .execute();
    }
  }

  const assignmentId = `authenticated:*:${LEARNER_DEFAULT_SET}`;
  const assignment = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', assignmentId)
    .executeTakeFirst();
  if (assignment) return;
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: assignmentId,
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSetKey: LEARNER_DEFAULT_SET,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function seedCourses({ query }: SeedContext, now: Date): Promise<void> {
  for (const course of COURSES) {
    const existing = await findCourseId(query, course.code);
    if (existing) continue;
    await query
      .insertInto('trainingCourses')
      .values({
        code: course.code,
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        status: course.status,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

async function seedSessions({ query }: SeedContext, now: Date): Promise<void> {
  for (const session of SESSIONS) {
    const courseId = await findCourseId(query, session.courseCode);
    if (!courseId) continue;
    const existing = await findSessionId(query, session.code);
    if (!existing) {
      await query
        .insertInto('trainingSessions')
        .values({
          code: session.code,
          courseId,
          title: session.title,
          instructorId: session.instructorId,
          startAt: new Date(session.startAt),
          endAt: new Date(session.endAt),
          capacity: session.capacity,
          location: session.location,
          status: session.status,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const sessionId = await findSessionId(query, session.code);
    if (!sessionId) continue;
    for (const studentId of session.students) {
      const enrolled = await query
        .selectFrom('trainingEnrollments')
        .select('id')
        .where('sessionId', '=', sessionId)
        .where('studentId', '=', studentId)
        .executeTakeFirst();
      if (enrolled) continue;
      await query
        .insertInto('trainingEnrollments')
        .values({
          sessionId,
          studentId,
          status: 'active',
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  }
}

async function seedAssignments(
  { query }: SeedContext,
  now: Date,
): Promise<void> {
  for (const assignment of ASSIGNMENTS) {
    const sessionId = await findSessionId(query, assignment.sessionCode);
    if (!sessionId) continue;
    const existing = await findAssignmentId(query, sessionId, assignment.title);
    if (existing) continue;
    await query
      .insertInto('trainingAssignments')
      .values({
        sessionId,
        title: assignment.title,
        description: assignment.description,
        dueAt: new Date(assignment.dueAt),
        maxScore: assignment.maxScore,
        status: assignment.status,
        publishedAt:
          assignment.status === 'draft' ? null : new Date(assignment.dueAt),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

async function seedSubmissions(
  { query }: SeedContext,
  now: Date,
): Promise<void> {
  for (const submission of SUBMISSIONS) {
    const sessionId = await findSessionId(query, submission.sessionCode);
    if (!sessionId) continue;
    const assignmentId = await findAssignmentId(
      query,
      sessionId,
      submission.assignmentTitle,
    );
    if (!assignmentId) continue;
    const existing = await query
      .selectFrom('trainingSubmissions')
      .select('id')
      .where('assignmentId', '=', assignmentId)
      .where('studentId', '=', submission.studentId)
      .where('attempt', '=', submission.attempt)
      .executeTakeFirst();
    if (existing) continue;

    await query
      .insertInto('trainingSubmissions')
      .values({
        assignmentId,
        studentId: submission.studentId,
        attempt: submission.attempt,
        content: submission.content,
        status: submission.status,
        isLate: submission.isLate,
        submittedAt: new Date(submission.submittedAt),
        score: submission.score ?? null,
        feedback: submission.feedback ?? null,
        reviewedById: submission.reviewedById ?? null,
        reviewedAt: submission.reviewedAt
          ? new Date(submission.reviewedAt)
          : null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    if (submission.status === 'submitted') continue;
    const submissionRow = await query
      .selectFrom('trainingSubmissions')
      .select('id')
      .where('assignmentId', '=', assignmentId)
      .where('studentId', '=', submission.studentId)
      .where('attempt', '=', submission.attempt)
      .executeTakeFirst();
    const submissionId = submissionRow ? Number(submissionRow.id) : undefined;
    if (submissionId === undefined) continue;
    const existingReview = await query
      .selectFrom('trainingSubmissionReviews')
      .select('id')
      .where('submissionId', '=', submissionId)
      .where('attempt', '=', submission.attempt)
      .executeTakeFirst();
    if (existingReview) continue;
    await query
      .insertInto('trainingSubmissionReviews')
      .values({
        submissionId,
        attempt: submission.attempt,
        decision: submission.status,
        score: submission.score ?? null,
        feedback: submission.feedback ?? '已评阅。',
        reviewerId: submission.reviewedById ?? 'demo-instructor-li',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

async function findCourseId(
  query: QueryAdapter,
  code: string,
): Promise<number | undefined> {
  const row = await query
    .selectFrom('trainingCourses')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirst();
  return row ? Number(row.id) : undefined;
}

async function findSessionId(
  query: QueryAdapter,
  code: string,
): Promise<number | undefined> {
  const row = await query
    .selectFrom('trainingSessions')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirst();
  return row ? Number(row.id) : undefined;
}

async function findAssignmentId(
  query: QueryAdapter,
  sessionId: number,
  title: string,
): Promise<number | undefined> {
  const row = await query
    .selectFrom('trainingAssignments')
    .select('id')
    .where('sessionId', '=', sessionId)
    .where('title', '=', title)
    .executeTakeFirst();
  return row ? Number(row.id) : undefined;
}

async function tableExists(
  query: QueryAdapter,
  table: string,
): Promise<boolean> {
  try {
    await query.selectFrom(table).select('id').limit(1).execute();
    return true;
  } catch {
    return false;
  }
}

interface PermissionGrantRecord {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

interface MutablePermissionGrant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

function pageAccessGrants(pages: readonly string[]): PermissionGrantRecord[] {
  return pages.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

function parseGrants(value: unknown): PermissionGrantRecord[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isPermissionGrantRecord);
}

/**
 * Adds any missing desired grant without discarding grants an administrator
 * configured. Returns `undefined` when nothing changed so the caller can skip
 * the write and keep the seed idempotent.
 */
function mergeGrants(
  existing: readonly PermissionGrantRecord[],
  desired: readonly PermissionGrantRecord[],
): PermissionGrantRecord[] | undefined {
  const merged: MutablePermissionGrant[] = existing.map((grant) => ({
    resource: { ...grant.resource },
    actions: grant.actions.map((action) => ({ ...action })),
  }));
  let changed = false;

  for (const wanted of desired) {
    const target = merged.find(
      (grant) =>
        grant.resource.type === wanted.resource.type &&
        grant.resource.id === wanted.resource.id,
    );
    if (!target) {
      merged.push({
        resource: { ...wanted.resource },
        actions: wanted.actions.map((action) => ({ ...action })),
      });
      changed = true;
      continue;
    }
    for (const action of wanted.actions) {
      if (target.actions.some((current) => current.action === action.action)) {
        continue;
      }
      target.actions.push({ ...action });
      changed = true;
    }
  }

  return changed ? merged : undefined;
}

function isPermissionGrantRecord(
  value: unknown,
): value is PermissionGrantRecord {
  if (!isRecord(value) || !isRecord(value.resource)) return false;
  if (
    typeof value.resource.type !== 'string' ||
    typeof value.resource.id !== 'string' ||
    !Array.isArray(value.actions)
  ) {
    return false;
  }
  return value.actions.every(
    (action) => isRecord(action) && typeof action.action === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export default seed;
