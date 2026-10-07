import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demonstration accounts so the reimbursement workflow can be exercised end to end.
 *
 * This is sample data for a development installation, which is what the application template ships with: the accounts
 * exist to show the roles the workflow distinguishes (an employee, a department supervisor, finance, and a second
 * department). Nothing here is required for the feature to run — an installation whose people already exist ignores it,
 * because every row is looked up by its natural key first and only inserted when it is missing.
 *
 * The password is deliberately weak and shared: these are demonstration credentials, never production ones.
 */
const SAMPLE_PASSWORD = 'demo12345';

const SAMPLE_USERS = [
  // An ordinary employee in Engineering: files claims, sees only their own.
  {
    username: 'zhangsan',
    name: '张三 Zhang San',
    email: 'zhangsan@example.com',
  },
  // Manages Engineering: approves the claims of that department.
  { username: 'lisi', name: '李四 Li Si', email: 'lisi@example.com' },
  // An ordinary employee in Sales.
  { username: 'wangwu', name: '王五 Wang Wu', email: 'wangwu@example.com' },
  // Manages Sales and its child department Marketing.
  { username: 'zhaoliu', name: '赵六 Zhao Liu', email: 'zhaoliu@example.com' },
  // Finance: reviews claims over the threshold and registers payments.
  { username: 'qianqi', name: '钱七 Qian Qi', email: 'qianqi@example.com' },
] as const;

interface UserRow {
  id: string;
  name: string;
  username: string | null;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountRow {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default defineSeed({
  name: '202610010010_expense_sample_users',
  transaction: true,
  async run(context) {
    // `context.repository` is a method on the context object; calling it off the object keeps `this` intact.
    const users = context.repository<UserRow>('user');
    const accounts = context.repository<AccountRow>('account');

    for (const sample of SAMPLE_USERS) {
      const existing = await users.findOne({
        filter: { username: sample.username },
      });
      if (existing) {
        continue;
      }
      const now = new Date();
      const userId = crypto.randomUUID();
      await users.createOne({
        values: {
          id: userId,
          name: sample.name,
          username: sample.username,
          email: sample.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      await accounts.createOne({
        values: {
          id: crypto.randomUUID(),
          // Better Auth's credential provider keys the account by the user id.
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(SAMPLE_PASSWORD),
          createdAt: now,
          updatedAt: now,
        } as AccountRow,
      });
    }
  },
});
