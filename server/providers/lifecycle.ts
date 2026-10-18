/**
 * Owns the `tickets` lifecycle runtime and the jobs that carry its effects.
 *
 * The runtime and its store are created in `register()`, with a dispatcher that delegates to the jobs dispatcher
 * assigned in `start()`. That indirection is deliberate: `JobExecutorServiceProvider.start()` opens the executors
 * before this provider's `start()`, so the executors can only be resolved then, while the runtime token must be
 * resolvable as soon as the container is composed.
 *
 * Guards read the service desk roles through the transaction handle the runtime passes to the services factory,
 * so a role check and the transition it authorizes share one transaction. The notifier is built per registration
 * because it resolves the notification service lazily.
 *
 * The sweep runs every minute, well under the 24 hour overdue trigger, and also prunes finished runs older than
 * 30 days so the two log tables stay bounded.
 */
import { databaseManagerToken } from '@nocobase/db';
import {
  LIFECYCLE_COLLECTIONS,
  LifecycleRuntime,
  createRepositoryLifecycleStore,
  type LifecycleLogger,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { DAY_MS, ticketLifecycle } from '../lifecycles/tickets.js';
import { serviceDeskRoleServiceToken } from './roles.js';
import { createTicketNotifier } from './notifications.js';

export const lifecycleRuntimeToken = createServiceToken<LifecycleRuntime>(
  'service-desk-lifecycle-runtime',
);

const logger: LifecycleLogger = {
  warn: (message, details) =>
    console.warn(`[service-desk] ${message}`, details ?? ''),
  error: (message, details) =>
    console.error(`[service-desk] ${message}`, details ?? ''),
};

export class ServiceDeskLifecycleProvider extends ServiceProvider<Application> {
  readonly name = 'service-desk/lifecycle';
  private jobs?: LifecycleJobs;

  register() {
    this.app.container.singleton(lifecycleRuntimeToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      const roles = container.resolve(serviceDeskRoleServiceToken);
      const runtime = new LifecycleRuntime({
        store: createRepositoryLifecycleStore(database),
        logger,
        dispatcher: {
          dispatch: async (runId, options) => {
            if (!this.jobs) {
              throw new Error(
                'The service desk lifecycle jobs are not started yet.',
              );
            }
            await this.jobs.dispatch(runId, options);
          },
        },
      });
      runtime.register(ticketLifecycle, {
        services: (handle) => ({
          rolesOf: (userId) => roles.rolesOf(userId, handle),
          engineerExists: (userId) => roles.engineerExists(userId, handle),
          helpdeskUserIds: () => roles.helpdeskUserIds(handle),
          notify: createTicketNotifier(container),
        }),
      });
      return runtime;
    });
  }

  async start() {
    // The lifecycle tables come from this application's migrations, and an app can be started against a database that
    // has not been migrated yet — an embedded host that only serves its shell, for instance. The runtime token stays
    // registered either way, so the pages and routes still resolve; only the jobs, which have no table to read, are
    // left unstarted, and a transition fired against such a database is logged by the runtime rather than crashing it.
    if (!(await this.hasLifecycleCollections())) {
      logger.warn(
        'The lifecycle tables are missing, so the service desk effect jobs are not started. Apply the migrations.',
      );
      return;
    }
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    const runtime = this.app.container.resolve(lifecycleRuntimeToken);
    const jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor('service-desk'),
      schedule: executors.getScheduleExecutor('service-desk'),
      jobName: 'service-desk/effect',
      sweepEveryMs: 60_000,
      logger,
      onSweep: async () => {
        await runtime.prune({ olderThan: new Date(Date.now() - 30 * DAY_MS) });
      },
    });
    await jobs.start(runtime);
    this.jobs = jobs;
  }

  async shutdown() {
    await this.jobs?.shutdown();
    this.jobs = undefined;
  }

  /** Whether the two collections the repository store reads and writes have been migrated in. */
  private async hasLifecycleCollections(): Promise<boolean> {
    try {
      const collections = this.app.container
        .resolve(databaseManagerToken)
        .collections();
      const [transitions, effectRuns] = await Promise.all([
        collections.get(LIFECYCLE_COLLECTIONS.transitions),
        collections.get(LIFECYCLE_COLLECTIONS.effectRuns),
      ]);
      return Boolean(transitions && effectRuns);
    } catch (error) {
      // A connection that is not configured at all throws here rather than returning nothing.
      logger.warn('The lifecycle collections could not be read.', error);
      return false;
    }
  }
}

export default ServiceDeskLifecycleProvider;
