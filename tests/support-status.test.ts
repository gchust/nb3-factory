import { describe, expect, it } from 'vitest';

import {
  isTicketStatusAction,
  resolveStatusTransition,
} from '../server/providers/support/status.js';

describe('resolveStatusTransition', () => {
  it('lets an agent start a new ticket and take ownership', () => {
    expect(
      resolveStatusTransition({
        action: 'start',
        status: 'new',
        isStaff: true,
        isCustomer: false,
      }),
    ).toEqual({ status: 'in_progress', assignToSelf: true });
  });

  it('lets an agent ask the customer to confirm a ticket in progress', () => {
    expect(
      resolveStatusTransition({
        action: 'request-confirmation',
        status: 'in_progress',
        isStaff: true,
        isCustomer: false,
      }),
    ).toEqual({ status: 'pending_customer', assignToSelf: false });
  });

  it('lets the owning customer close a ticket waiting on them', () => {
    expect(
      resolveStatusTransition({
        action: 'confirm',
        status: 'pending_customer',
        isStaff: false,
        isCustomer: true,
      }),
    ).toEqual({ status: 'closed', assignToSelf: false });
  });

  it('refuses a customer confirming a ticket that is not waiting on them', () => {
    expect(
      resolveStatusTransition({
        action: 'confirm',
        status: 'in_progress',
        isStaff: false,
        isCustomer: true,
      }),
    ).toBeNull();
  });

  it('refuses an agent confirming on the customer behalf', () => {
    expect(
      resolveStatusTransition({
        action: 'confirm',
        status: 'pending_customer',
        isStaff: true,
        isCustomer: false,
      }),
    ).toBeNull();
  });

  it('refuses a bystander customer acting on someone else ticket', () => {
    expect(
      resolveStatusTransition({
        action: 'confirm',
        status: 'pending_customer',
        isStaff: false,
        isCustomer: false,
      }),
    ).toBeNull();
  });

  it('refuses an agent starting a ticket that is already in progress', () => {
    expect(
      resolveStatusTransition({
        action: 'start',
        status: 'in_progress',
        isStaff: true,
        isCustomer: false,
      }),
    ).toBeNull();
  });

  it('lets an agent reopen a closed ticket', () => {
    expect(
      resolveStatusTransition({
        action: 'reopen',
        status: 'closed',
        isStaff: true,
        isCustomer: false,
      }),
    ).toEqual({ status: 'in_progress', assignToSelf: false });
  });
});

describe('isTicketStatusAction', () => {
  it('recognises the supported actions', () => {
    expect(isTicketStatusAction('start')).toBe(true);
    expect(isTicketStatusAction('request-confirmation')).toBe(true);
    expect(isTicketStatusAction('confirm')).toBe(true);
    expect(isTicketStatusAction('reopen')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isTicketStatusAction('delete')).toBe(false);
    expect(isTicketStatusAction(42)).toBe(false);
  });
});
