import type { AppClient } from '@nocobase/app-client';

import type {
  ApiErrorPayload,
  MeetingBooking,
  MeetingBookingInput,
  MeetingBookingListFilters,
  MeetingRoom,
  MeetingRoomInput,
} from './meeting-types.js';

export interface ApiListResponse<T> {
  data: T[];
}

export interface ApiItemResponse<T> {
  data: T;
}

export class MeetingApiError extends Error {
  public readonly code: string | undefined;
  public readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'MeetingApiError';
    this.status = status;
    this.code = code;
  }
}

async function unwrap<T>(promise: Promise<ApiItemResponse<T>>): Promise<T> {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const payload = (error as { payload?: unknown }).payload as
        ApiErrorPayload | undefined;
      throw new MeetingApiError(
        payload?.message ?? error.message,
        (error as { status: number }).status,
        payload?.code,
      );
    }
    throw error;
  }
}

export function listRooms(appClient: AppClient): Promise<MeetingRoom[]> {
  return appClient
    .request<ApiListResponse<MeetingRoom>>('meeting-rooms')
    .then((response) => response.data);
}

export function getRoom(
  appClient: AppClient,
  id: number,
): Promise<MeetingRoom> {
  return unwrap(
    appClient.request<ApiItemResponse<MeetingRoom>>(`meeting-rooms/${id}`),
  );
}

export function createRoom(
  appClient: AppClient,
  input: MeetingRoomInput,
): Promise<MeetingRoom> {
  return unwrap(
    appClient.request<ApiItemResponse<MeetingRoom>>('meeting-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export function updateRoom(
  appClient: AppClient,
  id: number,
  input: MeetingRoomInput,
): Promise<MeetingRoom> {
  return unwrap(
    appClient.request<ApiItemResponse<MeetingRoom>>(`meeting-rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export function listBookings(
  appClient: AppClient,
  filters: MeetingBookingListFilters = {},
): Promise<MeetingBooking[]> {
  const params = new URLSearchParams();
  if (filters.roomId !== undefined) {
    params.set('roomId', String(filters.roomId));
  }
  if (filters.date) {
    params.set('date', filters.date);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }
  const query = params.toString();
  return appClient
    .request<ApiListResponse<MeetingBooking>>(
      `meeting-bookings${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

export function getBooking(
  appClient: AppClient,
  id: number,
): Promise<MeetingBooking> {
  return unwrap(
    appClient.request<ApiItemResponse<MeetingBooking>>(
      `meeting-bookings/${id}`,
    ),
  );
}

export function createBooking(
  appClient: AppClient,
  input: MeetingBookingInput,
): Promise<MeetingBooking> {
  return unwrap(
    appClient.request<ApiItemResponse<MeetingBooking>>('meeting-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export function cancelBooking(
  appClient: AppClient,
  id: number,
): Promise<MeetingBooking> {
  return unwrap(
    appClient.request<ApiItemResponse<MeetingBooking>>(
      `meeting-bookings/${id}/cancel`,
      { method: 'POST' },
    ),
  );
}
