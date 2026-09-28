/**
 * The two fictional accounts the library demonstration ships with, kept in one
 * place so the account seed and the tests agree on them.
 *
 * These are demonstration identities, not production configuration: an
 * installation that does not want them can remove the seed before installing,
 * and nothing else in the application imports these names.
 */

export interface LibraryAccountFixture {
  /** Lowercase sign-in name; also the stable way a seed finds the row again. */
  readonly username: string;
  readonly name: string;
  readonly email: string;
  /** Shared by both demonstration accounts. */
  readonly password: string;
  /** The business role the permissions seed assigns. */
  readonly role: 'maintainer' | 'reader';
}

export const LIBRARY_ACCOUNTS: readonly LibraryAccountFixture[] = [
  {
    username: 'library.jia',
    name: '资料员甲',
    email: 'library.jia@example.com',
    password: 'Library#2026',
    role: 'maintainer',
  },
  {
    username: 'library.yi',
    name: '阅读者乙',
    email: 'library.yi@example.com',
    password: 'Library#2026',
    role: 'reader',
  },
];

/** The lowercased username seed data and tests look the maintainer up by. */
export const MAINTAINER_USERNAME = 'library.jia';
/** The lowercased username seed data and tests look the reader up by. */
export const READER_USERNAME = 'library.yi';
