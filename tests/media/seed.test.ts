// @vitest-environment node
import {
  InMemoryCollectionMetadataStore,
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import seed from '../../database/main/seeds/202609140002_seed_media_roles.js';

interface PermissionSetRow {
  key: string;
  title: string | null;
  grants: string;
}

describe('media role seed', () => {
  let manager: DatabaseManager;

  beforeEach(async () => {
    manager = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
      metadataStore: new InMemoryCollectionMetadataStore(),
    });
    await manager.connect('main');
    await manager
      .builder('main')
      .createCollection('authorizationPermissionSets', (collection) => {
        collection.uuid('id').primary().notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 });
        collection.text('grants').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
      });
    const now = new Date();
    await manager
      .query('main')
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: 'default-pages',
        title: 'Default pages',
        grants: JSON.stringify([
          {
            resource: { type: 'page', id: 'home' },
            actions: [{ action: 'access' }],
          },
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  async function runSeed(): Promise<void> {
    await seed.run({
      query: manager.query('main'),
      connection: manager.connection('main'),
    });
  }

  async function rows(): Promise<PermissionSetRow[]> {
    return manager
      .query('main')
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title', 'grants'])
      .orderBy('key', 'asc')
      .execute();
  }

  it('creates the three media roles and grants the media pages to everyone signed in', async () => {
    await runSeed();
    const all = await rows();
    const keys = all.map((row) => row.key);
    expect(keys).toContain('media-manager');
    expect(keys).toContain('media-member');
    expect(keys).toContain('media-guest');

    const defaultPages = all.find((row) => row.key === 'default-pages');
    const grants = JSON.parse(defaultPages?.grants ?? '[]') as {
      resource: { type: string; id: string };
      actions: { action: string }[];
    }[];
    const pageIds = grants
      .filter((grant) => grant.resource.type === 'page')
      .map((grant) => grant.resource.id);
    expect(pageIds).toEqual(
      expect.arrayContaining(['home', 'media-assets', 'media-stats']),
    );
  });

  it('is idempotent', async () => {
    await runSeed();
    const first = await rows();
    await runSeed();
    const second = await rows();
    expect(second).toEqual(first);
    expect(second.filter((row) => row.key.startsWith('media-'))).toHaveLength(
      3,
    );
  });

  it('does nothing when the authorization tables are absent', async () => {
    const bare = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
      metadataStore: new InMemoryCollectionMetadataStore(),
    });
    await bare.connect('main');
    await expect(
      seed.run({
        query: bare.query('main'),
        connection: bare.connection('main'),
      }),
    ).resolves.toBeUndefined();
    await bare.destroy();
  });
});
