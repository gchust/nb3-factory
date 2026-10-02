import { defineSeed } from '@nocobase/db';

const sampleTickets = [
  {
    title: '笔记本电脑无法开机',
    category: 'computer',
    description: '按下电源键后指示灯闪烁，屏幕一直黑屏，已尝试更换电源线。',
    status: 'pending',
    submitter: 'employee_a',
  },
  {
    title: '无法登录公司邮箱',
    category: 'account',
    description: '客户端提示密码错误，但网页端可以登录。',
    status: 'in_progress',
    submitter: 'employee_b',
    handler: 'it_handler',
  },
  {
    title: '会议室投屏线接触不良',
    category: 'other',
    description: '三号会议室 HDMI 线需要用力按压画面才稳定。',
    status: 'completed',
    submitter: 'employee_a',
    handler: 'it_handler',
    resolution: '更换了新的 HDMI 线并测试正常。',
  },
] as const;

/**
 * Three example tickets covering all three statuses so a fresh installation has
 * something to look at. A one-time seed; skips when the collection already has
 * rows to stay safe if it is ever replayed.
 */
export default defineSeed({
  name: '202609210003_it_tickets_sample_data',
  transaction: true,
  async run(context) {
    const { query } = context;
    const existing = await query
      .selectFrom('it_tickets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const usernames = ['employee_a', 'employee_b', 'it_handler'];
    const rows = await query
      .selectFrom('user')
      .select(['id', 'username'])
      .where('username', 'in', usernames)
      .execute();
    const userIds = new Map(
      rows.map((row) => [String(row.username), String(row.id)]),
    );

    const base = Date.parse('2026-09-20T09:00:00.000Z');
    const tickets = context.repository('itTickets');
    for (let index = 0; index < sampleTickets.length; index += 1) {
      const sample = sampleTickets[index];
      const submitterId = userIds.get(sample.submitter);
      if (!submitterId) continue;
      const createdAt = new Date(base + index * 3_600_000).toISOString();
      const handlerId =
        'handler' in sample ? userIds.get(sample.handler) : undefined;
      await tickets.createOne({
        values: {
          title: sample.title,
          category: sample.category,
          description: sample.description,
          status: sample.status,
          resolution: 'resolution' in sample ? sample.resolution : null,
          submitterId,
          handlerId: handlerId ?? null,
          startedAt:
            sample.status === 'pending'
              ? null
              : new Date(base + index * 3_600_000 + 600_000).toISOString(),
          completedAt:
            sample.status === 'completed'
              ? new Date(base + index * 3_600_000 + 1_200_000).toISOString()
              : null,
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
  },
});
