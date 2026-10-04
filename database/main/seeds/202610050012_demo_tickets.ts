import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * Three sample tickets, one in each state, so the list, the status filter and
 * the completion result have something to show on a fresh database.
 *
 * The submitters are resolved by username rather than hard-coded ids so this
 * seed keeps working even if the demo users were created by hand. Each ticket
 * is keyed by its `reference`, so re-running the seed never duplicates or
 * overwrites a ticket a user has since changed.
 */

interface SampleTicket {
  readonly id: string;
  readonly reference: string;
  readonly submitter: string;
  readonly category: 'computer' | 'account' | 'other';
  readonly title: string;
  readonly description: string;
  readonly status: 'pending' | 'processing' | 'completed';
  readonly handler?: string;
  readonly resolution?: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}

const HANDLER_USERNAME = 'handler1';

const SAMPLE_TICKETS: readonly SampleTicket[] = [
  {
    id: 'aaaaaaaa-0001-4001-8001-000000000001',
    reference: 'TKT-20261001-001',
    submitter: 'employee1',
    category: 'computer',
    title: '笔记本电脑无法开机',
    description:
      '按电源键后指示灯闪烁几次就熄灭了，换了电源线也一样，今天上午开始出现。',
    status: 'pending',
    createdAt: '2026-10-01T01:20:00.000Z',
  },
  {
    id: 'aaaaaaaa-0002-4002-8002-000000000002',
    reference: 'TKT-20261001-002',
    submitter: 'employee1',
    category: 'account',
    title: '重置密码后邮箱无法登录',
    description: '按提示重置了密码，但登录邮箱时一直提示密码错误。',
    status: 'processing',
    handler: HANDLER_USERNAME,
    createdAt: '2026-10-01T02:05:00.000Z',
  },
  {
    id: 'aaaaaaaa-0003-4003-8003-000000000003',
    reference: 'TKT-20261002-003',
    submitter: 'employee2',
    category: 'other',
    title: '会议室投屏连接失败',
    description: '三楼会议室投屏搜索不到设备，重启投屏器后仍然不行。',
    status: 'completed',
    handler: HANDLER_USERNAME,
    resolution: '已更换投屏器上的 HDMI 转接头并重新配对，投屏恢复正常。',
    createdAt: '2026-10-02T00:40:00.000Z',
    completedAt: '2026-10-02T03:15:00.000Z',
  },
];

async function userId(
  query: SeedContext['query'],
  username: string,
): Promise<{ id: string; name: string } | undefined> {
  const row = await query
    .selectFrom('user')
    .select(['id', 'name'])
    .where('username', '=', username)
    .limit(1)
    .executeTakeFirst();
  return row ? { id: String(row.id), name: String(row.name) } : undefined;
}

export default defineSeed({
  name: '202610050012_demo_tickets',
  async run({ query }) {
    const handler = await userId(query, HANDLER_USERNAME);

    for (const sample of SAMPLE_TICKETS) {
      const existing = await query
        .selectFrom('tickets')
        .select('reference')
        .where('reference', '=', sample.reference)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const submitter = await userId(query, sample.submitter);
      if (!submitter) {
        continue;
      }
      const handlerUser = sample.handler === undefined ? undefined : handler;
      await query
        .insertInto('tickets')
        .values({
          id: sample.id,
          reference: sample.reference,
          title: sample.title,
          category: sample.category,
          description: sample.description,
          status: sample.status,
          submitterId: submitter.id,
          submitterName: submitter.name,
          handlerId: handlerUser ? handlerUser.id : null,
          handlerName: handlerUser ? handlerUser.name : null,
          resolution: sample.resolution ?? null,
          completedAt: sample.completedAt ? new Date(sample.completedAt) : null,
          createdAt: new Date(sample.createdAt),
          updatedAt: new Date(sample.completedAt ?? sample.createdAt),
        })
        .execute();
    }
  },
});
