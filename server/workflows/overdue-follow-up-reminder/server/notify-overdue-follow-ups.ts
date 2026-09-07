import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface NotifyOverdueFollowUpsArgs {
  date?: unknown;
}

/**
 * Finds follow-ups whose next follow-up time is before the given date and
 * whose opportunity (if any) is still open, then sends one in-app reminder per
 * owner. Idempotency: a row in `followUpReminders` (unique followUpId +
 * remindDate) records each reminder, so re-running the same date never sends a
 * duplicate.
 */
export const run: WorkflowRunFunction = async (rawArgs, runtime) => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as NotifyOverdueFollowUpsArgs;
  if (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('Invalid overdue reminder date.');
  }
  const app = runtime.app as Application;
  const database = app.container.resolve(databaseManagerToken);
  const notification = app.container.resolve(notificationServiceToken);

  const endOfDay = new Date(`${args.date}T23:59:59.999Z`);
  const overdue = await database
    .query()
    .selectFrom('followUps')
    .leftJoin('opportunities', 'opportunities.id', 'followUps.opportunityId')
    .select([
      'followUps.id',
      'followUps.subject',
      'followUps.nextFollowUpAt',
      'followUps.ownerId',
      'followUps.opportunityId',
    ])
    .where('followUps.nextFollowUpAt', '<', endOfDay)
    .where((eb) =>
      eb.or([
        eb('opportunities.stage', 'is', null),
        eb('opportunities.stage', 'not in', ['won', 'lost']),
      ]),
    )
    .execute();

  let sent = 0;
  let skipped = 0;
  for (const followUp of overdue) {
    const followUpId = Number(followUp.id);
    const existing = await database
      .query()
      .selectFrom('followUpReminders')
      .select('id')
      .where('followUpId', '=', followUpId)
      .where('remindDate', '=', args.date)
      .executeTakeFirst();
    if (existing) {
      skipped += 1;
      continue;
    }
    const now = new Date();
    await database
      .query()
      .insertInto('followUpReminders')
      .values({
        followUpId,
        remindDate: args.date,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await notification.send({
      source: { type: 'overdue-follow-up', referenceId: String(followUpId) },
      to: { type: 'user', id: String(followUp.ownerId) },
      channels: ['in-app'],
      content: {
        title: '跟进提醒',
        body: `跟进「${typeof followUp.subject === 'string' ? followUp.subject : '未命名跟进'}」已逾期，请尽快处理。`,
        actionUrl: followUp.opportunityId
          ? `/opportunities/${Number(followUp.opportunityId)}`
          : '/follow-ups',
      },
    });
    sent += 1;
  }
  return { sent, skipped, date: args.date };
};
