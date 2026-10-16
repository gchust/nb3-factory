/**
 * The application's lifecycle runtime: the one instance every lifecycle in
 * this application is registered on, and the jobs that make its effects run
 * outside the request that caused them.
 *
 * Effects are dispatched to the application's jobs service rather than run in
 * process: a notification is a network call, and a `fire()` that waits for it
 * holds the request open and loses the send if the request fails. `start()`
 * also recovers whatever an earlier process left queued, and the sweep fires
 * the ticket desk's 24-hour reminder.
 */
import type { Application } from '@nocobase/app-server/application';
import type { AppDriveConfig } from '@nocobase/app-server/drive';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LIFECYCLE_COLLECTIONS,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import { ticketLifecycle } from '../lifecycles/ticket.js';
import {
  ticketDeskServiceToken,
  ticketLifecycleRuntimeToken,
} from './tokens.js';

/** The application's package name, as the scope every job this provider queues is namespaced by. */
const SCOPE = 'nocobase-app';
const JOB_NAME = `${SCOPE}/ticket-lifecycle-effect`;

export class TicketLifecycleProvider extends ServiceProvider<Application> {
  public readonly name: string = 'ticket-lifecycle-provider';

  private jobs: LifecycleJobs | undefined;
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(ticketLifecycleRuntimeToken, () =>
      this.lifecycleRuntime(),
    );
  }

  public override async start(): Promise<void> {
    // Registers the effect job, opens the executors, schedules the sweep and
    // recovers the runs an earlier process left queued.
    await this.effectJobs().start(this.lifecycleRuntime());
  }

  public override async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
    this.jobs = undefined;
    this.runtime = undefined;
  }

  private effectJobs(): LifecycleJobs {
    if (this.jobs) return this.jobs;
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    this.jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor(SCOPE),
      schedule: executors.getScheduleExecutor(SCOPE),
      jobName: JOB_NAME,
      // Well below the 24-hour trigger, so a reminder is at most a minute late.
      sweepEveryMs: 60_000,
      onSweep: async () => {
        await this.lifecycleRuntime().prune({
          olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        });
      },
    });
    return this.jobs;
  }

  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;
    const logger = this.app.container.resolve(loggingToken).getLogger('ticket');
    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(
        this.app.container.resolve(databaseManagerToken),
        { collections: LIFECYCLE_COLLECTIONS },
      ),
      dispatcher: this.effectJobs(),
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });
    runtime.register(ticketLifecycle, {
      // On SQLite a guard must read through the transition's own transaction,
      // so the desk is resolved per call and handed the store's handle.
      services: (handle) =>
        this.app.container
          .resolve(ticketDeskServiceToken)
          .lifecycleServices(handle),
    });
    this.runtime = runtime;
    return runtime;
  }
}

/**
 * The disk new screenshots are written to; read from configuration lazily
 * because a provider registers before configuration is validated.
 */
export function defaultDriveDisk(app: Application): string {
  const drive = app.config.get<AppDriveConfig>('drive');
  return drive?.default ?? 'local';
}
