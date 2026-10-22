import { AppCommand } from '@nocobase/app-cli';

export interface HelpdeskRemindersResult {
  readonly fired: number;
}

/**
 * Runs the overdue trigger sweep now instead of waiting for the scheduled
 * job. The scheduled sweep stays the normal path; this is for an operator who
 * needs to verify or recover reminder delivery when the job runner was down.
 */
export default class HelpdeskReminders extends AppCommand {
  static override summary = 'Run the helpdesk overdue reminder sweep now.';
  static override description =
    'Fires every due overdue reminder trigger immediately. The background job runs the same sweep every minute; this command is for checking or recovering reminders.';
  static override examples = ['<%= config.bin %> <%= command.id %> --json'];

  public async run(): Promise<HelpdeskRemindersResult> {
    const result = await this.withApp(async ({ app }) => {
      await app.start();
      const { helpdeskLifecycleRuntimeToken } =
        await import('../../server/helpdesk/lifecycle-provider.js');
      const runtime = app.container.resolve(helpdeskLifecycleRuntimeToken);
      const { databaseManagerToken } = await import('@nocobase/db');
      const { fireOverdueReminders } =
        await import('../../server/helpdesk/reminders.js');
      const result = await fireOverdueReminders({
        database: app.container.resolve(databaseManagerToken),
        runtime,
      });
      return { fired: result.fired };
    });
    this.log(`Fired ${String(result.fired)} overdue reminder(s).`);
    return result;
  }
}
