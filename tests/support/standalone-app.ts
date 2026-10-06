import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

/**
 * Boots the real application against an isolated SQLite file inside a temporary
 * directory, with this application's migrations and seeds applied. Used by the
 * CRM route tests, which need a signed-in session and a real database rather
 * than a mocked container.
 *
 * Mirrors the application's own runtime paths so `database/main` is the source
 * of migrations and seeds, but points storage and the database file away from
 * the working tree.
 */
export interface TestStandaloneApp {
  readonly app: StandaloneServer;
  /** Origin plus public base path, e.g. `http://localhost/main`. */
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

export async function createTestStandaloneApp(): Promise<TestStandaloneApp> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nb3-crm-app-'));
  const configFile = path.join(directory, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(directory, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const app = await createStandaloneServer({
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      // Pins the Better Auth base URL so cookie-bearing writes pass the origin
      // check the same way they do in a browser.
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });

  return {
    app,
    baseUrl: `http://localhost${app.application.publicBasePath}`,
    close: async () => {
      try {
        await app.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

export interface SignedInSession {
  readonly cookie: string;
}

/** Signs in with the seeded root account and returns the session cookie. */
export async function signIn(
  fixture: TestStandaloneApp,
  username = 'nocobase',
  password = 'admin123',
): Promise<SignedInSession> {
  const response = await fixture.app.fetch(
    new Request(`${fixture.baseUrl}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (response.status !== 200) {
    throw new Error(
      `Sign-in failed with ${response.status}: ${await response.text()}`,
    );
  }
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return { cookie };
}
