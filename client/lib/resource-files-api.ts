import type { ApiClient } from '@nocobase/app-client';

export interface FileRecordView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

export async function listResourceFiles(
  api: ApiClient,
): Promise<FileRecordView[]> {
  const response = await api.request<{ readonly data: FileRecordView[] }>({
    path: 'resource-files',
  });
  return response.data;
}

export async function uploadResourceFile(
  api: ApiClient,
  file: File,
): Promise<FileRecordView> {
  const body = new FormData();
  body.append('file', file);
  const response = await api.request<{ readonly data: FileRecordView }>({
    path: 'resource-files/upload',
    method: 'POST',
    body,
  });
  return response.data;
}
