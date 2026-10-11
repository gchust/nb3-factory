import type { ApiClient } from '@nocobase/app-client';

import type { ScheduleListItem, ScheduleOccurrence } from './types.js';

interface ScheduleListResponse {
  readonly data: readonly ScheduleListItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

interface ScheduleResponse {
  readonly data: ScheduleListItem;
}

interface OccurrenceListResponse {
  readonly data: readonly ScheduleOccurrence[];
  readonly meta: { readonly nextPageToken?: string };
}

export async function listSchedules(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly ScheduleListItem[]> {
  const response = await api.request<ScheduleListResponse>({
    path: '/scheduler/schedules',
    query: { pageSize: 100 },
    signal,
  });
  return response.data;
}

export async function listOccurrences(
  api: ApiClient,
  scheduleId: string,
  signal?: AbortSignal,
): Promise<readonly ScheduleOccurrence[]> {
  const response = await api.request<OccurrenceListResponse>({
    path: `/scheduler/schedules/${encodeURIComponent(scheduleId)}/occurrences`,
    query: { pageSize: 10 },
    signal,
  });
  return response.data;
}

/** Switches a schedule on or off through the Scheduler API, the same way its own management UI does. */
export async function setScheduleEnabled(
  api: ApiClient,
  scheduleId: string,
  enabled: boolean,
): Promise<ScheduleListItem> {
  const response = await api.request<ScheduleResponse>({
    path: `/scheduler/schedules/${encodeURIComponent(scheduleId)}/${enabled ? 'enable' : 'disable'}`,
    method: 'POST',
  });
  return response.data;
}
