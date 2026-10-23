import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

/**
 * Demonstration tickets for a fresh installation.
 *
 * `sample: true` keeps this out of a production installation: it exists so a new environment shows the dashboard, the
 * overdue list and an engineer's workload without anyone filing a request first. The rows are inserted directly, so
 * they carry no transition history — a sample ticket is a starting point, not a record of something that happened.
 *
 * The seed finds whoever installed the application and assigns a couple of the samples to them, which is what makes
 * the per-engineer workload meaningful. With no user at all it writes only the unassigned tickets.
 */
export default defineSeed({
  name: '202611200002_ticket_sample_data',
  sample: true,
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('tickets')
      .select('id')
      .executeTakeFirst();
    if (existing) {
      return;
    }

    const admin = await query
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .orderBy('createdAt', 'asc')
      .executeTakeFirst();
    const adminId = admin ? String(admin.id) : '';
    const adminName = admin
      ? String(admin.name ?? admin.email ?? admin.id)
      : '';

    const now = Date.now();
    const hoursAgo = (hours: number) =>
      new Date(now - hours * 60 * 60 * 1000).toISOString();

    interface SampleTicket {
      readonly title: string;
      readonly description: string;
      readonly category: string;
      readonly urgency: string;
      readonly status: string;
      readonly lifecycleVersion: number;
      readonly createdAt: string;
      readonly assigned: boolean;
      readonly resolution?: string;
    }

    const samples: readonly SampleTicket[] = [
      {
        title: '三楼打印机无法打印 / Third-floor printer will not print',
        description:
          '打印任务一直停留在队列中，重启打印机也没有恢复。 / Print jobs stay queued; restarting the printer did not help.',
        category: 'hardware',
        urgency: 'high',
        status: 'submitted',
        lifecycleVersion: 0,
        createdAt: hoursAgo(30),
        assigned: false,
      },
      {
        title: '会议室投影仪没有信号 / Meeting-room projector shows no signal',
        description:
          'HDMI 线已更换，投影仪仍然提示无信号。 / The HDMI cable was replaced and the projector still reports no signal.',
        category: 'hardware',
        urgency: 'normal',
        status: 'submitted',
        lifecycleVersion: 0,
        createdAt: hoursAgo(2),
        assigned: false,
      },
      {
        title: '笔记本电脑无法开机 / Laptop will not power on',
        description:
          '按下电源键没有任何反应，指示灯也不亮。 / Pressing the power button does nothing and no indicator lights up.',
        category: 'hardware',
        urgency: 'urgent',
        status: 'assigned',
        lifecycleVersion: 1,
        createdAt: hoursAgo(5),
        assigned: true,
      },
      {
        title: 'VPN 频繁掉线 / VPN keeps disconnecting',
        description:
          '每十分钟左右断开一次，需要重新登录。 / It drops roughly every ten minutes and needs a new sign-in.',
        category: 'network',
        urgency: 'high',
        status: 'inProgress',
        lifecycleVersion: 2,
        createdAt: hoursAgo(27),
        assigned: true,
      },
      {
        title: '工位显示器闪烁 / Desk monitor flickers',
        description:
          '外接显示器间歇性闪烁，更换线缆后依旧。 / The external monitor flickers intermittently even after a new cable.',
        category: 'hardware',
        urgency: 'low',
        status: 'resolved',
        lifecycleVersion: 3,
        createdAt: hoursAgo(50),
        assigned: true,
        resolution: '更换了电源适配器，已稳定运行一天。 / Replaced the power adapter; stable for a day.',
      },
    ];

    for (const sample of samples) {
      const id = randomUUID();
      const reporterId = adminId || 'sample-reporter';
      const reporterName = adminName || '示例用户 / Sample user';
      await query
        .insertInto('tickets')
        .values({
          id,
          title: sample.title,
          description: sample.description,
          category: sample.category,
          urgency: sample.urgency,
          status: sample.status,
          statusChangedAt: sample.createdAt,
          lifecycleVersion: sample.lifecycleVersion,
          reporterId,
          reporterName,
          assigneeId: sample.assigned ? reporterId : null,
          assigneeName: sample.assigned ? reporterName : null,
          resolution: sample.resolution ?? null,
          resolvedAt: sample.status === 'resolved' ? hoursAgo(20) : null,
          closedAt: null,
          reopenCount: 0,
          lastReopenedAt: null,
          overdueNotifiedAt: null,
          attachmentId: null,
          createdAt: sample.createdAt,
          updatedAt: sample.createdAt,
        })
        .execute();

      await query
        .insertInto('ticketComments')
        .values({
          id: randomUUID(),
          ticketId: id,
          authorId: reporterId,
          authorName: reporterName,
          kind: 'system',
          body: '已提交报修 / Repair request submitted',
          createdAt: sample.createdAt,
          updatedAt: sample.createdAt,
        })
        .execute();

      if (sample.resolution) {
        await query
          .insertInto('ticketComments')
          .values({
            id: randomUUID(),
            ticketId: id,
            authorId: reporterId,
            authorName: reporterName,
            kind: 'resolution',
            body: `处理结果：${sample.resolution} / Resolution: ${sample.resolution}`,
            createdAt: hoursAgo(20),
            updatedAt: hoursAgo(20),
          })
          .execute();
      }
    }
  },
});
