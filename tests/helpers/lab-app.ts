import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Application } from '@nocobase/app-server/application';
import {
  createAppDisposerRegistry,
  type AppDisposer,
  type AppScope,
} from '@nocobase/app-server/runtime';

import { createServer } from '../../server/embedded.js';

/**
 * Boots the real application against a throwaway SQLite database.
 *
 * Migrations and seeds both run from source, so a test built on this helper
 * exercises the migrations, the seed fixtures and the HTTP layer exactly as a
 * fresh deployment would — nothing here is a mock.
 */

const AUTH_SECRET = 'nb3-factory-lab-test-secret-at-least-32-characters';

export interface LabTestApp {
  readonly app: Application;
  readonly directory: string;
  readonly baseUrl: string;
  /**
   * The mount path the application advertises, for example `/main`.
   *
   * A deployment serves the application under this path and the standalone
   * server strips it before the router sees a request. An embedded `app.fetch`
   * has no such adapter, so a URL the application produced still carries the
   * prefix while the router expects the path without it — `requestPath()`
   * reconciles the two.
   */
  readonly publicBasePath: string;
  /** Removes the deployment mount path from a URL when it carries one. */
  requestPath(path: string): string;
  /** Signs in and returns the `cookie` header value for later requests. */
  session(username: string, password?: string): Promise<string>;
  close(): Promise<void>;
}

function writeTestConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: AUTH_SECRET },
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
  return file;
}

export async function createLabTestApp(): Promise<LabTestApp> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const directory = mkdtempSync(path.join(tmpdir(), 'nb3-factory-lab-test-'));
  const storageDir = path.join(directory, 'storage');
  mkdirSync(storageDir, { recursive: true });
  const lifecycle = createAppDisposerRegistry();
  const disposers: AppDisposer[] = [];

  const scope: AppScope = {
    id: 'nb3-factory-lab-test',
    basePath: '',
    mode: 'embedded',
    env: {
      NODE_ENV: 'test',
      APP_CONFIG_FILE: writeTestConfig(directory),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir,
    },
    registerDisposer(name: string, dispose: AppDisposer) {
      disposers.push(dispose);
      lifecycle.registerDisposer(name, dispose);
    },
  };

  const app = await createServer(scope);
  const baseUrl = 'http://localhost';
  const publicBasePath = app.publicBasePath.replace(/\/$/, '');
  const requestPath = (url: string): string => {
    if (
      publicBasePath &&
      url.startsWith(publicBasePath) &&
      !url.startsWith(`${publicBasePath}/`)
    ) {
      // `/mainish` is a different path that merely shares a prefix.
      return url;
    }
    if (url === publicBasePath) {
      return '/';
    }
    return publicBasePath && url.startsWith(`${publicBasePath}/`)
      ? url.slice(publicBasePath.length)
      : url;
  };

  const sessions = new Map<string, string>();
  const session = async (
    username: string,
    password = 'admin123',
  ): Promise<string> => {
    const cached = sessions.get(username);
    if (cached) {
      return cached;
    }
    const response = await app.fetch(
      new Request(`${baseUrl}/api/auth/sign-in/username`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    );
    if (response.status !== 200) {
      throw new Error(
        `Sign-in for ${username} failed with ${response.status}: ${await response.text()}`,
      );
    }
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');
    if (!cookie) {
      throw new Error(`Sign-in for ${username} returned no session cookie.`);
    }
    sessions.set(username, cookie);
    return cookie;
  };

  return {
    app,
    directory,
    baseUrl,
    publicBasePath,
    requestPath,
    session,
    async close(): Promise<void> {
      await app.shutdown();
      await lifecycle.disposeAll();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export interface JsonResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

/** Sends a request through the application unchanged. */
export async function rawRequest(
  lab: LabTestApp,
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (cookie) {
    headers.set('cookie', cookie);
  }
  // A string body is JSON here; multipart bodies must carry the boundary fetch generates.
  if (typeof rest.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return lab.app.fetch(
    new Request(`${lab.baseUrl}${lab.requestPath(path)}`, { ...rest, headers }),
  );
}

/** Sends a request through the application and decodes a JSON body when there is one. */
export async function jsonRequest(
  lab: LabTestApp,
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<JsonResponse> {
  const response = await rawRequest(lab, path, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON responses (attachment bytes, HTML fallbacks) stay as text.
  }
  return { status: response.status, headers: response.headers, body };
}

/** Reads `{ data: T }` out of a JSON response and fails loudly when it is absent. */
export function dataOf<T>(response: JsonResponse): T {
  const body = response.body as { data?: T } | null;
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new Error(
      `Expected a data envelope, received: ${JSON.stringify(response.body)}`,
    );
  }
  return body.data as T;
}
