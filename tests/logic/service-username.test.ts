import { describe, expect, it } from 'vitest';

import { isServiceUsername } from '../../server/config/auth.js';

describe('service username rule', () => {
  it('accepts the hyphenated accounts the application issues', () => {
    for (const name of [
      'svc-admin',
      'svc-manager',
      'svc-east',
      'svc-south2',
      'svc-observer',
      'svc-integration',
      'nocobase',
      'qa-verify-user',
      'user_1',
      'user.name',
    ]) {
      expect(isServiceUsername(name)).toBe(true);
    }
  });

  it('still rejects usernames with characters the application does not store', () => {
    for (const name of [
      'missing user',
      'bad@name',
      'has/slash',
      'plus+name',
      '',
      'tab\tname',
    ]) {
      expect(isServiceUsername(name)).toBe(false);
    }
  });
});
