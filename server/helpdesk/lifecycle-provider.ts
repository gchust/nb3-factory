import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  LifecycleRuntime,
  StoredLifecycleParameters,
  createRepositoryLifecycleStore,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  HELPDESK_PARAMETER_SCOPE,
  helpdeskTicketLifecycle,
} from '../lifecycles/helpdesk-ticket.js';
import { fireOverdueReminders } from './reminders.js';
import { buildHelpdeskSampleData } from './sample-data.js';
import { createHelpdeskLifecycleServices } from './services.js';

const SCOPE = 'nb3-factory';
const SWEEP_JOB = 'helpdesk-lifecycle-sweep';

/** One runtime serves every lifecycle in the application. */
export const helpdeskLifecycleRuntimeToken: ServiceToken<LifecycleRuntime> =
  createServiceToken<LifecycleRuntime>('app/helpdesk-lifecycle-runtime');

export class HelpdeskLifecycleProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/helpdesk-lifecycle-provider';
  private jobs: LifecycleJobs | undefined;
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(helpdeskLifecycleRuntimeToken, () =>
      this.lifecycleRuntime(),
    );
  }

  public override async boot(): Promise<void> {
    // Registered here rather than from a seed because the demo goes through the
    // same lifecycle transitions a person does, so every sample ticket has real
    // history, notifications and workload. The service only runs it on a first
    // installation with `app.sampleData`, or through `nocobase db sample`.
    if (!this.app.container.has(sampleDataToken)) return;
    this.app.container.resolve(sampleDataToken).register({
      name: 'nb3-factory/helpdesk-demo',
      packageName: 'nb3-factory',
      run: () =>
        buildHelpdeskSampleData({
          app: this.app,
          database: this.database(),
          runtime: this.lifecycleRuntime(),
        }),
    });
  }

  public override async start(): Promise<void> {
    // Embedded test compositions can omit the scheduler and the application's
    // migrations. There is nothing to run there, and failing would hide the
    // composition being tested; a real application has both.
    if (!this.app.container.has(jobExecutorServiceToken)) return;
    if (!(await this.database().collections().get('helpdeskTickets'))) return;

    // The scheduler plugin has already opened this scope's executor by the time
    // an application provider starts. `addJob` is a no-op when the persisted
    // rule is unchanged, and a no-op rule is not armed again, so on a restart
    // the sweep would stay silently due and never fire. Remove the rule first
    // so `createLifecycleJobs().start()` writes it anew and the executor arms
    // the next firing. The sweep is idempotent, so re-planning it is safe.
    const schedule = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor(SCOPE);
    await schedule.setup();
    await schedule.removeJob(SWEEP_JOB);

    // Registers the effect job, opens the executors, schedules the trigger
    // sweep and recovers effect runs an earlier process left queued.
    await this.effectJobs().start(this.lifecycleRuntime());
  }

  public override async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
  }

  private database(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;
    const database = this.database();
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('helpdesk-lifecycle');

    const store = createRepositoryLifecycleStore(database);
    const runtime = new LifecycleRuntime({
      store,
      dispatcher: this.effectJobs(),
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });

    runtime.register(helpdeskTicketLifecycle, {
      services: (transactionHandle) =>
        createHelpdeskLifecycleServices({
          container: this.app.container,
          connection: transactionHandle
            ? (transactionHandle as ReturnType<DatabaseManager['connection']>)
            : database.connection(),
        }),
      // The runtime reads the saved version on every transition and sweep, so
      // an administrator's change to the reminder interval applies without a
      // restart. The same adapter is written by the settings endpoint.
      parameterConfiguration: {
        store: new StoredLifecycleParameters(store),
        scope: () => HELPDESK_PARAMETER_SCOPE,
      },
    });

    this.runtime = runtime;
    return runtime;
  }

  private effectJobs(): LifecycleJobs {
    if (this.jobs) return this.jobs;
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    this.jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor(SCOPE),
      schedule: executors.getScheduleExecutor(SCOPE),
      jobName: `${SCOPE}/helpdesk-lifecycle-effect`,
      sweepName: SWEEP_JOB,
      sweepEveryMs: 60_000,
      onSweep: async () => {
        await fireOverdueReminders({
          database: this.database(),
          runtime: this.lifecycleRuntime(),
        });
        await this.lifecycleRuntime().prune({
          olderThan: new Date(Date.now() - 7 * 86_400_000),
        });
      },
    });
    return this.jobs;
  }
}
