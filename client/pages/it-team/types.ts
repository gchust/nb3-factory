import type { UseTranslationResponse } from '@nocobase/i18n/client';

export type TFunction = UseTranslationResponse<never, undefined>['t'];

/**
 * The permission sets the service desk may assign through the application role
 * scope. `it-employee` is deliberately absent: every authenticated account
 * receives it through the default assignment, and the Users API excludes
 * defaulted sets from direct assignment.
 */
export const TEAM_ROLES = ['it-engineer', 'it-service-desk'] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];
export type TeamRoleChoice = TeamRole | 'default';

export function directRoles(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' && value ? [value] : [];
}

export function currentRole(value: unknown): TeamRoleChoice {
  const roles = directRoles(value);
  return TEAM_ROLES.find((role) => roles.includes(role)) ?? 'default';
}

export function roleLabel(t: TFunction, role: TeamRoleChoice): string {
  return t(`serviceDesk.roles.${role === 'default' ? 'default' : role}`);
}
