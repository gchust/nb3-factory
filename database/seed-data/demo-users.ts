/**
 * Isolated demonstration accounts for the IT repair ticket feature.
 *
 * They exist so the feature can be demonstrated and verified without touching a
 * real colleague's account, and so the fresh installation has the two employee
 * and one handler accounts the business request asked for. The credentials are
 * deliberately fictional and belong to this demo installation only; never copy
 * them into a report or reuse them as production accounts.
 *
 * The setup-shared module is imported with a `.ts` extension because a source
 * checkout loads seeds through Node's own loader, which resolves relative
 * specifiers literally; the build rewrites it back to `.js`.
 */
import {
  IT_TICKETS_EMPLOYEE_SET,
  IT_TICKETS_HANDLER_SET,
} from '../../server/it-tickets-resources.ts';

export interface ItTicketDemoUser {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly permissionSet: string;
}

export const itTicketDemoUsers: readonly ItTicketDemoUser[] = [
  {
    username: 'employee_a',
    name: 'Employee A',
    email: 'employee.a@example.com',
    password: 'EmployeeA_2026',
    permissionSet: IT_TICKETS_EMPLOYEE_SET,
  },
  {
    username: 'employee_b',
    name: 'Employee B',
    email: 'employee.b@example.com',
    password: 'EmployeeB_2026',
    permissionSet: IT_TICKETS_EMPLOYEE_SET,
  },
  {
    username: 'it_handler',
    name: 'IT Handler',
    email: 'it.handler@example.com',
    password: 'ItHandler_2026',
    permissionSet: IT_TICKETS_HANDLER_SET,
  },
];
