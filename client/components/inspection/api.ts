import { apiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

import type {
  Device,
  DeviceInput,
  DeviceStat,
  InspectionRecord,
  InspectionResult,
  InspectionUser,
  Photo,
  Plan,
  PlanInput,
  RecordFilters,
  RecordInput,
  RegistrationInput,
} from './types.js';

interface Envelope<T> {
  readonly data: T;
}

interface UploadedRecord {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl?: string;
}

export interface InspectionApi {
  me(): Promise<InspectionUser>;
  devices(): Promise<readonly Device[]>;
  createDevice(input: DeviceInput): Promise<void>;
  updateDevice(id: number, input: DeviceInput): Promise<void>;
  plans(): Promise<readonly Plan[]>;
  createPlan(input: PlanInput): Promise<void>;
  updatePlan(id: number, input: PlanInput): Promise<void>;
  records(filters: RecordFilters): Promise<readonly InspectionRecord[]>;
  record(id: number): Promise<InspectionRecord>;
  createRecord(input: RecordInput): Promise<number>;
  updateRecord(
    id: number,
    patch: { result?: InspectionResult; description?: string | null },
  ): Promise<void>;
  deletePhoto(recordId: number, fileId: string): Promise<void>;
  uploadPhotos(files: readonly File[]): Promise<readonly Photo[]>;
  stats(): Promise<readonly DeviceStat[]>;
  register(input: RegistrationInput): Promise<void>;
}

export function useInspectionApi(): InspectionApi {
  const api = useService(apiClientToken);
  return useMemo(
    () => ({
      async me() {
        const result = await api.request<Envelope<InspectionUser>>({
          path: 'inspection/me',
        });
        return result.data;
      },
      async devices() {
        const result = await api.request<Envelope<readonly Device[]>>({
          path: 'inspection/devices',
        });
        return result.data;
      },
      async createDevice(input) {
        await api.request({
          path: 'inspection/devices',
          method: 'POST',
          json: input,
        });
      },
      async updateDevice(id, input) {
        await api.request({
          path: `inspection/devices/${id}`,
          method: 'PATCH',
          json: input,
        });
      },
      async plans() {
        const result = await api.request<Envelope<readonly Plan[]>>({
          path: 'inspection/plans',
        });
        return result.data;
      },
      async createPlan(input) {
        await api.request({
          path: 'inspection/plans',
          method: 'POST',
          json: input,
        });
      },
      async updatePlan(id, input) {
        await api.request({
          path: `inspection/plans/${id}`,
          method: 'PATCH',
          json: input,
        });
      },
      async records(filters) {
        const result = await api.request<Envelope<readonly InspectionRecord[]>>(
          {
            path: 'inspection/records',
            query: {
              deviceId: filters.deviceId,
              result: filters.result,
              from: filters.from,
              to: filters.to,
            },
          },
        );
        return result.data;
      },
      async record(id) {
        const result = await api.request<Envelope<InspectionRecord>>({
          path: `inspection/records/${id}`,
        });
        return result.data;
      },
      async createRecord(input) {
        const result = await api.request<Envelope<{ id: number }>>({
          path: 'inspection/records',
          method: 'POST',
          json: input,
        });
        return result.data.id;
      },
      async updateRecord(id, patch) {
        await api.request({
          path: `inspection/records/${id}`,
          method: 'PATCH',
          json: patch,
        });
      },
      async deletePhoto(recordId, fileId) {
        await api.request({
          path: `inspection/records/${recordId}/photos/${fileId}`,
          method: 'DELETE',
        });
      },
      async uploadPhotos(files) {
        const body = new FormData();
        for (const file of files) body.append('file', file);
        const result = await api.request<
          Envelope<{ records: readonly UploadedRecord[] }>,
          FormData
        >({
          path: 'inspectionPhotos:uploadMany',
          method: 'POST',
          body,
        });
        return result.data.records.map((record) => ({
          fileId: record.id,
          filename: record.filename,
          ext: record.ext,
          mimeType: record.mimeType,
          size: record.size,
          contentUrl: record.contentUrl ?? '',
        }));
      },
      async stats() {
        const result = await api.request<Envelope<readonly DeviceStat[]>>({
          path: 'inspection/stats',
        });
        return result.data;
      },
      async register(input) {
        await api.request({
          path: 'inspection-registration',
          method: 'POST',
          json: input,
        });
      },
    }),
    [api],
  );
}

/** The server answers failures with a stable machine code, which the UI translates. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const payload = (error as { payload?: unknown }).payload;
    if (typeof payload === 'object' && payload !== null) {
      const code = (payload as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }
  return undefined;
}
