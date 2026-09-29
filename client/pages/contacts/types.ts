/** Stable department codes; the labels live in the locale files. */
export const CONTACT_DEPARTMENTS = ['rd', 'sales', 'admin'] as const;

export type ContactDepartment = (typeof CONTACT_DEPARTMENTS)[number];

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly department: ContactDepartment;
  readonly phone: string | null;
  readonly notes: string | null;
}

/** The body the create and edit dialogs send to the contacts endpoint. */
export interface ContactInput {
  readonly name: string;
  readonly department: ContactDepartment;
  readonly phone: string | null;
  readonly notes: string | null;
}

export function isContactDepartment(
  value: string | null,
): value is ContactDepartment {
  return value !== null && CONTACT_DEPARTMENTS.some((code) => code === value);
}

/**
 * What the list page passes to its child routes (create and edit dialogs)
 * through `<Outlet context>`.
 */
export interface ContactsOutletContext {
  /** Refreshes the list in the background after a successful save. */
  readonly reload: () => void;
}
