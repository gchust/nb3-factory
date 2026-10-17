import type { Repository } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

export interface LibrarySeedUser {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string;
  permissionSetKey: string;
}

export const LIBRARY_ACCOUNT_PASSWORD = 'Library123!';

/**
 * Demonstration accounts for the two library jobs. They exist so the initial permission configuration can be
 * assigned to known people; an administrator can disable them or change their assignments afterwards.
 */
export const LIBRARY_USERS: readonly LibrarySeedUser[] = [
  {
    id: '1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0001',
    name: '陈嘉禾',
    email: 'jiahe.chen@example.com',
    username: 'jiahe.chen',
    password: LIBRARY_ACCOUNT_PASSWORD,
    permissionSetKey: 'library.librarian',
  },
  {
    id: '1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0002',
    name: '林知夏',
    email: 'zhixia.lin@example.com',
    username: 'zhixia.lin',
    password: LIBRARY_ACCOUNT_PASSWORD,
    permissionSetKey: 'library.reader',
  },
  {
    id: '1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0003',
    name: '周以宁',
    email: 'yining.zhou@example.com',
    username: 'yining.zhou',
    password: LIBRARY_ACCOUNT_PASSWORD,
    permissionSetKey: 'library.librarian',
  },
  {
    id: '1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0004',
    name: '苏明远',
    email: 'mingyuan.su@example.com',
    username: 'mingyuan.su',
    password: LIBRARY_ACCOUNT_PASSWORD,
    permissionSetKey: 'library.reader',
  },
];

export const LIBRARY_USER_IDS = {
  jia: LIBRARY_USERS[0].id,
  lin: LIBRARY_USERS[1].id,
  zhou: LIBRARY_USERS[2].id,
  su: LIBRARY_USERS[3].id,
} as const;

export interface LibraryUserRecord {
  id: string;
  name: string;
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryAccountRecord {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a person and the email/password account Better Auth signs them in with. A rerun fills in only what is
 * missing, so an administrator's changed name or password is left alone.
 */
export async function ensureLibraryUser(
  user: Repository<LibraryUserRecord>,
  account: Repository<LibraryAccountRecord>,
  seed: LibrarySeedUser,
): Promise<void> {
  const now = new Date();
  const existingUser = await user.findOne({ filter: { id: seed.id } });
  if (!existingUser) {
    await user.createOne({
      values: {
        id: seed.id,
        name: seed.name,
        email: seed.email,
        username: seed.username,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const accountId = `${seed.username}:credential`;
  const existingAccount = await account.findOne({
    filter: { id: accountId },
  });
  if (!existingAccount) {
    await account.createOne({
      values: {
        id: accountId,
        accountId: seed.id,
        providerId: 'credential',
        userId: seed.id,
        password: await hashPassword(seed.password),
        createdAt: now,
        updatedAt: now,
      },
    });
  }
}
