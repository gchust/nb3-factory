import type {
  ManagedUser,
  UserRoleValue,
  UsersOptions,
} from '@nocobase/app-plugin-users/client/user-client';

/**
 * What the staff list passes to the child route that edits one person's permission sets. The list already loaded the
 * people and the available options; the Users API has no "get one by id", so the editor reads them from here.
 */
export interface StaffOutletContext {
  readonly users: ManagedUser[] | undefined;
  readonly options: UsersOptions | undefined;
  readonly reload: () => void;
}

/**
 * One scope's value as a list. `Array.isArray` cannot be used here: it narrows a `readonly string[]` to `any[]`, which
 * the type-checked lint rules reject. A role value is either a single set or several.
 */
export function roleScopeValues(value: UserRoleValue | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : [...value];
}
