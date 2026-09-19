import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Fictional delivery data: two unrelated teams, an independent acceptor, four
 * projects, ten milestones, twenty-four tasks and five delivery applications
 * covering pending, returned and approved states.
 *
 * Every row is keyed by a natural business key and only inserted when absent,
 * so a repeated run changes nothing.
 */
const PROJECTS = [
  {
    code: 'PRJ-2026-001',
    name: '企业官网改版',
    manager: 'zhangwei',
    startDate: '2026-01-05',
    endDate: '2026-06-30',
    status: 'active',
    description: '面向品牌客户的企业官网整体改版，覆盖内容、视觉与前端实现。',
    members: ['lina', 'wangfang'],
    milestones: [
      {
        name: '需求调研',
        dueDate: '2026-02-10',
        status: 'completed',
        description: '',
        tasks: [
          {
            title: '竞品分析',
            assignee: 'lina',
            priority: 'high',
            planDate: '2026-01-20',
            actualDate: '2026-01-18',
            status: 'done',
          },
          {
            title: '用户访谈',
            assignee: 'wangfang',
            priority: 'medium',
            planDate: '2026-02-01',
            actualDate: '2026-02-03',
            status: 'done',
          },
          {
            title: '需求说明书',
            assignee: 'lina',
            priority: 'high',
            planDate: '2026-02-08',
            actualDate: '2026-02-08',
            status: 'done',
          },
        ],
      },
      {
        name: '视觉设计',
        dueDate: '2026-03-20',
        status: 'in_progress',
        description: '',
        tasks: [
          {
            title: '首页视觉稿',
            assignee: 'wangfang',
            priority: 'high',
            planDate: '2026-03-05',
            actualDate: null,
            status: 'in_progress',
          },
          {
            title: '内页视觉稿',
            assignee: 'lina',
            priority: 'medium',
            planDate: '2026-03-15',
            actualDate: null,
            status: 'todo',
          },
          {
            title: '设计评审',
            assignee: 'zhangwei',
            priority: 'medium',
            planDate: '2026-03-20',
            actualDate: null,
            status: 'todo',
          },
        ],
      },
      {
        name: '前端开发',
        dueDate: '2026-05-15',
        status: 'pending',
        description: '',
        tasks: [
          {
            title: '页面搭建',
            assignee: 'lina',
            priority: 'high',
            planDate: '2026-04-20',
            actualDate: null,
            status: 'todo',
          },
          {
            title: '响应式适配',
            assignee: 'wangfang',
            priority: 'medium',
            planDate: '2026-05-10',
            actualDate: null,
            status: 'todo',
          },
        ],
      },
    ],
  },
  {
    code: 'PRJ-2026-002',
    name: '移动端 App 开发',
    manager: 'zhangwei',
    startDate: '2026-02-01',
    endDate: '2026-08-31',
    status: 'active',
    description: '面向现有客户推出移动端 App，覆盖登录、消息与性能优化。',
    members: ['lina', 'wangfang'],
    milestones: [
      {
        // All tasks are done but nothing has been submitted for acceptance
        // yet, so the milestone is still in progress. `completed` is reserved
        // for a milestone whose delivery application was approved.
        name: '技术选型',
        dueDate: '2026-03-01',
        status: 'in_progress',
        description: '',
        tasks: [
          {
            title: '框架调研',
            assignee: 'lina',
            priority: 'medium',
            planDate: '2026-02-20',
            actualDate: '2026-02-19',
            status: 'done',
          },
          {
            title: '技术方案评审',
            assignee: 'wangfang',
            priority: 'high',
            planDate: '2026-02-28',
            actualDate: '2026-03-01',
            status: 'done',
          },
        ],
      },
      {
        name: '核心功能开发',
        dueDate: '2026-06-30',
        status: 'in_progress',
        description: '',
        tasks: [
          {
            // 核心功能开发 carries a pending delivery application, and a
            // milestone may only be submitted once every task is done.
            title: '登录模块',
            assignee: 'lina',
            priority: 'high',
            planDate: '2026-05-10',
            actualDate: '2026-05-08',
            status: 'done',
          },
          {
            title: '消息推送',
            assignee: 'wangfang',
            priority: 'medium',
            planDate: '2026-06-10',
            actualDate: '2026-06-08',
            status: 'done',
          },
          {
            title: '性能优化',
            assignee: 'lina',
            priority: 'medium',
            planDate: '2026-06-25',
            actualDate: '2026-06-22',
            status: 'done',
          },
        ],
      },
      {
        name: '灰度发布',
        dueDate: '2026-08-15',
        status: 'pending',
        description: '',
        tasks: [
          {
            title: '灰度方案',
            assignee: 'wangfang',
            priority: 'medium',
            planDate: '2026-08-01',
            actualDate: null,
            status: 'todo',
          },
          {
            title: '发布检查',
            assignee: 'zhangwei',
            priority: 'high',
            planDate: '2026-08-15',
            actualDate: null,
            status: 'todo',
          },
        ],
      },
    ],
  },
  {
    code: 'PRJ-2026-003',
    name: '数据中台建设',
    manager: 'liuyang',
    startDate: '2026-03-01',
    endDate: '2026-10-31',
    status: 'active',
    description: '统一数据源接入与指标口径，支撑管理驾驶舱报表。',
    members: ['zhaolei', 'sunqi'],
    milestones: [
      {
        // Tasks done, delivery not submitted yet: still in progress.
        name: '数据源接入',
        dueDate: '2026-05-01',
        status: 'in_progress',
        description: '',
        tasks: [
          {
            title: '数据源清单',
            assignee: 'zhaolei',
            priority: 'medium',
            planDate: '2026-04-10',
            actualDate: '2026-04-12',
            status: 'done',
          },
          {
            title: '接入脚本',
            assignee: 'sunqi',
            priority: 'high',
            planDate: '2026-04-28',
            actualDate: '2026-04-30',
            status: 'done',
          },
        ],
      },
      {
        name: '指标口径梳理',
        dueDate: '2026-07-15',
        status: 'in_progress',
        description: '',
        tasks: [
          {
            // 指标口径梳理 has returned and resubmitted applications, which
            // requires every task in the milestone to be done.
            title: '指标定义文档',
            assignee: 'zhaolei',
            priority: 'high',
            planDate: '2026-06-20',
            actualDate: '2026-06-18',
            status: 'done',
          },
          {
            title: '口径评审',
            assignee: 'sunqi',
            priority: 'medium',
            planDate: '2026-07-10',
            actualDate: '2026-07-08',
            status: 'done',
          },
          {
            title: '数据校验脚本',
            assignee: 'zhaolei',
            priority: 'high',
            planDate: '2026-07-15',
            actualDate: '2026-07-13',
            status: 'done',
          },
        ],
      },
      {
        name: '报表上线',
        dueDate: '2026-09-30',
        status: 'pending',
        description: '',
        tasks: [
          {
            title: '报表模板',
            assignee: 'sunqi',
            priority: 'medium',
            planDate: '2026-09-10',
            actualDate: null,
            status: 'todo',
          },
          {
            title: '上线演练',
            assignee: 'liuyang',
            priority: 'high',
            planDate: '2026-09-25',
            actualDate: null,
            status: 'todo',
          },
        ],
      },
    ],
  },
  {
    code: 'PRJ-2026-004',
    name: '供应链协同系统',
    manager: 'liuyang',
    startDate: '2026-04-01',
    endDate: '2026-12-31',
    status: 'active',
    description: '与核心供应商打通订单与库存协同，先完成供应商调研。',
    members: ['zhaolei', 'sunqi'],
    milestones: [
      {
        name: '供应商调研',
        dueDate: '2026-06-01',
        status: 'completed',
        description: '',
        tasks: [
          {
            title: '供应商访谈',
            assignee: 'zhaolei',
            priority: 'medium',
            planDate: '2026-05-10',
            actualDate: '2026-05-12',
            status: 'done',
          },
          {
            title: '调研报告',
            assignee: 'sunqi',
            priority: 'high',
            planDate: '2026-05-28',
            actualDate: '2026-05-30',
            status: 'done',
          },
        ],
      },
    ],
  },
] as const;

interface SubmissionSpec {
  readonly project: string;
  readonly milestone: string;
  readonly applicant: string;
  readonly reviewer: string;
  readonly round: number;
  readonly status: string;
  readonly note: string;
  readonly previousRound: number | null;
  readonly comments: readonly {
    action: string;
    author: string;
    content: string;
  }[];
  /** Version of the named task used by this round; every other task uses v1. */
  readonly versionOverrides?: Readonly<Record<string, number>>;
}

const SUBMISSIONS: readonly SubmissionSpec[] = [
  {
    project: 'PRJ-2026-001',
    milestone: '需求调研',
    applicant: 'zhangwei',
    reviewer: 'chenjing',
    round: 1,
    status: 'approved',
    note: '需求阶段成果已整理完毕，请验收。',
    previousRound: null,
    comments: [
      {
        action: 'approve',
        author: 'chenjing',
        content: '成果齐全，验收通过。',
      },
    ],
  },
  {
    project: 'PRJ-2026-002',
    milestone: '核心功能开发',
    applicant: 'zhangwei',
    reviewer: 'chenjing',
    round: 1,
    status: 'pending',
    note: '登录模块与消息推送已完成，请验收当前开发成果。',
    previousRound: null,
    comments: [],
  },
  {
    project: 'PRJ-2026-003',
    milestone: '指标口径梳理',
    applicant: 'liuyang',
    reviewer: 'zhoumin',
    round: 1,
    status: 'returned',
    note: '指标口径第一版整理完成，请验收。',
    previousRound: null,
    comments: [
      {
        action: 'return',
        author: 'zhoumin',
        content: '指标口径未覆盖成本维度，且校验脚本缺失，请补充后重新提交。',
      },
    ],
  },
  {
    project: 'PRJ-2026-003',
    milestone: '指标口径梳理',
    applicant: 'liuyang',
    reviewer: 'zhoumin',
    round: 2,
    status: 'pending',
    note: '已按退回意见补充成本维度，并提交第二版指标定义文档。',
    previousRound: 1,
    comments: [
      {
        action: 'resubmit',
        author: 'liuyang',
        content: '已补充成本维度定义，重新提交第二版。',
      },
    ],
    versionOverrides: { 指标定义文档: 2 },
  },
  {
    project: 'PRJ-2026-004',
    milestone: '供应商调研',
    applicant: 'liuyang',
    reviewer: 'zhoumin',
    round: 1,
    status: 'approved',
    note: '供应商调研报告已完成，请验收。',
    previousRound: null,
    comments: [
      {
        action: 'approve',
        author: 'zhoumin',
        content: '调研结论清晰，验收通过。',
      },
    ],
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190002_seed_delivery_demo_data',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('delivery_projects'))) return;
    if (!(await client.schema.hasTable('user'))) return;

    const userRows = await query
      .selectFrom('user')
      .select(['id', 'username'])
      .execute();
    const userIds = new Map<string, string>();
    for (const row of userRows) {
      if (typeof row.username === 'string')
        userIds.set(row.username, String(row.id));
    }
    const required = [
      'zhangwei',
      'lina',
      'wangfang',
      'liuyang',
      'zhaolei',
      'sunqi',
      'chenjing',
      'zhoumin',
    ];
    if (required.some((username) => !userIds.has(username))) return;

    // projectId + '|' + milestoneName + '|' + taskTitle -> version id
    const versionIds = new Map<string, number>();

    for (const project of PROJECTS) {
      const managerId = userIds.get(project.manager)!;
      let projectId = await findId(
        query,
        'deliveryProjects',
        'code',
        project.code,
      );
      if (!projectId) {
        await query
          .insertInto('deliveryProjects')
          .values({
            code: project.code,
            name: project.name,
            managerId,
            startDate: project.startDate,
            endDate: project.endDate,
            status: project.status,
            description: project.description,
            createdById: managerId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
        projectId = await findId(
          query,
          'deliveryProjects',
          'code',
          project.code,
        );
      }
      if (!projectId) continue;

      const memberIds = [project.manager, ...project.members];
      for (const username of memberIds) {
        const memberId = userIds.get(username)!;
        await insertOnce(
          query,
          'deliveryProjectMembers',
          { projectId, userId: memberId },
          {
            projectId,
            userId: memberId,
            role: username === project.manager ? 'manager' : 'member',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        );
      }

      for (const milestone of project.milestones) {
        let milestoneId = await findId(
          query,
          'deliveryMilestones',
          'projectId',
          projectId,
          { name: milestone.name },
        );
        if (!milestoneId) {
          await query
            .insertInto('deliveryMilestones')
            .values({
              projectId,
              name: milestone.name,
              dueDate: milestone.dueDate,
              status: milestone.status,
              description: milestone.description,
              createdById: managerId,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .execute();
          milestoneId = await findId(
            query,
            'deliveryMilestones',
            'projectId',
            projectId,
            { name: milestone.name },
          );
        }
        if (!milestoneId) continue;

        for (const task of milestone.tasks) {
          const assigneeId = userIds.get(task.assignee)!;
          let taskId = await findId(
            query,
            'deliveryTasks',
            'milestoneId',
            milestoneId,
            { title: task.title },
          );
          if (!taskId) {
            await query
              .insertInto('deliveryTasks')
              .values({
                milestoneId,
                projectId,
                title: task.title,
                assigneeId,
                priority: task.priority,
                planDate: task.planDate,
                actualDate: task.actualDate,
                status: task.status,
                createdById: managerId,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .execute();
            taskId = await findId(
              query,
              'deliveryTasks',
              'milestoneId',
              milestoneId,
              {
                title: task.title,
              },
            );
          }
          if (!taskId) continue;

          const resultTitle = `${task.title}交付物`;
          let resultId = await findId(
            query,
            'deliveryTaskResults',
            'taskId',
            taskId,
            { title: resultTitle },
          );
          if (!resultId) {
            await query
              .insertInto('deliveryTaskResults')
              .values({
                taskId,
                title: resultTitle,
                createdById: assigneeId,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .execute();
            resultId = await findId(
              query,
              'deliveryTaskResults',
              'taskId',
              taskId,
              { title: resultTitle },
            );
          }
          if (!resultId) continue;

          const versionNo =
            SUBMISSIONS.flatMap((spec) =>
              Object.entries(spec.versionOverrides ?? {}),
            ).find(([title]) => title === task.title)?.[1] ?? 1;
          for (const candidate of [1, versionNo]) {
            const versionId = await findId(
              query,
              'deliveryTaskResultVersions',
              'resultId',
              resultId,
              { versionNo: candidate },
            );
            if (versionId) {
              versionIds.set(
                `${project.code}|${milestone.name}|${task.title}|${candidate}`,
                versionId,
              );
              continue;
            }
            await query
              .insertInto('deliveryTaskResultVersions')
              .values({
                resultId,
                versionNo: candidate,
                note:
                  candidate === 1
                    ? '初版成果，供评审使用。'
                    : '补充成本维度后的第二版成果。',
                createdById: assigneeId,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .execute();
            const created = await findId(
              query,
              'deliveryTaskResultVersions',
              'resultId',
              resultId,
              { versionNo: candidate },
            );
            if (created) {
              versionIds.set(
                `${project.code}|${milestone.name}|${task.title}|${candidate}`,
                created,
              );
            }
          }
        }
      }
    }

    for (const spec of SUBMISSIONS) {
      const project = PROJECTS.find((item) => item.code === spec.project);
      const milestone = project?.milestones.find(
        (item) => item.name === spec.milestone,
      );
      if (!project || !milestone) continue;
      const projectId = await findId(
        query,
        'deliveryProjects',
        'code',
        spec.project,
      );
      if (!projectId) continue;
      const milestoneId = await findId(
        query,
        'deliveryMilestones',
        'projectId',
        projectId,
        { name: spec.milestone },
      );
      if (!milestoneId) continue;

      let submissionId = await findId(
        query,
        'deliverySubmissions',
        'milestoneId',
        milestoneId,
        { round: spec.round },
      );
      if (!submissionId) {
        let previousSubmissionId: number | null = null;
        if (spec.previousRound !== null) {
          previousSubmissionId =
            (await findId(
              query,
              'deliverySubmissions',
              'milestoneId',
              milestoneId,
              {
                round: spec.previousRound,
              },
            )) ?? null;
        }
        await query
          .insertInto('deliverySubmissions')
          .values({
            projectId,
            milestoneId,
            applicantId: userIds.get(spec.applicant)!,
            reviewerId: userIds.get(spec.reviewer)!,
            status: spec.status,
            note: spec.note,
            previousSubmissionId,
            round: spec.round,
            decidedAt: spec.status === 'pending' ? null : new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
        submissionId = await findId(
          query,
          'deliverySubmissions',
          'milestoneId',
          milestoneId,
          { round: spec.round },
        );
      }
      if (!submissionId) continue;

      for (const task of milestone.tasks) {
        const versionNo = spec.versionOverrides?.[task.title] ?? 1;
        const versionId = versionIds.get(
          `${spec.project}|${spec.milestone}|${task.title}|${versionNo}`,
        );
        if (!versionId) continue;
        await insertOnce(
          query,
          'deliverySubmissionItems',
          { submissionId, resultVersionId: versionId },
          {
            submissionId,
            resultVersionId: versionId,
            createdAt: new Date(),
          },
        );
      }

      for (const comment of spec.comments) {
        await insertOnce(
          query,
          'deliverySubmissionComments',
          { submissionId, action: comment.action },
          {
            submissionId,
            authorId: userIds.get(comment.author)!,
            action: comment.action,
            content: comment.content,
            createdAt: new Date(),
          },
        );
      }
    }
  },
});

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

async function findId(
  query: QueryAdapter,
  table: string,
  column: string,
  value: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<number | undefined> {
  let builder = query
    .selectFrom(table)
    .select(['id'])
    .where(column, '=', value);
  for (const [key, expected] of Object.entries(extra)) {
    builder = builder.where(key, '=', expected);
  }
  const row = await builder.executeTakeFirst();
  return row ? Number(row.id) : undefined;
}

async function insertOnce(
  query: QueryAdapter,
  table: string,
  key: Readonly<Record<string, unknown>>,
  values: Readonly<Record<string, unknown>>,
): Promise<void> {
  const columns = Object.keys(key);
  const criteria = Object.values(key);
  let builder = query.selectFrom(table).select(['id']);
  for (let index = 0; index < columns.length; index += 1) {
    builder = builder.where(columns[index], '=', criteria[index]);
  }
  const existing = await builder.executeTakeFirst();
  if (existing) return;
  await query.insertInto(table).values(values).execute();
}

export default seed;
