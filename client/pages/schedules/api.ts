import type { ApiClient } from '@nocobase/app-client';

import type { OccurrenceList, Schedule, ScheduleList } from './types.js';

/**
 * The scheduler plugin's own endpoints. They are the only way to read a Schedule and to switch it on or off; the
 * schedule itself is registered in server code, not created from a form.
 */
export async function fetchSchedules(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<ScheduleList> {
  return api.request<ScheduleList>({
    path: 'scheduler/schedules',
    query: { page: 1, pageSize: 100 },
    signal,
  });
}

export async function fetchSchedule(
  api: ApiClient,
  scheduleId: string,
  signal?: AbortSignal,
): Promise<Schedule> {
  const { data } = await api.request<{ data: Schedule }>({
    path: `scheduler/schedules/${encodeURIComponent(scheduleId)}`,
    signal,
  });
  return data;
}

/** Enabling and disabling are two endpoints, not one with a flag; both answer with the Schedule after the change. */
export async function setScheduleEnabled(
  api: ApiClient,
  scheduleId: string,
  enabled: boolean,
): Promise<Schedule> {
  const { data } = await api.request<{ data: Schedule }>({
    path: `scheduler/schedules/${encodeURIComponent(scheduleId)}/${enabled ? 'enable' : 'disable'}`,
    method: 'POST',
  });
  return data;
}

export async function fetchOccurrences(
  api: ApiClient,
  scheduleId: string,
  pageToken?: string,
  signal?: AbortSignal,
): Promise<OccurrenceList> {
  return api.request<OccurrenceList>({
    path: `scheduler/schedules/${encodeURIComponent(scheduleId)}/occurrences`,
    query: { pageSize: 20, pageToken },
    signal,
  });
}
