import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Creates the two accounts the library is demonstrated with:
 *
 * - `资料员甲` / `library_editor` / `LibraryEditor@123` — the editor.
 * - `阅读者乙` / `library_reader` / `LibraryReader@123` — the reader.
 *
 * The administrator is the one the authentication plugin already creates
 * (`nocobase` / `admin@nocobase.com` / `admin123`).
 *
 * The account data is declared inside this seed rather than imported from a
 * shared module on purpose: seeds are run both from source (under Node's
 * native TypeScript loader, which resolves only the specifiers that literally
 * exist on disk) and from the compiled output, and a seed is a snapshot that
 * must not change meaning when another file does. Keep it self-contained.
 */

interface LibraryAccountSeed {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

/**
 * Ids are fixed so the document seed can name the editor as the owner without
 * a lookup, and so a re-run is a no-op.
 */
const LIBRARY_EDITOR_ACCOUNT: LibraryAccountSeed = {
  id: '10000000-0000-4000-8000-000000000001',
  username: 'library_editor',
  email: 'library_editor@example.com',
  name: '资料员甲',
  password: 'LibraryEditor@123',
};

const LIBRARY_READER_ACCOUNT: LibraryAccountSeed = {
  id: '10000000-0000-4000-8000-000000000002',
  username: 'library_reader',
  email: 'library_reader@example.com',
  name: '阅读者乙',
  password: 'LibraryReader@123',
};

const seed = defineSeed({
  name: '202609210001_library_accounts',
  async run({ query }) {
    const accounts: readonly LibraryAccountSeed[] = [
      LIBRARY_EDITOR_ACCOUNT,
      LIBRARY_READER_ACCOUNT,
    ];

    for (const account of accounts) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('id', '=', account.id)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      const passwordHash = await hashPassword(account.password);

      await query
        .insertInto('user')
        .values({
          id: account.id,
          name: account.name,
          username: account.username,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          accountId: account.id,
          providerId: 'credential',
          userId: account.id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
