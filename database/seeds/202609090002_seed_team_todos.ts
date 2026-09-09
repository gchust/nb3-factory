import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Six sample team todos covering all three statuses (two each) and both
 * priorities. Idempotent: a todo is inserted only when no record with the
 * same title exists, so re-running the seed never duplicates records.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609090002_seed_team_todos',

  async run({ query }) {
    const existing = await query
      .selectFrom('teamTodos')
      .select('title')
      .execute();
    const existingTitles = new Set(existing.map((row) => String(row.title)));

    const createdAt = '2026-09-09T00:00:00.000Z';
    const todos = [
      {
        title: '整理团队周报',
        description: '汇总本周各成员的工作进展与下周计划',
        status: 'pending',
        priority: 'normal',
        dueDate: '2026-09-12',
      },
      {
        title: '修复登录页样式问题',
        description: '移动端下登录按钮溢出容器，需要调整布局',
        status: 'pending',
        priority: 'urgent',
        dueDate: '2026-09-10',
      },
      {
        title: '设计新首页原型',
        description: '输出三版可选布局供评审',
        status: 'inProgress',
        priority: 'normal',
        dueDate: '2026-09-15',
      },
      {
        title: '升级数据库驱动',
        description: '将 better-sqlite3 升级到最新稳定版并回归验证',
        status: 'inProgress',
        priority: 'urgent',
        dueDate: '2026-09-11',
      },
      {
        title: '编写接口文档',
        description: '补充团队待办 API 的字段说明与示例',
        status: 'completed',
        priority: 'normal',
        dueDate: '2026-09-08',
      },
      {
        title: '配置 CI 缓存',
        description: '加速依赖安装与构建流程',
        status: 'completed',
        priority: 'urgent',
        dueDate: '2026-09-09',
      },
    ];

    const rows = todos
      .filter((todo) => !existingTitles.has(todo.title))
      .map((todo) => ({ ...todo, createdAt, updatedAt: createdAt }));

    if (rows.length > 0) {
      await query.insertInto('teamTodos').values(rows).execute();
    }
  },
});

export default seed;
