import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface NotifyOpportunityWonArgs {
  opportunityId?: unknown;
}

/**
 * Announces a won opportunity to its owner and to every sales-manager user.
 * Idempotency guard: the announcement is sent only while the opportunity is
 * still in the won stage, so a re-run after the stage changed is a no-op.
 */
export const run: WorkflowRunFunction = async (rawArgs, runtime) => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as NotifyOpportunityWonArgs;
  if (typeof args.opportunityId !== 'number') {
    throw new Error('Invalid opportunity win notification args.');
  }
  const app = runtime.app as Application;
  const database = app.container.resolve(databaseManagerToken);
  const notification = app.container.resolve(notificationServiceToken);

  const opportunity = await database
    .query()
    .selectFrom('opportunities')
    .select(['id', 'name', 'ownerId', 'stage', 'actualAmount'])
    .where('id', '=', args.opportunityId)
    .executeTakeFirst();
  if (!opportunity) return { skipped: true, reason: 'opportunity-not-found' };
  if (opportunity.stage !== 'won') {
    return { skipped: true, reason: 'stage-changed' };
  }

  const managerRows = await database
    .query()
    .selectFrom('userRoles')
    .innerJoin('roles', 'roles.id', 'userRoles.roleId')
    .select('userRoles.userId')
    .where('roles.key', '=', 'sales-manager')
    .execute();
  const managerIds = managerRows.map((row) => String(row.userId));

  const recipients = [
    { type: 'user' as const, id: String(opportunity.ownerId) },
    ...managerIds.map((id) => ({ type: 'user' as const, id })),
  ];
  const amount = Number(opportunity.actualAmount ?? 0);
  const opportunityName =
    typeof opportunity.name === 'string' ? opportunity.name : '未命名商机';
  await notification.send({
    source: {
      type: 'opportunity-win',
      referenceId: String(args.opportunityId),
    },
    to: recipients,
    channels: ['in-app'],
    content: {
      title: '商机赢单',
      body: `商机「${opportunityName}」已赢单，成交金额 ¥${amount.toLocaleString('zh-CN')}。`,
      actionUrl: `/opportunities/${args.opportunityId}`,
    },
  });
  return { sent: true, recipients: recipients.length };
};
