/**
 * Demonstration accounts shipped with the service application. They exist so a
 * fresh installation can be exercised end to end; a production deployment is
 * expected to replace them with real accounts. Creating them is a demo seed,
 * separate from the permission configuration, and it never touches the
 * installation's own administrator.
 */
export interface DemoAccount {
  username: string;
  name: string;
  email: string;
  /** The job this account demonstrates. Never enforced by the seed itself. */
  role: 'supervisor' | 'engineer' | 'observer' | 'integration';
  /** Engineer group code, for engineers only. */
  group?: 'A' | 'B';
}

export const DEMO_PASSWORD = 'Demo@12345';

export const demoAccounts: readonly DemoAccount[] = [
  {
    username: 'supervisor',
    name: '孙主管',
    email: 'supervisor@example.com',
    role: 'supervisor',
  },
  {
    username: 'engineer.a1',
    name: '陈工',
    email: 'engineer.a1@example.com',
    role: 'engineer',
    group: 'A',
  },
  {
    username: 'engineer.a2',
    name: '刘工',
    email: 'engineer.a2@example.com',
    role: 'engineer',
    group: 'A',
  },
  {
    username: 'engineer.b1',
    name: '赵工',
    email: 'engineer.b1@example.com',
    role: 'engineer',
    group: 'B',
  },
  {
    username: 'observer',
    name: '钱观察',
    email: 'observer@example.com',
    role: 'observer',
  },
  {
    username: 'integration',
    name: '外部平台集成账号',
    email: 'integration@example.com',
    role: 'integration',
  },
];

export const demoTeams: readonly {
  code: 'A' | 'B';
  name: string;
  description: string;
}[] = [
  { code: 'A', name: '工程师 A 组', description: '华东区现场服务 A 组' },
  { code: 'B', name: '工程师 B 组', description: '华东区现场服务 B 组' },
];
