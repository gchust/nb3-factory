/**
 * Translating an option list once for every control that shows it.
 *
 * `LabOption` carries a message key rather than a label, because the same list is read in a table
 * cell, a select and a form; translating it at each of those places would spell out the same call
 * three times.
 */
import type { LabOption, LabRole } from './lab-types.js';

/** The translator a component already holds, narrowed to what these helpers need. */
export type Translate = (key: string) => string;

export function optionLabel(option: LabOption, t: Translate): string {
  return t(option.labelKey);
}

export function optionLabels(
  options: readonly LabOption[],
  t: Translate,
): { value: string; label: string }[] {
  return options.map((option) => ({
    value: option.value,
    label: optionLabel(option, t),
  }));
}

/** The label of the option holding `value`, or the raw value when the list does not hold it. */
export function labelFor(
  options: readonly LabOption[],
  value: string | null | undefined,
  t: Translate,
): string {
  if (value === null || value === undefined || value === '') return '';
  const option = options.find((item) => item.value === value);
  return option ? optionLabel(option, t) : value;
}

/** Role titles are read from the same list of choices as every other enumeration. */
export const ROLE_LABEL_KEYS: Record<LabRole, string> = {
  lab_admin: 'lab.role.labAdmin',
  teacher: 'lab.role.teacher',
  technician: 'lab.role.technician',
  safety_officer: 'lab.role.safetyOfficer',
  student: 'lab.role.student',
};
