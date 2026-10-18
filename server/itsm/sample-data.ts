import type { Application } from '@nocobase/app-server/application';
import {
  sampleDataToken,
  type SampleDataService,
} from '@nocobase/app-server/sample-data';
import { databaseManagerToken } from '@nocobase/db';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import {
  EMPLOYEE_PERMISSION_SET,
  ENGINEER_PERMISSION_SET,
  SERVICE_DESK_PERMISSION_SET,
} from './permission-sets.js';
import { ticketServiceToken, type TicketActor } from './service.js';

const SAMPLE_NAME = 'itsm/service-desk';
const SAMPLE_PACKAGE = 'application';
const SAMPLE_PASSWORD = 'admin123';
const HOUR = 60 * 60 * 1000;

interface SamplePerson extends TicketActor {
  readonly username: string;
  readonly email: string;
  readonly roleKey: string;
}

const PEOPLE: readonly SamplePerson[] = [
  {
    id: '',
    name: 'Alice Employee',
    username: 'employee',
    email: 'employee@example.com',
    role: 'employee',
    roleKey: EMPLOYEE_PERMISSION_SET,
  },
  {
    id: '',
    name: 'Bob Engineer',
    username: 'engineer',
    email: 'engineer@example.com',
    role: 'engineer',
    roleKey: ENGINEER_PERMISSION_SET,
  },
  {
    id: '',
    name: 'Carol Dispatcher',
    username: 'dispatcher',
    email: 'dispatcher@example.com',
    role: 'service-desk',
    roleKey: SERVICE_DESK_PERMISSION_SET,
  },
];

/**
 * Registers the sample service desk: three role accounts and a handful of
 * tickets in every state, so the dashboard and the workflow have something to
 * show the first time the application is opened.
 *
 * It runs only when the database was installed by this start with
 * `APP_SAMPLE_DATA` set, the same condition as any other sample.
 */
export function registerItsmSampleData(app: Application): void {
  const service = app.container.resolveIfCreated(sampleDataToken);
  if (!service) return;
  service.register({
    name: SAMPLE_NAME,
    packageName: SAMPLE_PACKAGE,
    run: () => buildSample(app, service),
  });
}

async function buildSample(
  app: Application,
  service: SampleDataService,
): Promise<void> {
  const users = app.container.resolve(userManagementServiceToken);
  const tickets = app.container.resolve(ticketServiceToken);

  const existing = await users.list({ search: PEOPLE[0].email, pageSize: 1 });
  if (existing.total > 0) return;

  const people: SamplePerson[] = [];
  for (const person of PEOPLE) {
    const created = await users.create({
      name: person.name,
      username: person.username,
      email: person.email,
      password: SAMPLE_PASSWORD,
      roleScopes: { app: [person.roleKey] },
    });
    people.push({ ...person, id: created.id });
  }

  const employee = people[0];
  const engineer = people[1];
  const dispatcher = people[2];

  const pending = await tickets.create(employee, {
    title: 'Laptop will not start',
    description:
      'The screen stays black after the power light comes on. Nothing appears on an external monitor either.',
    urgency: 'high',
  });

  const processing = await tickets.create(employee, {
    title: 'VPN disconnects every few minutes',
    description:
      'The VPN drops after roughly five minutes and the client has to be restarted.',
    urgency: 'medium',
  });
  await tickets.assign(dispatcher, processing.id, engineer);
  await tickets.process(
    engineer,
    processing.id,
    'Collected the client logs and opened a case with the network team.',
  );

  const resolved = await tickets.create(employee, {
    title: 'Cannot access the shared finance drive',
    description: 'The drive maps but every folder reports access denied.',
    urgency: 'medium',
  });
  await tickets.assign(dispatcher, resolved.id, engineer);
  await tickets.resolve(
    engineer,
    resolved.id,
    'Reset the group membership; access is restored and verified with the requester.',
  );

  const closed = await tickets.create(employee, {
    title: 'Printer on the third floor is out of toner',
    description:
      'Printouts are faint and the panel reports a low toner cartridge.',
    urgency: 'low',
  });
  await tickets.assign(dispatcher, closed.id, engineer);
  await tickets.resolve(
    engineer,
    closed.id,
    'Replaced the toner cartridge and printed a test page.',
  );
  await tickets.confirm(employee, closed.id);

  // One ticket older than the reminder window, so the dashboard shows an
  // overdue item on the first load.
  const overdue = await tickets.create(employee, {
    title: 'Email account locked after repeated sign-ins',
    description:
      'The account locks every morning and has to be unlocked by the service desk.',
    urgency: 'urgent',
  });
  const database = app.container.resolve(databaseManagerToken);
  await database.repository('serviceTickets').updateOne({
    filter: { id: overdue.id },
    values: {
      submittedAt: new Date(Date.now() - 30 * HOUR).toISOString(),
    },
  });

  void service;
  void pending;
}
