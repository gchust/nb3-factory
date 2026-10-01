import type {
  ClientFileRepository,
  FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import type { ApiClient } from '@nocobase/app-client';

/**
 * Project documents: one titled record with the attachments it carries.
 *
 * The shapes below mirror what the server returns. A `ProjectDocumentFile` is
 * structurally a `FileRecord`, so the file components from
 * `client/extensions/nocobase-file-component-ui/` accept it unchanged.
 */

export interface ProjectDocumentFile {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly documentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

export interface ProjectDocument {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly ProjectDocumentFile[];
}

export interface ProjectDocumentInput {
  readonly title: string;
  readonly fileIds: readonly string[];
}

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** What this first version accepts: a PNG photo and a DOCX document. */
export const DOCUMENT_ACCEPT = [
  '.png',
  '.docx',
  'image/png',
  DOCX_MIME,
] as const;

export interface ProjectDocumentApi {
  list(): Promise<ProjectDocument[]>;
  create(input: ProjectDocumentInput): Promise<ProjectDocument>;
  update(id: string, input: ProjectDocumentInput): Promise<ProjectDocument>;
  remove(id: string): Promise<void>;
  attachments(): ClientFileRepository;
}

/** The collection name the file components address their RemoteRepository by. */
const FILE_COLLECTION = 'project_document_files';

export function createProjectDocumentApi(api: ApiClient): ProjectDocumentApi {
  return {
    async list(): Promise<ProjectDocument[]> {
      const body = await api.request<{ data: ProjectDocument[] }>({
        path: '/project-documents',
      });
      return body.data;
    },
    async create(input: ProjectDocumentInput): Promise<ProjectDocument> {
      const body = await api.request<{ data: ProjectDocument }>({
        path: '/project-documents',
        method: 'POST',
        json: input,
      });
      return body.data;
    },
    async update(
      id: string,
      input: ProjectDocumentInput,
    ): Promise<ProjectDocument> {
      const body = await api.request<{ data: ProjectDocument }>({
        path: `/project-documents/${encodeURIComponent(id)}`,
        method: 'PATCH',
        json: input,
      });
      return body.data;
    },
    async remove(id: string): Promise<void> {
      await api.request({
        path: `/project-documents/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
    },
    attachments(): ClientFileRepository {
      const repository = api.repository<FileRecord>(FILE_COLLECTION);
      return Object.assign(repository, {
        async uploadOne(
          { file }: { readonly file: File },
          options?: {
            readonly signal?: AbortSignal;
          },
        ) {
          const form = new FormData();
          form.append('file', file);
          const body = await api.request<{ data: FileRecord }>({
            path: '/project-documents/files',
            method: 'POST',
            body: form,
            signal: options?.signal,
          });
          return { record: body.data, createdTargets: [] };
        },
        async uploadMany(
          { files }: { readonly files: readonly File[] },
          options?: { readonly signal?: AbortSignal },
        ) {
          const records: FileRecord[] = [];
          for (const file of files) {
            const form = new FormData();
            form.append('file', file);
            const body = await api.request<{ data: FileRecord }>({
              path: '/project-documents/files',
              method: 'POST',
              body: form,
              signal: options?.signal,
            });
            records.push(body.data);
          }
          return { createdCount: records.length, records };
        },
      });
    },
  };
}
