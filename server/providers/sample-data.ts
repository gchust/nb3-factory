/**
 * The application's sample data: a small service desk with an engineer, an employee and three tickets at different
 * stages, one of them already past the 24 hour mark. It is what a fresh installation of this application shows, so
 * the desk is never an empty screen: a normal `pnpm start` loads it once, idempotently.
 *
 * It goes through the same services the application uses — the users plugin creates the demo accounts, the ticket
 * service drives the lifecycle — rather than writing rows directly, so the sample is a real exercise of the
 * workflow and its notifications. The one exception is the overdue ticket's timestamps, which are moved back in
 * time so the overdue reminder has something to remind about; a ticket cannot be made old through the lifecycle.
 *
 * The same builder is registered on `sampleDataToken`, so `APP_SAMPLE_DATA=true` (and `db sample`) runs it through
 * the framework's sample-data path too. Passwords are fixed and documented because this data is only for a
 * demonstration.
 */
import type { Application } from '@nocobase/app-server/application';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { databaseManagerToken } from '@nocobase/db';
import type { ServiceResolver } from '@nocobase/service-provider';
import { ServiceProvider } from '@nocobase/service-provider';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { DAY_MS } from '../lifecycles/tickets.js';
import type { TicketRecord } from '../lifecycles/tickets.js';
import { lifecycleRuntimeToken } from './lifecycle.js';
import { serviceDeskRoleServiceToken } from './roles.js';
import { ticketServiceToken, type TicketCreateInput } from './tickets.js';

export const SERVICE_DESK_SAMPLE_NAME = 'service-desk/demo';
export const SERVICE_DESK_PACKAGE_NAME = 'nb3-factory';

const DEMO_PASSWORD = 'ServiceDesk!2026';

interface DemoUserRecord {
  readonly id: string;
  readonly username: string;
}

const PRINTER_TITLE = 'The printer on the third floor jams on every job';
const VPN_TITLE = 'VPN disconnects every few minutes';
const MONITOR_TITLE = 'The monitor flickers when the laptop is docked';

/** How old the overdue demo ticket is made, comfortably past the lifecycle's 24 hour trigger. */
const OVERDUE_AGE_MS = 26 * 60 * 60 * 1000;

async function findOrCreateDemoUser(
  container: ServiceResolver,
  input: { name: string; username: string; email: string },
): Promise<string | undefined> {
  if (!container.has(userManagementServiceToken)) return undefined;
  const database = container.resolve(databaseManagerToken);
  // Reuse the account when it is already there: the ensure runs on every start, and creating the same username a
  // second time would fail rather than confirm the account exists.
  const existing = await database
    .repository<DemoUserRecord>('user')
    .findOne({ filter: { username: input.username } });
  if (existing) return existing.id;
  try {
    const user = await container
      .resolve(userManagementServiceToken)
      .create({ ...input, password: DEMO_PASSWORD });
    return user.id;
  } catch {
    return undefined;
  }
}

/** Creates the ticket only when a ticket with the same title and requester is not already there. */
async function createTicketOnce(
  container: ServiceResolver,
  requesterId: string,
  input: TicketCreateInput,
  after?: (id: number) => Promise<void>,
): Promise<number | undefined> {
  const database = container.resolve(databaseManagerToken);
  const existing = await database
    .repository<TicketRecord>('tickets')
    .findOne({ filter: { title: input.title, requesterId } });
  if (existing) return Number(existing.id);
  const tickets = container.resolve(ticketServiceToken);
  const created = await tickets.create({ id: requesterId }, input);
  const id = Number(created.record.id);
  if (after) await after(id);
  return id;
}

export async function buildServiceDeskSampleData(
  container: ServiceResolver,
): Promise<void> {
  const roles = container.resolve(serviceDeskRoleServiceToken);

  const engineerId = await findOrCreateDemoUser(container, {
    name: 'Demo Engineer',
    username: 'demo.engineer',
    email: 'engineer@example.com',
  });
  const employeeId = await findOrCreateDemoUser(container, {
    name: 'Demo Employee',
    username: 'demo.employee',
    email: 'employee@example.com',
  });
  if (!engineerId || !employeeId) return;

  await roles.setRole(engineerId, 'engineer');

  const helpdesk = (await roles.list()).find((row) => row.role === 'helpdesk');
  if (!helpdesk) return;
  const desk: { id: string } = { id: helpdesk.userId };
  const tickets = container.resolve(ticketServiceToken);

  await createTicketOnce(container, employeeId, {
    title: PRINTER_TITLE,
    description:
      'The shared printer on the third floor jams after the first page. Clearing it does not help; the next job jams again.',
    category: 'Hardware',
    location: 'Building A, 3F',
    urgency: 'high',
  });

  await createTicketOnce(
    container,
    employeeId,
    {
      title: VPN_TITLE,
      description:
        'The VPN drops while I am working and reconnects on its own, interrupting remote sessions.',
      category: 'Network',
      location: 'Remote',
      urgency: 'normal',
    },
    async (id) => {
      await tickets.fire(desk, id, {
        transition: 'assign',
        input: { assigneeId: engineerId },
      });
      await tickets.fire({ id: engineerId }, id, { transition: 'start' });
      await tickets.addNote(
        { id: engineerId },
        id,
        'Reproduced it with the office gateway. The client is using an outdated profile; sending a new one.',
        'handling',
      );
    },
  );

  await createTicketOnce(
    container,
    employeeId,
    {
      title: MONITOR_TITLE,
      description:
        'The external monitor flickers for a second or two whenever the laptop is placed on the dock.',
      category: 'Hardware',
      location: 'Building A, 2F',
      urgency: 'low',
    },
    async (id) => {
      await tickets.fire(desk, id, {
        transition: 'assign',
        input: { assigneeId: engineerId },
      });
      await tickets.fire({ id: engineerId }, id, { transition: 'start' });
      await tickets.fire({ id: engineerId }, id, {
        transition: 'resolve',
        input: {
          solution:
            'Replaced the dock’s DisplayPort cable; the flicker is gone.',
        },
      });
    },
  );
}

/**
 * Makes one open demo ticket look older than the overdue threshold and asks the lifecycle to remind the service
 * desk about it, so the homepage's "open over 24 hours" count and the Inbox reminder are both populated on a
 * fresh start instead of only appearing after the first sweep a minute later.
 *
 * The timestamps are written straight to the row because the lifecycle owns them and offers no way to backdate a
 * ticket; this is the sample-data tooling doing it deliberately, not a service or a route bypassing the runtime.
 */
export async function ensureOverdueDemoTicket(
  container: ServiceResolver,
): Promise<void> {
  const database = container.resolve(databaseManagerToken);
  const employeeId = (
    await database
      .repository<DemoUserRecord>('user')
      .findOne({ filter: { username: 'demo.employee' } })
  )?.id;
  if (!employeeId) return;

  const printer = await database
    .repository<TicketRecord>('tickets')
    .findOne({ filter: { title: PRINTER_TITLE, requesterId: employeeId } });
  if (!printer) return;

  const age = Date.now() - Date.parse(printer.createdAt);
  // Already old: a previous start backdated it and the reminder is already in the Inbox, so leave the clock alone
  // rather than reset it and notify again on every restart.
  if (Number.isFinite(age) && age >= DAY_MS) return;

  const when = new Date(Date.now() - OVERDUE_AGE_MS).toISOString();
  await database
    .query()
    .updateTable('tickets')
    .set({ createdAt: when, statusChangedAt: when })
    .where('id', '=', printer.id)
    .execute();

  // Fire the reminder now rather than waiting up to a minute for the periodic sweep.
  await container.resolve(lifecycleRuntimeToken).runTriggers();
}

export class ServiceDeskSampleDataProvider extends ServiceProvider<Application> {
  readonly name = 'service-desk/sample-data';

  register() {
    const { container } = this.app;
    if (!container.has(sampleDataToken)) return;
    container.resolve(sampleDataToken).register({
      name: SERVICE_DESK_SAMPLE_NAME,
      packageName: SERVICE_DESK_PACKAGE_NAME,
      run: () => buildServiceDeskSampleData(container),
    });
  }

  async start() {
    if (!this.shouldLoadSampleData()) return;
    try {
      await buildServiceDeskSampleData(this.app.container);
      await ensureOverdueDemoTicket(this.app.container);
    } catch (error) {
      // A sample that could not be built is not a reason to keep the application from starting.
      console.warn(
        '[service-desk] The sample data could not be loaded.',
        error,
      );
    }
  }

  /**
   * `app.sampleData` is the framework's own switch, honored when a deployment sets it. Otherwise the sample is what
   * this application ships with, so a normal start loads it. A test run starts from an empty database and asserts on
   * exact counts, so it is left without the sample; the test runner sets `VITEST`.
   */
  private shouldLoadSampleData(): boolean {
    if (this.app.config.get<boolean>('app.sampleData') === true) return true;
    return !process.env.VITEST;
  }
}

export default ServiceDeskSampleDataProvider;
