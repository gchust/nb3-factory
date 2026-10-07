import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * A small, realistic starting project so the feature is not empty on a fresh install.
 *
 * It is keyed on stable, hand-written ids and runs only when the application owns no project yet, so a repeated
 * `db apply` is a no-op and a user who deletes the sample keeps it deleted. It never invents an owner: the sample is
 * created for the initial administrator, and the seed does nothing when no account exists yet.
 */
const SAMPLE_PROJECT_ID = 'a1000000-0000-4000-8000-000000000001';
const SAMPLE_MEMBER_USER_ID = 'a1000000-0000-4000-8000-000000000002';
const SAMPLE_MILESTONE_ONE_ID = 'a1000000-0000-4000-8000-000000000011';
const SAMPLE_MILESTONE_TWO_ID = 'a1000000-0000-4000-8000-000000000012';
const SAMPLE_TASK_DONE_ID = 'a1000000-0000-4000-8000-000000000021';
const SAMPLE_TASK_ACTIVE_ID = 'a1000000-0000-4000-8000-000000000022';
const SAMPLE_TASK_REVIEW_ID = 'a1000000-0000-4000-8000-000000000023';
const SAMPLE_DELIVERABLE_ID = 'a1000000-0000-4000-8000-000000000031';

export default defineSeed({
  name: '20261215090002_seed_project_collaboration_sample',

  async run(context) {
    const { query } = context;
    const existingProject = await query
      .selectFrom('projects')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existingProject) return;

    const owner = await query
      .selectFrom('user')
      .select(['id'])
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();
    // Before the administrator exists there is nobody to own the sample; the next run picks it up.
    if (!owner) return;

    const ownerId = String(owner.id);
    const now = new Date();
    const due = (offsetDays: number): string => {
      const date = new Date(now.getTime() + offsetDays * 86_400_000);
      return date.toISOString().slice(0, 10);
    };

    // A colleague, so membership filtering and per-assignee reminders have something to demonstrate. Created
    // through the same account shape the authentication plugin's own default administrator seed uses.
    const member = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'lisi')
      .executeTakeFirst();
    const memberId = member ? String(member.id) : SAMPLE_MEMBER_USER_ID;
    if (!member) {
      await query
        .insertInto('user')
        .values({
          id: memberId,
          name: '李四',
          username: 'lisi',
          email: 'lisi@example.com',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: 'a1000000-0000-4000-8000-000000000003',
          accountId: memberId,
          providerId: 'credential',
          userId: memberId,
          password: await hashPassword('admin123'),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    await context.repository('projects').createOne({
      values: {
        id: SAMPLE_PROJECT_ID,
        name: 'Apollo 客户端重构',
        description:
          '把桌面客户端拆分为可独立发布的模块，并完成一轮完整的成果验收。',
        status: 'active',
        ownerId,
        startDate: due(-14),
        endDate: due(30),
        createdAt: now,
        updatedAt: now,
      },
    });

    await context.repository('project_members').createMany({
      values: [
        {
          id: 'a1000000-0000-4000-8000-000000000041',
          projectId: SAMPLE_PROJECT_ID,
          userId: ownerId,
          role: 'owner',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'a1000000-0000-4000-8000-000000000042',
          projectId: SAMPLE_PROJECT_ID,
          userId: memberId,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await context.repository('milestones').createMany({
      values: [
        {
          id: SAMPLE_MILESTONE_ONE_ID,
          projectId: SAMPLE_PROJECT_ID,
          name: '需求与方案确认',
          description: '确认拆分方案和交付标准。',
          dueDate: due(-7),
          status: 'completed',
          position: 1,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SAMPLE_MILESTONE_TWO_ID,
          projectId: SAMPLE_PROJECT_ID,
          name: '核心模块开发完成',
          description: '核心模块开发完成并通过评审。',
          dueDate: due(14),
          status: 'in_progress',
          position: 2,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await context.repository('tasks').createMany({
      values: [
        {
          id: SAMPLE_TASK_DONE_ID,
          projectId: SAMPLE_PROJECT_ID,
          milestoneId: SAMPLE_MILESTONE_ONE_ID,
          title: '梳理模块边界',
          description: '输出模块划分文档。',
          assigneeId: ownerId,
          status: 'completed',
          priority: 'high',
          dueDate: due(-8),
          required: true,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SAMPLE_TASK_ACTIVE_ID,
          projectId: SAMPLE_PROJECT_ID,
          milestoneId: SAMPLE_MILESTONE_TWO_ID,
          title: '拆分核心模块',
          description: '完成核心模块的拆分与自测。',
          assigneeId: memberId,
          status: 'in_progress',
          priority: 'high',
          dueDate: due(3),
          required: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SAMPLE_TASK_REVIEW_ID,
          projectId: SAMPLE_PROJECT_ID,
          milestoneId: SAMPLE_MILESTONE_TWO_ID,
          title: '完善接口文档',
          description: '补齐对外接口说明并提交验收。',
          assigneeId: memberId,
          status: 'pending_acceptance',
          priority: 'normal',
          dueDate: due(-1),
          required: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await context.repository('deliverables').createOne({
      values: {
        id: SAMPLE_DELIVERABLE_ID,
        taskId: SAMPLE_TASK_REVIEW_ID,
        projectId: SAMPLE_PROJECT_ID,
        submitterId: memberId,
        title: '接口文档 v1',
        description: '第一版对外接口文档，等待项目负责人验收。',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    });
  },
});
