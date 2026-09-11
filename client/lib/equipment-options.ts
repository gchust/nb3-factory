/**
 * Fixed vocabulary shared by the server validation and every form/select.
 * Keep in sync with `server/providers/equipment-inspection.ts`.
 */
export const EQUIPMENT_STATUSES = [
  'running',
  'maintenance',
  'stopped',
  'scrapped',
] as const;

export const INSPECTION_CONCLUSIONS = ['normal', 'issue', 'major'] as const;

/** Resolves a literal to a translation key; falls back to the literal. */
export type Translate = (key: string) => string;

/** Describes how to translate a status literal. */
export function describeStatus(status: string, t: Translate): string {
  switch (status) {
    case 'running':
      return t('equipment.status.running');
    case 'maintenance':
      return t('equipment.status.maintenance');
    case 'stopped':
      return t('equipment.status.stopped');
    case 'scrapped':
      return t('equipment.status.scrapped');
    default:
      return status;
  }
}

/** Describes how to translate an inspection conclusion literal. */
export function describeConclusion(conclusion: string, t: Translate): string {
  switch (conclusion) {
    case 'normal':
      return t('equipment.conclusion.normal');
    case 'issue':
      return t('equipment.conclusion.issue');
    case 'major':
      return t('equipment.conclusion.major');
    default:
      return conclusion;
  }
}

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

/** Maps a status literal to the badge tone that conveys its meaning. */
export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'running':
      return 'default';
    case 'maintenance':
      return 'secondary';
    case 'stopped':
      return 'outline';
    case 'scrapped':
      return 'destructive';
    default:
      return 'secondary';
  }
}
