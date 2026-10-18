import type { ManagedUser } from '@nocobase/app-plugin-users/client/user-client';

/** An account's display label, falling back through username and email. */
export function personName(user: ManagedUser): string {
  return user.name || user.username || user.email;
}
