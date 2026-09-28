// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
  type SeedContext,
} from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import materialsSampleData from '../../database/main/seeds/202609280002_materials_sample_data.ts';
import materialsSampleAccounts from '../../database/main/seeds/202609280003_materials_sample_accounts.ts';
import materialsPermissionSets from '../../database/main/seeds/202609280004_materials_permission_sets.ts';
import { SEARCH_MATERIALS_TOOL } from '../../server/ai/tools/search-materials.ts';
import {
  MATERIALS_COLLEAGUE_SET,
  MATERIALS_MANAGER_SET,
  materialsServiceToken,
  type Material,
  type MaterialsOverview,
  type MaterialsService,
} from '../../server/providers/materials.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

const PASSWORD = 'Materials123';
// Browsers send an Origin header on writes, and better-auth rejects a
// cookie-authenticated write without a trusted origin. Requests carry it here
// for the same reason a browser does.
const PUBLIC_ORIGIN = 'http://localhost';
const MANAGER_USERNAME = 'materials.manager';
const COLLEAGUE_USERNAME = 'materials.colleague';
const MANAGER_ONLY_SLUG = 'classified-project-codename';
const REPAIR_HOTLINE_SLUG = 'blue-heron-repair-hotline';
const INSPECTION_SLUG = 'blue-heron-inspection-interval';

const tempDirs: string[] = [];
let server: StandaloneServer;
let baseUrl: string;
let database: DatabaseManager;
let service: MaterialsService;
let managerId: string;
let colleagueId: string;
let managerCookie: string;
let colleagueCookie: string;

interface MaterialRow {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly audience: string;
}

/**
 * The materials assistant, end to end against a real database.
 *
 * One standalone application is booted with migrations and seeds, which is what
 * makes this a test of the deployed behavior rather than of a mock: the
 * samples, the two accounts, the role markers, the sign-in path and the HTTP
 * route all have to line up. Every assertion below is a rule the feature
 * promises — a colleague sees two materials and never the third, a colleague
 * cannot edit, a manager can, an edit reaches the colleague's next read, and
 * the assistant's tool can only see what the asker may see.
 */
beforeAll(async () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nb3-materials-assistant-'),
  );
  tempDirs.push(directory);
  const clientDir = path.join(directory, 'client');
  mkdirSync(clientDir, { recursive: true });
  writeFileSync(
    path.join(clientDir, 'index.html'),
    '<main>materials assistant test</main>',
  );
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

  server = await createStandaloneServer({
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_PUBLIC_ORIGIN: PUBLIC_ORIGIN,
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir,
      storageDir: path.join(directory, 'storage'),
    },
  });

  baseUrl = `http://localhost${server.application.publicBasePath}`;
  database = server.application.container.resolve(databaseManagerToken);
  service = server.application.container.resolve(materialsServiceToken);

  managerId = await userIdOf(MANAGER_USERNAME);
  colleagueId = await userIdOf(COLLEAGUE_USERNAME);
  managerCookie = await signIn(MANAGER_USERNAME);
  colleagueCookie = await signIn(COLLEAGUE_USERNAME);
}, 240_000);

afterAll(async () => {
  await server?.close();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('materials assistant', () => {
  it('seeds the three materials, the two accounts and their role markers', async () => {
    const rows = await listMaterialRows();
    expect(rows.map((row) => row.slug)).toEqual([
      REPAIR_HOTLINE_SLUG,
      INSPECTION_SLUG,
      MANAGER_ONLY_SLUG,
    ]);
    expect(rows.map((row) => row.audience)).toEqual(['all', 'all', 'manager']);
    expect(rows[0].body).toContain('400-000-7316');
    expect(rows[1].body).toContain('45 天');
    expect(rows[2].body).toContain('墨竹 729');

    for (const username of [MANAGER_USERNAME, COLLEAGUE_USERNAME]) {
      const users = await database
        .query()
        .selectFrom('user')
        .select(['id', 'username'])
        .where('username', '=', username)
        .execute<{ readonly id: string }>();
      expect(users).toHaveLength(1);
    }

    const sets = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title'])
      .execute<{ readonly key: string; readonly title: string }>();
    const byKey = new Map(sets.map((set) => [set.key, set.title]));
    expect(byKey.has(MATERIALS_MANAGER_SET)).toBe(true);
    expect(byKey.has(MATERIALS_COLLEAGUE_SET)).toBe(true);
    // Titles travel as an authorization descriptor, so the Users page renders
    // both markers in the application's own namespace rather than raw English.
    expect(JSON.parse(byKey.get(MATERIALS_MANAGER_SET) ?? '')).toEqual({
      key: 'permissionSets.materials.manager',
      ns: 'nb3-factory',
    });

    const assignments = await database
      .query()
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .execute<{ readonly id: string }>();
    // Other assignments exist (the built-in default set and the root account),
    // so only the two role markers this feature adds are asserted.
    const ids = assignments.map((assignment) => assignment.id);
    expect(ids).toContain(`user:${managerId}:${MATERIALS_MANAGER_SET}`);
    expect(ids).toContain(`user:${colleagueId}:${MATERIALS_COLLEAGUE_SET}`);
  });

  it('rejects anonymous callers', async () => {
    expect((await request('/api/materials')).status).toBe(401);
    expect(
      (
        await request('/api/materials/1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'nope' }),
        })
      ).status,
    ).toBe(401);
  });

  it('shows a colleague the two shared materials and never the third', async () => {
    const response = await request('/api/materials', {
      headers: { cookie: colleagueCookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: MaterialsOverview };
    expect(body.data.canManage).toBe(false);
    expect(body.data.materials.map((material) => material.slug).sort()).toEqual(
      [INSPECTION_SLUG, REPAIR_HOTLINE_SLUG],
    );

    const hidden = (await listMaterialRows()).find(
      (row) => row.slug === MANAGER_ONLY_SLUG,
    );
    expect(hidden).toBeDefined();
    const direct = await request(`/api/materials/${hidden?.id}`, {
      headers: { cookie: colleagueCookie },
    });
    expect(direct.status).toBe(404);
  });

  it('refuses a colleague who tries to edit a material', async () => {
    const visible = (await listMaterialRows()).find(
      (row) => row.slug === REPAIR_HOTLINE_SLUG,
    );
    const before = visible?.body;
    const response = await request(`/api/materials/${visible?.id}`, {
      method: 'PATCH',
      headers: { cookie: colleagueCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: '被改写的标题' }),
    });
    expect(response.status).toBe(403);
    expect((await getMaterialBySlug(REPAIR_HOTLINE_SLUG)).body).toBe(before);
  });

  it('lets a manager read every material and edit one, and rejects blank input', async () => {
    const listResponse = await request('/api/materials', {
      headers: { cookie: managerCookie },
    });
    expect(listResponse.status).toBe(200);
    const overview = (await listResponse.json()) as { data: MaterialsOverview };
    expect(overview.data.canManage).toBe(true);
    expect(overview.data.materials.map((material) => material.slug)).toEqual([
      REPAIR_HOTLINE_SLUG,
      INSPECTION_SLUG,
      MANAGER_ONLY_SLUG,
    ]);

    const target = overview.data.materials[0];
    const updatedBody = `${target.body}\n备用报修电话为 010-1234-5678。`;
    const patch = await request(`/api/materials/${target.id}`, {
      method: 'PATCH',
      headers: { cookie: managerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ body: updatedBody }),
    });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as { data: Material }).data.body).toBe(
      updatedBody,
    );

    const blankTitle = await request(`/api/materials/${target.id}`, {
      method: 'PATCH',
      headers: { cookie: managerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(blankTitle.status).toBe(400);

    // The edit is a stored change, so the colleague's next read sees it.
    const reread = await request(`/api/materials/${target.id}`, {
      headers: { cookie: colleagueCookie },
    });
    expect(reread.status).toBe(200);
    expect(((await reread.json()) as { data: Material }).data.body).toBe(
      updatedBody,
    );
  });

  it('answers only from what the asker may view, and follows an edit', async () => {
    // The hidden material is unreachable through search, which is the boundary
    // a pre-written answer or a leaky tool would break.
    expect(await service.search({ id: colleagueId }, '墨竹 729')).toEqual([]);
    expect(
      (await service.search({ id: managerId }, '墨竹 729')).map(
        (material) => material.slug,
      ),
    ).toEqual([MANAGER_ONLY_SLUG]);

    const visible = await service.search(
      { id: colleagueId },
      '蓝鹭设备报修电话',
    );
    expect(visible[0]?.slug).toBe(REPAIR_HOTLINE_SLUG);
    // Written by the manager in the test above, so a colleague asking again
    // after the edit is answered from the new content.
    expect(visible[0]?.body).toContain('010-1234-5678');
  });

  it('registers a single-tool, read-only assistant', async () => {
    const ai = server.application.container.resolve(aiManagerToken);
    const employee = await ai.employeeManager.getEmployee(
      'materials-assistant',
    );
    expect(employee).toBeDefined();
    // Only the search tool is enabled, which is what keeps the general data,
    // chart, form, web-search and sub-agent tools out of this assistant.
    expect(employee?.skillSettings.enabledTools).toEqual([
      SEARCH_MATERIALS_TOOL,
    ]);
    expect(employee?.skillSettings.enabledSkills).toEqual([]);

    const tool = await ai.toolsManager.getTools(SEARCH_MATERIALS_TOOL);
    expect(tool).toBeDefined();
    expect(tool?.scope).toBe('SPECIFIED');
  });

  it('returns the hidden material to a manager through the tool and nothing to a colleague', async () => {
    const hidden = await invokeSearch(colleagueId, '墨竹 729');
    expect(hidden.content.total).toBe(0);
    expect(hidden.content.matches).toEqual([]);
    expect(hidden.content.note).toContain('insufficient');

    const visible = await invokeSearch(managerId, '墨竹 729');
    expect(
      visible.content.matches.map((match: { slug: string }) => match.slug),
    ).toEqual([MANAGER_ONLY_SLUG]);
    expect(visible.content.note).toBeUndefined();
  });

  it('leaves seeded data and manager edits alone when the seeds run again', async () => {
    const before = await getMaterialBySlug(REPAIR_HOTLINE_SLUG);
    const context = {
      config: {},
      container: server.application.container,
      repository: (collection: string) => database.repository(collection),
      query: database.query(),
      connection: database.connection(),
    } as unknown as SeedContext;

    await materialsSampleData.run(context);
    await materialsSampleAccounts.run(context);
    await materialsPermissionSets.run(context);

    expect(await listMaterialRows()).toHaveLength(3);
    expect(
      await database
        .query()
        .selectFrom('user')
        .select('id')
        .where('username', '=', MANAGER_USERNAME)
        .execute<{ readonly id: string }>(),
    ).toHaveLength(1);
    expect((await getMaterialBySlug(REPAIR_HOTLINE_SLUG)).body).toBe(
      before.body,
    );
  });
});

async function invokeSearch(
  actorId: string,
  query: string,
): Promise<{
  readonly content: {
    readonly total: number;
    readonly matches: readonly { readonly slug: string }[];
    readonly note?: string;
  };
}> {
  const tool = await server.application.container
    .resolve(aiManagerToken)
    .toolsManager.getTools(SEARCH_MATERIALS_TOOL);
  if (!tool) {
    throw new Error('The search-materials tool is not registered.');
  }
  return tool.invoke(
    {
      deps: { materials: service },
      actor: { id: actorId, roles: [], isRoot: false },
      state: { sessionId: 'materials-test' },
      runtime: {},
    } as unknown as Parameters<typeof tool.invoke>[0],
    { query },
    { toolCallId: 'materials-test', writer: () => undefined },
  ) as Promise<{
    readonly content: {
      readonly total: number;
      readonly matches: readonly { readonly slug: string }[];
      readonly note?: string;
    };
  }>;
}

async function request(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('origin', PUBLIC_ORIGIN);
  return server.fetch(
    new Request(`${baseUrl}${pathname}`, { ...init, headers }),
  );
}

async function signIn(username: string): Promise<string> {
  const response = await request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function query(): QueryAdapter {
  return database.query();
}

async function userIdOf(username: string): Promise<string> {
  const row = await query()
    .selectFrom('user')
    .select('id')
    .where('username', '=', username)
    .executeTakeFirst<{ readonly id: string }>();
  if (!row) {
    throw new Error(`The ${username} account was not seeded.`);
  }
  return String(row.id);
}

function listMaterialRows(): Promise<MaterialRow[]> {
  return query()
    .selectFrom('materials')
    .select(['id', 'slug', 'title', 'body', 'audience'])
    .orderBy('id', 'asc')
    .execute<MaterialRow>();
}

async function getMaterialBySlug(slug: string): Promise<MaterialRow> {
  const row = await query()
    .selectFrom('materials')
    .select(['id', 'slug', 'title', 'body', 'audience'])
    .where('slug', '=', slug)
    .executeTakeFirst<MaterialRow>();
  if (!row) {
    throw new Error(`The ${slug} material was not seeded.`);
  }
  return row;
}
