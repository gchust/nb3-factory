import type { ServerFileRepository } from '@nocobase/app-plugin-file/server';
import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { RepositoryPolicy } from '@nocobase/db';
import type { Readable } from 'node:stream';

import { ServiceError } from './errors.js';

/**
 * Physical attachment storage, kept behind one interface so the work-order service holds a business dependency rather
 * than the File plugin's concrete manager. Objects are private: the only way to read one is through the authenticated
 * download route, which asks this store to stream the object it has already authorized.
 */
export interface StoredAttachment {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface AttachmentLocation {
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface AttachmentStore {
  upload(input: {
    collection: string;
    disk: string;
    accessPath: string;
    policy: RepositoryPolicy;
    file: File;
  }): Promise<StoredAttachment>;
  locate(input: {
    collection: string;
    disk: string;
    accessPath: string;
    id: string;
  }): Promise<AttachmentLocation | undefined>;
  stream(input: { disk: string; key: string }): Promise<Readable>;
  remove(input: {
    collection: string;
    disk: string;
    accessPath: string;
    id: string;
  }): Promise<void>;
}

const READ_ONLY_POLICY: RepositoryPolicy = {
  read: true,
  create: false,
  update: false,
  delete: false,
};

export function createAttachmentStore(dependencies: {
  files: () => ServerFileRepositoryManager | undefined;
  drive: () => NocoBaseDriveManager | undefined;
}): AttachmentStore {
  function manager(): ServerFileRepositoryManager {
    const files = dependencies.files();
    if (!files) {
      throw new ServiceError(
        'FILE_STORAGE_UNAVAILABLE',
        503,
        'File storage is not available',
      );
    }
    return files;
  }

  function driveManager(): NocoBaseDriveManager {
    const drive = dependencies.drive();
    if (!drive) {
      throw new ServiceError(
        'FILE_STORAGE_UNAVAILABLE',
        503,
        'File storage is not available',
      );
    }
    return drive;
  }

  function repository(options: {
    collection: string;
    disk: string;
    accessPath: string;
    policy: RepositoryPolicy;
  }): ServerFileRepository {
    return manager().repository(options.collection, {
      disk: options.disk,
      accessPath: options.accessPath,
      policy: options.policy,
    });
  }

  return {
    async upload(input) {
      const result = await repository(input).uploadOne({ file: input.file });
      return {
        id: result.record.id,
        disk: result.record.disk,
        key: result.record.key,
        filename: result.record.filename,
        ext: result.record.ext,
        mimeType: result.record.mimeType,
        size: Number(result.record.size),
      };
    },
    async locate(input) {
      const record = await repository({
        collection: input.collection,
        disk: input.disk,
        accessPath: input.accessPath,
        policy: READ_ONLY_POLICY,
      }).findOne({ filter: { id: input.id } });
      if (!record) return undefined;
      return {
        disk: record.disk,
        key: record.key,
        filename: record.filename,
        mimeType: record.mimeType,
        size: Number(record.size),
      };
    },
    async stream(input) {
      return driveManager().use(input.disk).getStream(input.key);
    },
    async remove(input) {
      const record = await repository({
        collection: input.collection,
        disk: input.disk,
        accessPath: input.accessPath,
        policy: READ_ONLY_POLICY,
      }).findOne({ filter: { id: input.id } });
      if (!record) return;
      // Remove the object before its record: a failed delete leaves a row pointing at an object that still exists,
      // which is a retryable state, rather than an object that no record can ever free.
      await driveManager().use(record.disk).delete(record.key);
      await repository({
        collection: input.collection,
        disk: input.disk,
        accessPath: input.accessPath,
        policy: {
          read: true,
          create: false,
          update: false,
          delete: true,
        },
      }).deleteOne({ filter: { id: input.id } });
    },
  };
}
