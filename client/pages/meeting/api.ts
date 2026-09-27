import type { ApiClient } from '@nocobase/app-client';

import type {
  MeetingBooking,
  MeetingBookingInput,
  MeetingRoom,
  MeetingRoomInput,
} from './types.js';

/**
 * The meeting feature's HTTP calls. Every function takes the application's
 * `ApiClient` because a plain module cannot call `useApiClient()`; the pages
 * resolve the client and pass it in. Paths are relative to the API base URL,
 * so the deployment base path stays out of the source.
 */

export async function listMeetingRooms(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<MeetingRoom[]> {
  const { data } = await api.request<{ data: MeetingRoom[] }>({
    path: 'meeting-rooms',
    signal,
  });
  return data;
}

export async function createMeetingRoom(
  api: ApiClient,
  input: MeetingRoomInput,
): Promise<MeetingRoom> {
  const { data } = await api.request<{ data: MeetingRoom }, MeetingRoomInput>({
    path: 'meeting-rooms',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMeetingRoom(
  api: ApiClient,
  id: number,
  input: MeetingRoomInput,
): Promise<MeetingRoom> {
  const { data } = await api.request<{ data: MeetingRoom }, MeetingRoomInput>({
    path: `meeting-rooms/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteMeetingRoom(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<{ data: { id: number } }>({
    path: `meeting-rooms/${id}`,
    method: 'DELETE',
  });
}

export async function listMeetingBookings(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<MeetingBooking[]> {
  const { data } = await api.request<{ data: MeetingBooking[] }>({
    path: 'meeting-bookings',
    signal,
  });
  return data;
}

export async function createMeetingBooking(
  api: ApiClient,
  input: MeetingBookingInput,
): Promise<MeetingBooking> {
  const { data } = await api.request<
    { data: MeetingBooking },
    MeetingBookingInput
  >({
    path: 'meeting-bookings',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function cancelMeetingBooking(
  api: ApiClient,
  id: number,
): Promise<MeetingBooking> {
  const { data } = await api.request<{ data: MeetingBooking }>({
    path: `meeting-bookings/${id}/cancel`,
    method: 'POST',
  });
  return data;
}
