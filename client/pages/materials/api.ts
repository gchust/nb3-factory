import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';

import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

/**
 * The File Repository resource the material attachments are uploaded to. It has to match the `name` registered in
 * `server/routes/index.ts`, because the upload posts to `<name>:uploadOne`.
 */
export const PROJECT_MATERIAL_FILES_RESOURCE = 'projectMaterialFiles';

/**
 * The server decorates every attachment with `contentUrl`; the rest of the fields are the ones a `FileRecord`
 * carries, so the Registry preview components can render it without a cast.
 */
export interface ProjectMaterialAttachment extends FileRecord {
  readonly contentUrl: string;
}

export interface ProjectMaterialView {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly ProjectMaterialAttachment[];
}

export interface ProjectMaterialInput {
  readonly title: string;
  readonly fileIds: readonly string[];
}

interface ProjectMaterialListResponse {
  readonly data: ProjectMaterialView[];
}

interface ProjectMaterialResponse {
  readonly data: ProjectMaterialView;
}

/**
 * The three material endpoints, all going through the application HTTP client so the deployment base path and the
 * session cookie are handled for us.
 */
export function useProjectMaterialsApi() {
  const api = useApiClient();

  return useMemo(
    () => ({
      list: () =>
        api.request<ProjectMaterialListResponse>({
          path: '/project-materials',
        }),
      get: (id: string) =>
        api.request<ProjectMaterialResponse>({
          path: `/project-materials/${encodeURIComponent(id)}`,
        }),
      create: (input: ProjectMaterialInput) =>
        api.request<ProjectMaterialResponse, ProjectMaterialInput>({
          path: '/project-materials',
          method: 'POST',
          json: input,
        }),
      update: (id: string, input: ProjectMaterialInput) =>
        api.request<ProjectMaterialResponse, ProjectMaterialInput>({
          path: `/project-materials/${encodeURIComponent(id)}`,
          method: 'PATCH',
          json: input,
        }),
    }),
    [api],
  );
}

function payloadCode(payload: unknown): string | undefined {
  if (typeof payload === 'object' && payload !== null && 'code' in payload) {
    const code = (payload as { readonly code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Maps a failed save to a message key, keeping the user informed instead of showing a raw error. */
export function projectMaterialErrorKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    const code = payloadCode(error.payload);
    if (
      code === 'TITLE_REQUIRED' ||
      code === 'TITLE_TOO_LONG' ||
      code === 'INVALID_FILE_IDS'
    ) {
      return `materials.errors.${code}`;
    }
  }
  return 'materials.errors.saveFailed';
}
