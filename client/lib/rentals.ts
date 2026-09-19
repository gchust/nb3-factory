import type { ApiClient } from '@nocobase/app-client';

export type BookingStatus =
  'pending' | 'confirmed' | 'delivered' | 'returned' | 'settled' | 'cancelled';

export interface Venue {
  readonly id: number;
  readonly name: string;
  readonly location: string;
  readonly capacity: number;
  readonly unitPrice: number;
  readonly status: 'available' | 'maintenance' | 'inactive';
  readonly description: string | null;
}

export interface Tenant {
  readonly id: number;
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly note: string | null;
}

export interface Booking {
  readonly id: number;
  readonly reference: string;
  readonly venueId: number;
  readonly venueName: string | null;
  readonly venueLocation: string | null;
  readonly tenantId: number;
  readonly tenantName: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly fee: number;
  readonly status: BookingStatus;
  readonly note: string | null;
  readonly deliveryCondition: string | null;
  readonly deliveredAt: string | null;
  readonly returnCondition: string | null;
  readonly returnedAt: string | null;
  readonly damageNote: string | null;
  readonly damageFee: number | null;
  readonly confirmedAt: string | null;
  readonly settledAt: string | null;
  readonly cancelReason: string | null;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RentalOwner {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
}

export interface VenueUtilization {
  readonly venueId: number;
  readonly venueName: string;
  readonly bookings: number;
  readonly bookedHours: number;
  readonly revenue: number;
  readonly utilization: number;
}

export interface RentalSummary {
  readonly from: string;
  readonly to: string;
  readonly totals: {
    readonly bookings: number;
    readonly byStatus: Readonly<Record<BookingStatus, number>>;
    readonly revenue: number;
    readonly damageFees: number;
  };
  readonly venues: readonly VenueUtilization[];
}

export interface BookingFilters {
  readonly status?: string;
  readonly venueId?: number;
  readonly search?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface CreateBookingInput {
  readonly venueId: number;
  readonly tenantId: number;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly fee?: number;
  readonly ownerId?: string;
  readonly note?: string;
}

export type RentalRole = 'manager' | 'staff';

export type BookingAttachmentKind =
  | 'agreement'
  | 'supplement'
  | 'deliveryPhoto'
  | 'deliveryPdf'
  | 'returnPhoto'
  | 'returnPdf';

export type VenueAttachmentKind = 'cover' | 'gallery';

export interface Attachment {
  /** Link-table id used to remove this attachment. */
  readonly id: number;
  readonly kind: string;
  readonly fileId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly sort: number;
  readonly createdAt: string;
  readonly contentUrl: string;
}

/** A single selection may carry at most this many files. */
export const MAX_ATTACH_FILES = 5;

/** One file may not exceed 5 MB. */
export const MAX_ATTACH_BYTES = 5 * 1024 * 1024;

/** MIME/extension filters for the grouped upload controls. */
export const IMAGE_ACCEPT = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
] as const;
export const PDF_ACCEPT = ['application/pdf', '.pdf'] as const;

export interface RentalIdentity {
  readonly userId: string;
  readonly role: RentalRole;
}

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
  'delivered',
  'returned',
  'settled',
  'cancelled',
];

export const VENUE_STATUSES = ['available', 'maintenance', 'inactive'] as const;

function withQuery(query: object): Record<string, string | number> {
  const entries = Object.entries(query as Record<string, unknown>).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined,
  );
  return Object.fromEntries(entries);
}

export async function listVenues(
  api: ApiClient,
  query: { search?: string; status?: string } = {},
): Promise<readonly Venue[]> {
  const response = await api.request<{ data: Venue[] }>({
    path: 'rentals/venues',
    query: withQuery(query),
  });
  return response.data;
}

export async function listTenants(
  api: ApiClient,
  query: { search?: string } = {},
): Promise<readonly Tenant[]> {
  const response = await api.request<{ data: Tenant[] }>({
    path: 'rentals/tenants',
    query: withQuery(query),
  });
  return response.data;
}

export async function listBookings(
  api: ApiClient,
  query: BookingFilters = {},
): Promise<readonly Booking[]> {
  const response = await api.request<{ data: Booking[] }>({
    path: 'rentals/bookings',
    query: withQuery(query),
  });
  return response.data;
}

export async function getBooking(api: ApiClient, id: number): Promise<Booking> {
  const response = await api.request<{ data: Booking }>({
    path: `rentals/bookings/${id}`,
  });
  return response.data;
}

export async function createBooking(
  api: ApiClient,
  input: CreateBookingInput,
): Promise<Booking> {
  const response = await api.request<{ data: Booking }>({
    path: 'rentals/bookings',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function listOwners(
  api: ApiClient,
): Promise<readonly RentalOwner[]> {
  const response = await api.request<{ data: RentalOwner[] }>({
    path: 'rentals/owners',
  });
  return response.data;
}

export async function fetchIdentity(api: ApiClient): Promise<RentalIdentity> {
  const response = await api.request<{ data: RentalIdentity }>({
    path: 'rentals/me',
  });
  return response.data;
}

export async function fetchSummary(
  api: ApiClient,
  query: { from?: string; to?: string } = {},
): Promise<RentalSummary> {
  const response = await api.request<{ data: RentalSummary }>({
    path: 'rentals/summary',
    query: withQuery(query),
  });
  return response.data;
}

async function act(
  api: ApiClient,
  id: number,
  action: string,
  json?: Record<string, unknown>,
): Promise<Booking> {
  const response = await api.request<{ data: Booking }>({
    path: `rentals/bookings/${id}/${action}`,
    method: 'POST',
    ...(json ? { json } : {}),
  });
  return response.data;
}

export const confirmBooking = (api: ApiClient, id: number) =>
  act(api, id, 'confirm');
export const deliverBooking = (
  api: ApiClient,
  id: number,
  json: { condition: string },
) => act(api, id, 'deliver', json);
export const returnBooking = (
  api: ApiClient,
  id: number,
  json: { condition: string; damageNote?: string; damageFee?: number },
) => act(api, id, 'return', json);
export const settleBooking = (api: ApiClient, id: number) =>
  act(api, id, 'settle');
export const cancelBooking = (
  api: ApiClient,
  id: number,
  json: { reason?: string },
) => act(api, id, 'cancel', json);
export const reassignOwner = (api: ApiClient, id: number, ownerId: string) =>
  act(api, id, 'owner', { ownerId });

// --- Attachments -----------------------------------------------------------

export async function listBookingAttachments(
  api: ApiClient,
  bookingId: number,
): Promise<readonly Attachment[]> {
  const response = await api.request<{ data: Attachment[] }>({
    path: `rentals/bookings/${bookingId}/attachments`,
  });
  return response.data;
}

export async function addBookingAttachments(
  api: ApiClient,
  bookingId: number,
  kind: BookingAttachmentKind,
  fileIds: readonly string[],
): Promise<readonly Attachment[]> {
  const response = await api.request<{ data: Attachment[] }>({
    path: `rentals/bookings/${bookingId}/attachments`,
    method: 'POST',
    json: { kind, fileIds },
  });
  return response.data;
}

export async function removeBookingAttachment(
  api: ApiClient,
  bookingId: number,
  attachmentId: number,
): Promise<readonly Attachment[]> {
  const response = await api.request<{ data: Attachment[] }>({
    path: `rentals/bookings/${bookingId}/attachments/${attachmentId}`,
    method: 'DELETE',
  });
  return response.data;
}

export async function listVenueAttachments(
  api: ApiClient,
  venueId: number,
): Promise<readonly Attachment[]> {
  const response = await api.request<{ data: Attachment[] }>({
    path: `rentals/venues/${venueId}/attachments`,
  });
  return response.data;
}

export interface VenueMediaSummary {
  readonly venueId: number;
  readonly cover: Attachment | null;
  readonly gallery: number;
}

/** Cover and gallery size for every venue, for the venue list. */
export async function listVenueMedia(
  api: ApiClient,
): Promise<readonly VenueMediaSummary[]> {
  const response = await api.request<{ data: VenueMediaSummary[] }>({
    path: 'rentals/venue-media',
  });
  return response.data;
}

export async function addVenueAttachments(
  api: ApiClient,
  venueId: number,
  kind: VenueAttachmentKind,
  fileIds: readonly string[],
): Promise<readonly Attachment[]> {
  const response = await api.request<{ data: Attachment[] }>({
    path: `rentals/venues/${venueId}/attachments`,
    method: 'POST',
    json: { kind, fileIds },
  });
  return response.data;
}

export async function removeVenueAttachment(
  api: ApiClient,
  venueId: number,
  attachmentId: number,
): Promise<readonly Attachment[]> {
  const response = await api.request<{ data: Attachment[] }>({
    path: `rentals/venues/${venueId}/attachments/${attachmentId}`,
    method: 'DELETE',
  });
  return response.data;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

/** The stable server error code carried by a failed request, if any. */
export function bookingErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      payload?: { code?: unknown };
    };
    if (typeof candidate.code === 'string') return candidate.code;
    if (candidate.payload && typeof candidate.payload.code === 'string') {
      return candidate.payload.code;
    }
  }
  return undefined;
}

export function toDateTimeInputValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
