import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface NotifyLeadAssignedArgs {
  leadId?: unknown;
  ownerId?: unknown;
}

/**
 * Sends the in-app notification for a lead assignment. Idempotency guard: the
 * notification is sent only while the lead is still owned by the assigned
 * owner, so a re-run after the lead was reassigned is a no-op.
 */
export const run: WorkflowRunFunction = async (rawArgs, runtime) => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as NotifyLeadAssignedArgs;
  if (typeof args.leadId !== 'number' || typeof args.ownerId !== 'string') {
    throw new Error('Invalid lead assignment notification args.');
  }
  const app = runtime.app as Application;
  const database = app.container.resolve(databaseManagerToken);
  const notification = app.container.resolve(notificationServiceToken);

  const lead = await database
    .query()
    .selectFrom('leads')
    .select(['id', 'companyName', 'ownerId'])
    .where('id', '=', args.leadId)
    .executeTakeFirst();
  if (!lead) return { skipped: true, reason: 'lead-not-found' };
  if (String(lead.ownerId) !== args.ownerId) {
    return { skipped: true, reason: 'owner-changed' };
  }

  const leadName =
    typeof lead.companyName === 'string' ? lead.companyName : '未命名线索';
  await notification.send({
    source: { type: 'lead-assignment', referenceId: String(args.leadId) },
    to: { type: 'user', id: args.ownerId },
    channels: ['in-app'],
    content: {
      title: '新线索分配',
      body: `线索「${leadName}」已分配给您，请及时跟进。`,
      actionUrl: `/leads/${args.leadId}`,
    },
  });
  return { sent: true };
};
