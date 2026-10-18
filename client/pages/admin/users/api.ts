import type { ApiClient } from '@nocobase/app-client';
import {
  UsersClient,
  type ListUsersInput,
  type ManagedUser,
  type ManagedUserPage,
  type UserRoleValue,
  type UsersOptions,
} from '@nocobase/app-plugin-users/client/user-client';

function client(api: ApiClient): UsersClient {
  return new UsersClient(api);
}

export function listManagedUsers(
  api: ApiClient,
  input: ListUsersInput,
): Promise<ManagedUserPage> {
  return client(api).list(input);
}

export function loadUsersOptions(api: ApiClient): Promise<UsersOptions> {
  return client(api).options();
}

/**
 * There is no single-user read endpoint. The management page loads the small list once more to find the selected
 * account, which also keeps the route working after a page refresh.
 */
export async function findManagedUser(
  api: ApiClient,
  userId: string,
): Promise<ManagedUser | undefined> {
  const page = await client(api).list({ page: 1, pageSize: 200 });
  return page.items.find((user) => user.id === userId);
}

export function disableManagedUser(
  api: ApiClient,
  userId: string,
): Promise<ManagedUser> {
  return client(api).disable(userId);
}

export function enableManagedUser(
  api: ApiClient,
  userId: string,
): Promise<ManagedUser> {
  return client(api).enable(userId);
}

export function revokeManagedUserSessions(
  api: ApiClient,
  userId: string,
): Promise<void> {
  return client(api).revokeSessions(userId);
}

export function replaceManagedUserRoleScope(
  api: ApiClient,
  userId: string,
  scope: string,
  value: UserRoleValue,
): Promise<ManagedUser> {
  return client(api).replaceRoleScope(userId, scope, value);
}
