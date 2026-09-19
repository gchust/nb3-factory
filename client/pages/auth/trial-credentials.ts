/**
 * Trial sign-in details for the sample data shipped by the quality seeds.
 *
 * The credentials are fictitious and exist so each business role can be tried
 * without an administrator resetting a password. `tests/logic/quality-data.test.ts`
 * asserts they match `database/main/seeds/202609190002_seed_quality_roles_and_users.ts`,
 * so the two copies cannot drift apart unnoticed.
 */
export const TRIAL_PASSWORD = 'Quality-2026';

export interface TrialAccount {
  readonly username: string;
  readonly roleKey: string;
  readonly roleDefault: string;
}

export const TRIAL_ACCOUNTS: readonly TrialAccount[] = [
  {
    username: 'qc.supervisor',
    roleKey: 'auth.trialRoleSupervisor',
    roleDefault: 'Quality supervisor',
  },
  {
    username: 'qc.inspector',
    roleKey: 'auth.trialRoleInspector',
    roleDefault: 'Inspector',
  },
  {
    username: 'qc.inspector2',
    roleKey: 'auth.trialRoleInspectorTwo',
    roleDefault: 'Inspector (second)',
  },
  {
    username: 'prod.lead',
    roleKey: 'auth.trialRoleProductionLead',
    roleDefault: 'Production lead',
  },
];
