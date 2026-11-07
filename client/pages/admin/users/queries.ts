import type { ListUsersInput } from '@nocobase/app-plugin-users/client/user-client';

export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  list: (input: ListUsersInput) =>
    [...adminUserKeys.all, 'list', input] as const,
  options: () => [...adminUserKeys.all, 'options'] as const,
  user: (userId: string) => [...adminUserKeys.all, 'user', userId] as const,
};
