/**
 * Demonstration accounts for the after-sales service system.
 *
 * They exist so the system can be tried out and verified with each job role.
 * The password is shared and fixed so a re-run is idempotent; replace or remove
 * these accounts before exposing the application in production.
 */

export const TEST_ACCOUNT_PASSWORD = 'Service@123';

export interface TestAccount {
  readonly key: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly permissionSet: string;
  readonly teamGroup?: string;
  readonly displayName?: string;
}

export const TEST_ACCOUNTS: readonly TestAccount[] = [
  {
    key: 'supervisor',
    name: '王主管',
    username: 'supervisor',
    email: 'supervisor@service.local',
    permissionSet: 'service-supervisor',
    teamGroup: 'supervisor',
    displayName: '王主管',
  },
  {
    key: 'engineerA',
    name: '李工（A组）',
    username: 'engineer.a',
    email: 'engineer.a@service.local',
    permissionSet: 'service-engineer',
    teamGroup: 'group_a',
    displayName: '李工',
  },
  {
    key: 'engineerB',
    name: '张工（B组）',
    username: 'engineer.b',
    email: 'engineer.b@service.local',
    permissionSet: 'service-engineer',
    teamGroup: 'group_b',
    displayName: '张工',
  },
  {
    key: 'observer',
    name: '陈观察',
    username: 'observer',
    email: 'observer@service.local',
    permissionSet: 'service-observer',
    displayName: '陈观察',
  },
  {
    key: 'integration',
    name: '设备平台集成',
    username: 'integration',
    email: 'integration@service.local',
    permissionSet: 'service-integration',
    displayName: '设备平台',
  },
];

export function accountByKey(key: string): TestAccount {
  const account = TEST_ACCOUNTS.find((item) => item.key === key);
  if (!account) {
    throw new Error(`Unknown test account: ${key}`);
  }
  return account;
}
