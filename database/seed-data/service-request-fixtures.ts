/**
 * Reproducible installation data for the service-request acceptance flow: two
 * accounts and two requests. Fixed ids and titles keep the seed idempotent and
 * keep a re-run from duplicating anything.
 */
export const SERVICE_REQUEST_TEST_PASSWORD = 'password123';

export const SERVICE_REQUEST_TEST_USERS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'supervisor',
    name: 'Request Supervisor',
    email: 'supervisor@example.com',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    username: 'assignee',
    name: 'Request Assignee',
    email: 'assignee@example.com',
  },
] as const;

/** Both requests are assigned to the second test account. */
export const SERVICE_REQUEST_ASSIGNEE_ID = SERVICE_REQUEST_TEST_USERS[1].id;

export const SERVICE_REQUEST_RECORDS = [
  {
    title: 'Printer on the third floor is broken',
    urgent: true,
    assigneeId: SERVICE_REQUEST_ASSIGNEE_ID,
  },
  {
    title: 'Update the shared team mailbox',
    urgent: false,
    assigneeId: SERVICE_REQUEST_ASSIGNEE_ID,
  },
] as const;
