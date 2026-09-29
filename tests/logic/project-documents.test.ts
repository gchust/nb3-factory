// @vitest-environment node

import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import {
  createDatabaseManager,
  type DatabaseManager,
  type PhysicalCollectionSchema,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DefaultProjectDocumentService,
  type ProjectDocumentService,
} from '../../server/providers/project-documents.js';

const migrationsDirectory = fileURLToPath(
  new URL('../../database/main/migrations', import.meta.url),
);

const ACCESS_PATH = '/api/project-documents/files';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A 1x1 transparent PNG; the service validates the extension and mime, not the bytes. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const DOCX_BYTES = Buffer.from('not a real docx, but enough for storage');

describe('project documents schema', () => {
  let directory: string;
  let database: DatabaseManager;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'project-documents-schema-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: sqlite({
          filename: path.join(directory, 'database.sqlite'),
          schemaManagement: 'managed',
        }),
      },
    });
  });

  afterAll(async () => {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates both collections and drops them again', async () => {
    const migrator = database.createMigrator({
      packageName: '@app/test',
      directory: migrationsDirectory,
      connection: 'main',
    });

    const applied = await migrator.latest();
    expect(applied.executed).toEqual([
      '202609100001_create_project_documents',
      '202609100002_create_project_document_files',
    ]);

    const documentColumns = await columnsOf(database, 'project_documents');
    expect(columnTypes(documentColumns)).toMatchObject({
      id: 'char',
      title: 'string',
      owner_id: 'string',
      created_at: 'text',
      updated_at: 'text',
    });
    expect(documentColumns.every((column) => !column.nullable)).toBe(true);
    expect(await indexNames(database, 'project_documents')).toContain(
      'idx_project_documents_owner',
    );

    const fileColumns = await columnsOf(database, 'project_document_files');
    expect(columnTypes(fileColumns)).toMatchObject({
      id: 'char',
      disk: 'string',
      key: 'text',
      filename: 'text',
      ext: 'string',
      mime_type: 'string',
      size: 'bigInt',
      document_id: 'char',
      owner_id: 'string',
      created_at: 'text',
      updated_at: 'text',
    });
    expect(
      fileColumns.filter((column) => !column.nullable).map((c) => c.columnName),
    ).not.toContain('document_id');
    expect(await indexNames(database, 'project_document_files')).toEqual(
      expect.arrayContaining([
        'idx_project_document_files_document',
        'idx_project_document_files_owner',
      ]),
    );

    const rolledBack = await migrator.rollback();
    expect(rolledBack.rolledBack).toEqual([
      '202609100002_create_project_document_files',
      '202609100001_create_project_documents',
    ]);

    await expect(columnsOf(database, 'project_documents')).rejects.toThrow();
    await expect(
      columnsOf(database, 'project_document_files'),
    ).rejects.toThrow();
  });
});

describe('project document service', () => {
  let directory: string;
  let database: DatabaseManager;
  let drive: NocoBaseDriveManager;
  let service: ProjectDocumentService;
  let ownerCounter = 0;

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'project-documents-service-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: sqlite({
          filename: path.join(directory, 'database.sqlite'),
          schemaManagement: 'managed',
        }),
      },
    });
    await database
      .createMigrator({
        packageName: '@app/test',
        directory: migrationsDirectory,
        connection: 'main',
      })
      .latest();
    drive = createDriveManager({
      default: 'local',
      disks: {
        local: {
          driver: 'fs',
          location: path.join(directory, 'storage'),
          visibility: 'private',
        },
      },
    });
    service = new DefaultProjectDocumentService({
      database,
      drive,
      files: new ServerFileRepositoryManager(database, drive),
      disk: 'local',
      accessPath: ACCESS_PATH,
      contentUrl: (fileId) => `${ACCESS_PATH}/${fileId}/content`,
    });
  });

  afterAll(async () => {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  function uniqueOwner(): string {
    ownerCounter += 1;
    return `user-${ownerCounter}`;
  }

  async function upload(
    ownerId: string,
    name: string,
    type: string,
    bytes = PNG_BYTES,
  ) {
    return service.upload(ownerId, new File([bytes], name, { type }));
  }

  async function readBytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
  }

  it('keeps each owner isolated, and streams the owner their own bytes', async () => {
    const owner = uniqueOwner();
    const stranger = uniqueOwner();
    const file = await upload(owner, 'photo.png', 'image/png');
    const document = await service.create(owner, {
      title: 'Site photos',
      fileIds: [file.id],
    });

    expect(document.files).toHaveLength(1);
    expect(document.files[0]?.documentId).toBe(document.id);
    expect(document.files[0]?.contentUrl).toBe(
      `${ACCESS_PATH}/${file.id}/content`,
    );

    expect((await service.list(owner)).map((item) => item.id)).toEqual([
      document.id,
    ]);
    expect(await service.list(stranger)).toEqual([]);
    await expect(service.get(stranger, document.id)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
    await expect(service.remove(stranger, document.id)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
    expect(await service.readAttachment(stranger, file.id)).toBeUndefined();

    const attachment = await service.readAttachment(owner, file.id);
    expect(attachment?.mimeType).toBe('image/png');
    expect(attachment?.filename).toBe('photo.png');
    expect(await readBytes(attachment!.stream)).toEqual(PNG_BYTES);
  });

  it('refuses a document without a title', async () => {
    const owner = uniqueOwner();
    await expect(
      service.create(owner, { title: '   ', fileIds: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_TITLE' });
  });

  it('refuses an attachment type the first version does not support', async () => {
    const owner = uniqueOwner();
    await expect(
      upload(owner, 'archive.zip', 'application/zip', Buffer.from('zip')),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('refuses to attach a file uploaded by somebody else', async () => {
    const owner = uniqueOwner();
    const stranger = uniqueOwner();
    const file = await upload(stranger, 'photo.png', 'image/png');
    await expect(
      service.create(owner, { title: 'Stolen', fileIds: [file.id] }),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('deletes a detached attachment row and its stored object on update', async () => {
    const owner = uniqueOwner();
    const keep = await upload(owner, 'photo.png', 'image/png');
    const drop = await upload(owner, 'notes.docx', DOCX_MIME, DOCX_BYTES);
    const document = await service.create(owner, {
      title: 'Two attachments',
      fileIds: [keep.id, drop.id],
    });
    expect(document.files.map((item) => item.id).sort()).toEqual(
      [keep.id, drop.id].sort(),
    );

    const updated = await service.update(owner, document.id, {
      title: 'Two attachments',
      fileIds: [keep.id],
    });
    expect(updated.files.map((item) => item.id)).toEqual([keep.id]);
    expect(await service.readAttachment(owner, drop.id)).toBeUndefined();
    expect(await drive.use('local').exists(drop.key)).toBe(false);
    expect(await drive.use('local').exists(keep.key)).toBe(true);
  });

  it('removes the document together with its rows and stored objects', async () => {
    const owner = uniqueOwner();
    const file = await upload(owner, 'photo.png', 'image/png');
    const document = await service.create(owner, {
      title: 'Disposable',
      fileIds: [file.id],
    });

    await service.remove(owner, document.id);

    expect(await service.list(owner)).toEqual([]);
    expect(await service.readAttachment(owner, file.id)).toBeUndefined();
    expect(await drive.use('local').exists(file.key)).toBe(false);
  });

  it('keeps an uploaded file available when a save fails for a missing title', async () => {
    const owner = uniqueOwner();
    const file = await upload(owner, 'photo.png', 'image/png');
    await expect(
      service.create(owner, { title: '', fileIds: [file.id] }),
    ).rejects.toMatchObject({ code: 'INVALID_TITLE' });

    // The upload survives, so adding the title saves without re-uploading.
    const document = await service.create(owner, {
      title: 'Recovered',
      fileIds: [file.id],
    });
    expect(document.files[0]?.id).toBe(file.id);
  });
});

async function columnsOf(
  database: DatabaseManager,
  table: string,
): Promise<PhysicalCollectionSchema['columns']> {
  const schema = await database
    .connection('main')
    .schemaInspector.getPhysicalCollection({ tableName: table });
  if (!schema) throw new Error(`Table "${table}" does not exist.`);
  return schema.columns;
}

function columnTypes(
  columns: PhysicalCollectionSchema['columns'],
): Record<string, string> {
  return Object.fromEntries(
    columns.map((column) => [column.columnName, column.dataType]),
  );
}

async function indexNames(
  database: DatabaseManager,
  table: string,
): Promise<string[]> {
  const schema = await database
    .connection('main')
    .schemaInspector.getPhysicalCollection({ tableName: table });
  return (schema?.indexes ?? []).map((index) => index.name);
}
