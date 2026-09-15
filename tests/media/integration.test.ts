// @vitest-environment node
import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import {
  InMemoryCollectionMetadataStore,
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/db';
import { createDriveManager } from '@nocobase/drive';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609140001_create_media_library.js';
import { MediaService } from '../../server/media/service.js';

describe('media library integration', () => {
  let manager: DatabaseManager;
  let storage: string;

  beforeEach(async () => {
    storage = await mkdtemp(join(tmpdir(), 'media-library-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
      metadataStore: new InMemoryCollectionMetadataStore(),
    });
    await manager.connect('main');
    await migration.up({
      builder: manager.builder('main'),
      query: manager.query('main'),
      connection: manager.connection('main'),
    });
  });

  afterEach(async () => {
    await manager.destroy();
    await rm(storage, { recursive: true, force: true });
  });

  function createService(): MediaService {
    return new MediaService(manager, {
      permissionSets: {
        listAssignments: async () => [
          {
            subject: { type: 'user', id: 'manager-1' },
            permissionSet: 'media-manager',
          },
        ],
      },
    });
  }

  function files() {
    const drive = createDriveManager({
      default: 'local',
      disks: {
        local: { driver: 'fs', location: storage, visibility: 'private' },
      },
    });
    return {
      drive,
      repository: new ServerFileRepositoryManager(manager, drive).repository(
        'mediaFiles',
        { disk: 'local', accessPath: '/uploads/media' },
      ),
    };
  }

  it('stores an upload, records it, and serves the same bytes back', async () => {
    const { drive, repository } = files();
    const bytes = new TextEncoder().encode('the original bytes');
    const file = new File([bytes], 'photo.png', { type: 'image/png' });

    const { record } = await repository.uploadOne({ file });
    expect(record.filename).toBe('photo.png');
    expect(record.size).toBe(bytes.length);

    const service = createService();
    const access = await service.resolveAccess('manager-1');
    expect(access.canManage).toBe(true);

    const asset = await service.createAsset(
      { fileId: record.id, name: 'Launch photo', tags: 'Launch, marketing' },
      { id: 'manager-1', name: 'Manager' },
      access,
      '/main',
    );
    expect(asset.type).toBe('image');
    expect(asset.tags).toEqual(['Launch', 'marketing']);
    expect(asset.size).toBe(bytes.length);
    expect(asset.contentUrl).toBe(`/main/uploads/media/${record.id}.png`);

    const stored = await service.findFile(record.id);
    expect(stored?.filename).toBe('photo.png');
    const disk = drive.use(stored?.disk ?? '');
    const stream = await disk.getStream(stored?.key ?? '');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).equals(Buffer.from(bytes))).toBe(true);
  });

  it('hides a disabled asset from an ordinary user but not from a manager', async () => {
    const { repository } = files();
    const { record } = await repository.uploadOne({
      file: new File([new Uint8Array([1, 2, 3])], 'clip.mp4', {
        type: 'video/mp4',
      }),
    });
    const service = createService();
    const managerAccess = await service.resolveAccess('manager-1');
    const created = await service.createAsset(
      { fileId: record.id, name: 'Clip' },
      { id: 'manager-1', name: 'Manager' },
      managerAccess,
      '/main',
    );

    const disabled = await service.updateAsset(
      created.id,
      { status: 'disabled' },
      managerAccess,
      '/main',
    );
    expect(disabled?.status).toBe('disabled');

    const memberAccess = await service.resolveAccess('user-2');
    expect(memberAccess.canManage).toBe(false);
    expect(
      await service.getAsset(created.id, memberAccess, '/main'),
    ).toBeUndefined();
    expect((await service.listAssets({}, memberAccess, '/main')).total).toBe(0);
    expect(
      await service.getAsset(created.id, managerAccess, '/main'),
    ).toBeDefined();
    expect((await service.listAssets({}, managerAccess, '/main')).total).toBe(
      1,
    );
  });

  it('filters by type, tag and name and reports statistics', async () => {
    const { repository } = files();
    const service = createService();
    const access = await service.resolveAccess('manager-1');

    const uploads = [
      { name: 'Beach photo', tags: 'summer, travel', file: 'beach.png' },
      { name: 'Podcast', tags: 'audio, travel', file: 'podcast.mp3' },
      { name: 'Report', tags: 'work', file: 'report.pdf' },
    ];
    for (const item of uploads) {
      const { record } = await repository.uploadOne({
        file: new File([new Uint8Array([1, 2, 3, 4])], item.file, {
          type: 'application/octet-stream',
        }),
      });
      await service.createAsset(
        { fileId: record.id, name: item.name, tags: item.tags },
        { id: 'manager-1', name: 'Manager' },
        access,
        '/main',
      );
    }

    const byType = await service.listAssets({ type: 'audio' }, access, '/main');
    expect(byType.items.map((item) => item.name)).toEqual(['Podcast']);

    const byTag = await service.listAssets({ tag: 'travel' }, access, '/main');
    expect(byTag.total).toBe(2);

    const byName = await service.listAssets(
      { name: 'report' },
      access,
      '/main',
    );
    expect(byName.items.map((item) => item.name)).toEqual(['Report']);

    const stats = await service.stats(access);
    expect(stats.totalCount).toBe(3);
    expect(stats.items.find((item) => item.type === 'image')?.count).toBe(1);
    expect(stats.totalSize).toBe(12);
  });

  it('refuses to link the same file twice', async () => {
    const { repository } = files();
    const { record } = await repository.uploadOne({
      file: new File([new Uint8Array([7])], 'notes.md', {
        type: 'text/markdown',
      }),
    });
    const service = createService();
    const access = await service.resolveAccess('manager-1');
    await service.createAsset(
      { fileId: record.id, name: 'Notes' },
      { id: 'manager-1', name: 'Manager' },
      access,
      '/main',
    );
    await expect(
      service.createAsset(
        { fileId: record.id, name: 'Again' },
        { id: 'manager-1', name: 'Manager' },
        access,
        '/main',
      ),
    ).rejects.toMatchObject({ code: 'FILE_ALREADY_LINKED' });
  });
});
