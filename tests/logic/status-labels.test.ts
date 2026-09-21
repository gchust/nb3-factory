import { describe, expect, it } from 'vitest';

import {
  memberRoleLabel,
  memberRoleOptions,
} from '../../client/lib/status-labels.js';

const t = (key: string): string => key;

describe('application role labels', () => {
  it('maps every role to a translation key', () => {
    expect(memberRoleLabel(t, 'lead')).toBe('delivery.roles.lead');
    expect(memberRoleLabel(t, 'manager')).toBe('delivery.roles.manager');
    expect(memberRoleLabel(t, 'acceptor')).toBe('delivery.roles.acceptor');
    expect(memberRoleLabel(t, 'finance')).toBe('delivery.roles.finance');
    expect(memberRoleLabel(t, 'member')).toBe('delivery.roles.member');
  });

  it('falls back to the raw value for an unknown role', () => {
    expect(memberRoleLabel(t, 'auditor')).toBe('auditor');
  });

  it('offers the four business roles plus the lead', () => {
    expect(memberRoleOptions(t).map((option) => option.value)).toEqual([
      'lead',
      'manager',
      'acceptor',
      'finance',
      'member',
    ]);
  });
});
