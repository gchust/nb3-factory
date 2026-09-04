import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  createStandaloneServer,
  nodeServerConfig,
} from '@nocobase/app-server/node';
import type { ServiceToken } from '@nocobase/service-provider';

import appRuntime from '../../server/runtime.js';
import createServer from '../../server/embedded.js';

/** Absolute path of the application workspace (where tsconfig.json lives). */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** A freshly reserved temporary directory. Call dispose() to clean it up. */
export interface TempDir {
  readonly dir: string;
  readonly dbPath: string;
  readonly configPath: string;
  dispose(): void;
}

export function createTempConfig(): TempDir {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `nb3-equipment-test-${process.pid}-`),
  );
  const dbPath = path.join(dir, 'database.sqlite');
  const configPath = path.join(dir, 'config.yml');
  fs.writeFileSync(
    configPath,
    [
      'client:',
      '  app:',
      '    title: NocoBase Test',
      '',
      'auth:',
      `  secret: ${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`,
      '  emailAndPassword:',
      '    enabled: true',
      '  session:',
      '    storeSessionInDatabase: true',
      '',
      'notification:',
      '  channels:',
      '    - type: in-app',
      '      enabled: true',
      '      providers:',
      '        - type: database',
      '          name: primary',
      '',
      'database:',
      '  default: main',
      '  connections:',
      '    main:',
      '      dialect: sqlite',
      `      filename: ${dbPath}`,
      '      debug: false',
      '  migrations:',
      '    autoRun: true',
      '  seeds:',
      '    autoRun: true',
      '',
    ].join('\n'),
    'utf8',
  );
  return {
    dir,
    dbPath,
    configPath,
    dispose: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Request options understood by the API helpers below. */
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  cookie?: string;
}

export interface ApiTestContext {
  readonly dbPath: string;
  readonly configPath: string;
  readonly baseUrl: string;
  readonly apiBase: string;
  /** The underlying application instance (test-only introspection hook). */
  readonly application: {
    readonly container: {
      resolve<T>(token: ServiceToken<T>): T;
    };
  };
  /** Perform a JSON API call under /api and return the parsed response. */
  api(
    pathname: string,
    options?: ApiRequestOptions,
  ): Promise<{ status: number; body: unknown }>;
  /** Sign in with the email/password flow and return the session cookie. */
  signIn(email: string, password: string): Promise<string>;
  /** Register a brand-new user (returns their session cookie). */
  signUp(name: string, email: string, password: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Boots the real application (migrations + seeds auto-run) against a fresh
 * temporary SQLite database, exactly like a development server would.
 *
 * Pass a `configPath` from a previous boot to start a second server against
 * the same database (for restart scenarios).
 */
export async function bootTestApp(
  configPath?: string,
): Promise<ApiTestContext> {
  const temp =
    configPath === undefined
      ? createTempConfig()
      : {
          dir: path.dirname(configPath),
          dbPath: path.join(path.dirname(configPath), 'database.sqlite'),
          configPath,
          dispose: () => undefined,
        };
  const server = await createStandaloneServer({
    rootDir: WORKSPACE_ROOT,
    appRuntime,
    serverConfig: nodeServerConfig,
    createServer,
    configPath: temp.configPath,
  });
  const app = server.application;
  const baseUrl = 'http://app.test';

  async function api(
    pathname: string,
    options: ApiRequestOptions = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.cookie !== undefined) {
      headers.cookie = options.cookie;
    }
    const response = await app.fetch(
      new Request(`${baseUrl}/api${pathname}`, {
        method: options.method ?? 'GET',
        headers,
        body,
      }),
    );
    const text = await response.text();
    let parsed: unknown;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed };
  }

  async function signIn(email: string, password: string): Promise<string> {
    return withSessionCookie(
      await app.fetch(
        new Request(`${baseUrl}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }),
      ),
    );
  }

  async function signUp(
    name: string,
    email: string,
    password: string,
  ): Promise<string> {
    const response = await app.fetch(
      new Request(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      }),
    );
    if (response.status !== 200) {
      throw new Error(
        `Sign-up for ${email} failed with status ${response.status}.`,
      );
    }
    // Session cookies are not guaranteed on the sign-up response; signing in
    // afterwards always yields one.
    return signIn(email, password);
  }

  return {
    dbPath: temp.dbPath,
    configPath: temp.configPath,
    baseUrl,
    apiBase: `${baseUrl}/api`,
    application: app,
    api,
    signIn,
    signUp,
    close: () => server.close(),
  };
}

function withSessionCookie(response: Response): string {
  const setCookie: string[] =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  const cookies = setCookie
    .map((header) => header.split(';')[0])
    .filter((cookie) => cookie.length > 0);
  if (cookies.length === 0) {
    throw new Error(
      `Sign-in response carried no session cookie (status ${response.status}).`,
    );
  }
  return cookies.join('; ');
}

/** Extract a typed field from a parsed JSON API response body. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Expected an object payload, got ${String(value)}.`);
  }
  return value as Record<string, unknown>;
}

export function dataOf(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return asRecord(record.data);
}

/** Standard seeded admin credentials (created by the authentication plugin). */
export const ADMIN_EMAIL = 'admin@nocobase.com';
export const ADMIN_PASSWORD = 'admin123';

export const EMPLOYEE_EMAIL = 'employee@example.com';
export const EMPLOYEE_PASSWORD = 'employee123';
