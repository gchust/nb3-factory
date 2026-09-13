import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createConfigContext,
  createConfigPaths,
} from '@nocobase/app-server/config';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';
import { resolveAppRouting } from '@nocobase/app-server/runtime';
import { authenticationConfig } from '@nocobase/app-plugin-authentication/server';

import { createAppConfig } from '../../server/config/index.js';

/** Shape of the `auth` namespace the application extends; the schema uses
 * `additionalProperties: true`, so `account` is valid config the TypeBox static
 * type does not describe. */
interface AuthConfigShape {
  secret?: string;
  emailAndPassword?: { enabled?: boolean; autoSignIn?: boolean };
  account?: {
    additionalFields?: {
      issuer?: { defaultValue?: unknown; input?: unknown; required?: unknown };
    };
  };
}

function readAuth(config: ReturnType<typeof createAppConfig>): AuthConfigShape {
  return config.get(authenticationConfig) as unknown as AuthConfigShape;
}

/**
 * Builds the runtime config context that `createAppConfig` consumes. `configPath`
 * is optional: without it the loader falls back to `APP_CONFIG_FILE`/`config.yml`,
 * which is what the tests exercise by pointing at a temporary file.
 */
function runtimeConfigEnv(
  configPath?: string,
): ResolvedAppRuntimeConfigContext {
  const paths = createConfigPaths({ rootDir: process.cwd() });
  const environment = configPath ? { APP_CONFIG_FILE: configPath } : {};
  return {
    ...createConfigContext({ env: environment, paths }),
    mode: 'standalone',
    routing: resolveAppRouting({
      name: 'nb3-factory-test',
      publicBasePath: '/main',
      internalBasePath: '/main',
    }),
    runtimePaths: {} as never,
    // Core config defaults read the resolved plugin list; an empty plugin array
    // is enough for the `auth` namespace under test.
    plugins: {
      appPackageName: 'nb3-factory-test',
      plugins: [],
    } as never,
    appPackageName: 'nb3-factory-test',
    configPath,
    // The authentication plugin contributes the `auth` namespace, exactly as it
    // does in the running application.
    configs: [authenticationConfig],
  } as unknown as ResolvedAppRuntimeConfigContext;
}

describe('auth account issuer configuration', () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'auth-issuer-config-'));
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('declares account.issuer for Better Auth when the config file omits it', async () => {
    const appConfig = createAppConfig(runtimeConfigEnv());
    await appConfig.loadAll();

    const auth = readAuth(appConfig);
    const issuer = auth.account?.additionalFields?.issuer;

    // `input: false` keeps the value server-owned; `defaultValue` is what Better
    // Auth writes into the NOT NULL `account.issuer` column on sign-up.
    expect(issuer?.defaultValue).toBe('local:credential');
    expect(issuer?.input).toBe(false);
  });

  it('keeps the deployment auth settings while adding the issuer default', async () => {
    const configPath = join(directory, 'config.yml');
    writeFileSync(
      configPath,
      [
        'auth:',
        '  secret: "a-deployment-supplied-secret-value"',
        '  emailAndPassword:',
        '    enabled: true',
        '    autoSignIn: false',
        '  session:',
        '    storeSessionInDatabase: true',
        '',
      ].join('\n'),
    );

    const appConfig = createAppConfig(runtimeConfigEnv(configPath));
    await appConfig.loadAll();

    const auth = readAuth(appConfig);
    expect(auth.secret).toBe('a-deployment-supplied-secret-value');
    expect(auth.emailAndPassword).toMatchObject({
      enabled: true,
      autoSignIn: false,
    });
    expect(auth.account?.additionalFields?.issuer?.defaultValue).toBe(
      'local:credential',
    );
  });
});
