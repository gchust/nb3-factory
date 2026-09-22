import type { ApiClient } from '@nocobase/app-client';

/** The only conclusions a follow-up record may carry, shared with the server contract. */
export const FIELD_VISIT_CONCLUSIONS = [
  'satisfied',
  'neutral',
  'dissatisfied',
] as const;

export type FieldVisitConclusion = (typeof FIELD_VISIT_CONCLUSIONS)[number];

export interface FieldVisit {
  readonly id: number;
  readonly customerName: string;
  readonly visitDate: string;
  readonly conclusion: FieldVisitConclusion;
  readonly engineerName: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FieldVisitDraft {
  readonly customerName: string;
  readonly visitDate: string;
  readonly conclusion: FieldVisitConclusion | '';
  readonly engineerName: string;
  readonly notes: string;
}

export interface FieldVisitListResult {
  readonly records: readonly FieldVisit[];
  readonly total: number;
}

export function createEmptyFieldVisitDraft(): FieldVisitDraft {
  return {
    customerName: '',
    visitDate: '',
    conclusion: '',
    engineerName: '',
    notes: '',
  };
}

export function toFieldVisitDraft(record: FieldVisit | null): FieldVisitDraft {
  if (!record) {
    return createEmptyFieldVisitDraft();
  }
  return {
    customerName: record.customerName,
    visitDate: record.visitDate,
    conclusion: record.conclusion,
    engineerName: record.engineerName ?? '',
    notes: record.notes ?? '',
  };
}

export async function listFieldVisits(
  api: ApiClient,
  search: string,
  signal?: AbortSignal,
): Promise<FieldVisitListResult> {
  const response = await api.request<{ data: FieldVisit[]; total: number }>({
    path: 'field-visits',
    query: search ? { search } : {},
    signal,
  });
  return { records: response.data, total: response.total };
}

export async function createFieldVisit(
  api: ApiClient,
  draft: FieldVisitDraft,
): Promise<FieldVisit> {
  const response = await api.request<{ data: FieldVisit }>({
    path: 'field-visits',
    method: 'POST',
    json: draft,
  });
  return response.data;
}

export async function updateFieldVisit(
  api: ApiClient,
  id: number,
  draft: FieldVisitDraft,
): Promise<FieldVisit> {
  const response = await api.request<{ data: FieldVisit }>({
    path: `field-visits/${id}`,
    method: 'PATCH',
    json: draft,
  });
  return response.data;
}
