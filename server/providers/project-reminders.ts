import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import { projectsServiceToken } from './projects.js';

/** The consumer identity of these schedules: one private executor per scope. */
const SCOPE = 'project-collaboration';
const JOB_NAME = 'overdue-task-reminders';
/**
 * Every day at 01:00 UTC. The date in the idempotency key keeps a firing per day from repeating. The first firing
 * is immediate so a deployment (or a freshly seeded install) reminds the overdue tasks it already has, instead of
 * staying silent until the next 01:00.
 */
const CRON = '0 1 * * *';
/** The Channel configured in `server/config/notification.ts`; it resolves to the `in-app` Provider. */
const CHANNEL = 'inbox';

/**
 * The daily overdue-task reminder.
 *
 * It is a `ScheduleExecutor` rather than a Scheduler-plugin schedule because nothing in the administration UI needs to
 * see or edit it — it is part of how this application behaves, not a business user's task. `findOverdueTasks` selects
 * the work and this provider decides how to tell people, so the query stays testable on its own.
 *
 * One notification is sent per task, keyed `overdue-task:<taskId>:<date>`, so a restart or a second instance cannot
 * remind the same assignee twice in one day. A task that is overdue but unassigned is skipped: there is nobody to
 * remind.
 */
export default class ProjectRemindersProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/project-reminders-provider';

  private executor?: ScheduleExecutor;

  public override register(): void {
    // Nothing to bind: the schedule is owned entirely by this provider.
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(notificationServiceToken)) {
      // The notification plugin is not registered, so there is no channel to send through.
      return;
    }
    const executions = this.app.container.resolve(jobExecutorServiceToken);
    const executor = executions.getScheduleExecutor(SCOPE);
    this.executor = executor;
    const service = this.app.container.resolve(projectsServiceToken);
    const notification = this.app.container.resolve(notificationServiceToken);

    await executor.addJob({
      name: JOB_NAME,
      options: { cron: CRON, immediately: true },
      payload: {},
      execute: async () => {
        const reference = new Date();
        const day = reference.toISOString().slice(0, 10);
        const overdue = await service.findOverdueTasks(reference);
        for (const task of overdue) {
          try {
            await notification.send({
              idempotencyKey: `overdue-task:${task.taskId}:${day}`,
              source: { type: 'projectTask', referenceId: task.taskId },
              messages: {
                [CHANNEL]: {
                  to: task.assigneeId,
                  title: 'Overdue task',
                  body: `"${task.title}" in project "${task.projectName}" is past its due date (${task.dueDate}).`,
                  target: {
                    type: 'route',
                    path: `/projects/${task.projectId}/tasks/${task.taskId}`,
                  },
                },
              },
            });
          } catch (error) {
            // One failed reminder must not stop the others.
            console.error('Failed to send an overdue task reminder', {
              taskId: task.taskId,
              error,
            });
          }
        }
      },
    });
    await executor.setup({ consume: true });
  }

  public override async shutdown(): Promise<void> {
    const executor = this.executor;
    this.executor = undefined;
    // Waits for a running firing to finish before releasing what it uses.
    await executor?.shutdown();
  }
}
