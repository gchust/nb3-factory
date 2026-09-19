import {
  resolveAppUrl,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useEffect, useRef, useState } from 'react';

import type {
  Attachment,
  DashboardCounts,
  Equipment,
  InspectionTask,
  InspectionTaskDetail,
  InspectionTemplate,
  PersonOption,
  RepairOrder,
  RepairOrderDetail,
  SessionContext,
} from './types.js';

export function fileContentUrl(fileId: string): string {
  return resolveAppUrl(`/api/app-files/${encodeURIComponent(fileId)}/content`);
}

export function fileDownloadUrl(fileId: string): string {
  return resolveAppUrl(`/api/app-files/${encodeURIComponent(fileId)}/download`);
}

async function data<T>(
  api: ApiClient,
  options: Parameters<ApiClient['request']>[0],
): Promise<T> {
  const response = await api.request<{ data: T }>(options);
  return response.data;
}

export function getSessionContext(api: ApiClient): Promise<SessionContext> {
  return data<SessionContext>(api, { path: 'dashboard/me' });
}

export function getDashboard(api: ApiClient): Promise<DashboardCounts> {
  return data<DashboardCounts>(api, { path: 'dashboard' });
}

export function listEquipment(api: ApiClient): Promise<Equipment[]> {
  return data<Equipment[]>(api, { path: 'equipment' });
}

export function createEquipment(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<Equipment> {
  return data<Equipment>(api, {
    path: 'equipment',
    method: 'POST',
    json: input,
  });
}

export function updateEquipment(
  api: ApiClient,
  id: number,
  input: Record<string, unknown>,
): Promise<Equipment> {
  return data<Equipment>(api, {
    path: `equipment/${id}`,
    method: 'PATCH',
    json: input,
  });
}

export function deleteEquipment(api: ApiClient, id: number): Promise<void> {
  return api.request<void>({ path: `equipment/${id}`, method: 'DELETE' });
}

export function uploadEquipmentPhoto(
  api: ApiClient,
  id: number,
  file: File,
): Promise<Equipment> {
  const body = new FormData();
  body.append('file', file);
  return data<Equipment>(api, {
    path: `equipment/${id}/photo`,
    method: 'POST',
    body,
  });
}

export function removeEquipmentPhoto(
  api: ApiClient,
  id: number,
): Promise<Equipment> {
  return data<Equipment>(api, {
    path: `equipment/${id}/photo`,
    method: 'DELETE',
  });
}

export function listTemplates(api: ApiClient): Promise<InspectionTemplate[]> {
  return data<InspectionTemplate[]>(api, { path: 'templates' });
}

export function createTemplate(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<InspectionTemplate> {
  return data<InspectionTemplate>(api, {
    path: 'templates',
    method: 'POST',
    json: input,
  });
}

export function updateTemplate(
  api: ApiClient,
  id: number,
  input: Record<string, unknown>,
): Promise<InspectionTemplate> {
  return data<InspectionTemplate>(api, {
    path: `templates/${id}`,
    method: 'PATCH',
    json: input,
  });
}

export function deleteTemplate(api: ApiClient, id: number): Promise<void> {
  return api.request<void>({ path: `templates/${id}`, method: 'DELETE' });
}

export function listTasks(api: ApiClient): Promise<InspectionTask[]> {
  return data<InspectionTask[]>(api, { path: 'inspections' });
}

export function getTask(
  api: ApiClient,
  id: number,
): Promise<InspectionTaskDetail> {
  return data<InspectionTaskDetail>(api, { path: `inspections/${id}` });
}

export function createTask(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<InspectionTask> {
  return data<InspectionTask>(api, {
    path: 'inspections',
    method: 'POST',
    json: input,
  });
}

export function deleteTask(api: ApiClient, id: number): Promise<void> {
  return api.request<void>({ path: `inspections/${id}`, method: 'DELETE' });
}

export function saveTaskResults(
  api: ApiClient,
  id: number,
  results: readonly {
    resultId: number;
    result: string | null;
    remark: string;
  }[],
): Promise<{ saved: boolean }> {
  return data<{ saved: boolean }>(api, {
    path: `inspections/${id}/results`,
    method: 'PUT',
    json: { results },
  });
}

export function submitTask(
  api: ApiClient,
  id: number,
): Promise<{ repairOrders: number }> {
  return data<{ repairOrders: number }>(api, {
    path: `inspections/${id}/submit`,
    method: 'POST',
  });
}

export function uploadInspectionFiles(
  api: ApiClient,
  taskId: number,
  resultId: number,
  files: readonly File[],
  note?: string,
): Promise<{ uploaded: number }> {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  const query = note ? `?note=${encodeURIComponent(note)}` : '';
  return data<{ uploaded: number }>(api, {
    path: `inspections/${taskId}/results/${resultId}/files${query}`,
    method: 'POST',
    body,
  });
}

export function removeInspectionAttachment(
  api: ApiClient,
  attachmentId: number,
): Promise<void> {
  return api.request<void>({
    path: `inspections/files/${attachmentId}/remove`,
    method: 'POST',
  });
}

export function listPeople(api: ApiClient): Promise<{
  inspectors: PersonOption[];
  repairers: PersonOption[];
}> {
  return data<{ inspectors: PersonOption[]; repairers: PersonOption[] }>(api, {
    path: 'inspections/people',
  });
}

export function listRepairs(api: ApiClient): Promise<RepairOrder[]> {
  return data<RepairOrder[]>(api, { path: 'repairs' });
}

export function getRepair(
  api: ApiClient,
  id: number,
): Promise<RepairOrderDetail> {
  return data<RepairOrderDetail>(api, { path: `repairs/${id}` });
}

export function assignRepair(
  api: ApiClient,
  id: number,
  assigneeId: string | null,
): Promise<RepairOrder> {
  return data<RepairOrder>(api, {
    path: `repairs/${id}/assign`,
    method: 'PATCH',
    json: { assigneeId },
  });
}

export function setRepairPriority(
  api: ApiClient,
  id: number,
  priority: string,
): Promise<RepairOrder> {
  return data<RepairOrder>(api, {
    path: `repairs/${id}/priority`,
    method: 'PATCH',
    json: { priority },
  });
}

export function addRepairRecord(
  api: ApiClient,
  id: number,
  content: string,
): Promise<{ saved: boolean }> {
  return data<{ saved: boolean }>(api, {
    path: `repairs/${id}/records`,
    method: 'POST',
    json: { content },
  });
}

export function startRepair(
  api: ApiClient,
  id: number,
): Promise<{ started: boolean }> {
  return data<{ started: boolean }>(api, {
    path: `repairs/${id}/start`,
    method: 'POST',
  });
}

export function submitRepairReview(
  api: ApiClient,
  id: number,
): Promise<{ submitted: boolean }> {
  return data<{ submitted: boolean }>(api, {
    path: `repairs/${id}/submit-review`,
    method: 'POST',
  });
}

export function reviewRepair(
  api: ApiClient,
  id: number,
  decision: 'close' | 'return',
  remark: string,
): Promise<{ reviewed: boolean }> {
  return data<{ reviewed: boolean }>(api, {
    path: `repairs/${id}/review`,
    method: 'POST',
    json: { decision, remark },
  });
}

export function uploadRepairFiles(
  api: ApiClient,
  id: number,
  stage: 'before' | 'after',
  files: readonly File[],
  note?: string,
): Promise<{ uploaded: number }> {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  const params = new URLSearchParams({ stage });
  if (note) params.set('note', note);
  return data<{ uploaded: number }>(api, {
    path: `repairs/${id}/files?${params.toString()}`,
    method: 'POST',
    body,
  });
}

export function removeRepairAttachment(
  api: ApiClient,
  attachmentId: number,
): Promise<void> {
  return api.request<void>({
    path: `repairs/files/${attachmentId}/remove`,
    method: 'POST',
  });
}

export function attachmentOf(file: File): Attachment {
  return {
    id: 0,
    fileId: '',
    filename: file.name,
    mimeType: file.type,
    ext: file.name.split('.').pop() ?? '',
    size: file.size,
    note: null,
    uploadedById: '',
    uploadedByName: null,
    createdAt: null,
    contentUrl: '',
  };
}

export interface AsyncState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

/** Small data-loading hook: refetches when the key changes or reload is called. */
export function useAsync<T>(
  key: string,
  load: (api: ApiClient) => Promise<T>,
): AsyncState<T> {
  const api = useApiClient();
  const loaderRef = useRef(load);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{
    identity: string;
    data?: T;
    error?: unknown;
  }>();
  const identity = `${key}#${reloadKey}`;

  // Keep the latest loader without making the fetch effect depend on its
  // identity, which changes on every render for callers.
  useEffect(() => {
    loaderRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loaderRef.current(api).then(
      (value) => {
        if (active) setState({ identity, data: value });
      },
      (error: unknown) => {
        if (active) setState({ identity, error });
      },
    );
    return () => {
      active = false;
    };
  }, [api, identity]);

  const loading = state?.identity !== identity;
  return {
    data: loading ? undefined : state?.data,
    loading,
    error: loading ? undefined : state?.error,
    reload: () => setReloadKey((value) => value + 1),
  };
}
