import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';
import type {
  CalibrationView,
  DashboardData,
  EquipmentView,
  LabAccess,
  LabFileView,
  LabMemberView,
  LaboratoryView,
  ReservationView,
  SafetyCheckView,
  TrainingRecordView,
  WorkOrderView,
} from './lab-types.js';

type QueryValue = string | number | boolean | null | undefined;

/** Drops empty filters so an unset control does not become a literal empty match. */
function query(
  filters: Record<string, QueryValue>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = value;
  }
  return result;
}

/**
 * The laboratory endpoints, typed.
 *
 * Every call takes an explicit method and path; the client's base URL already points at `/api`, so a
 * path here never repeats it and never carries the deployment base path.
 */
export interface LabApi {
  access(): Promise<LabAccess>;
  dashboard(): Promise<DashboardData>;
  laboratories(filters?: Record<string, QueryValue>): Promise<LaboratoryView[]>;
  labMembers(labId: number): Promise<LabMemberView[]>;
  createLaboratory(values: Record<string, unknown>): Promise<LaboratoryView>;
  updateLaboratory(
    id: number,
    values: Record<string, unknown>,
  ): Promise<LaboratoryView>;
  equipment(filters?: Record<string, QueryValue>): Promise<EquipmentView[]>;
  equipmentRecord(id: number): Promise<EquipmentView>;
  createEquipment(values: Record<string, unknown>): Promise<EquipmentView>;
  updateEquipment(
    id: number,
    values: Record<string, unknown>,
  ): Promise<EquipmentView>;
  calibrations(
    filters?: Record<string, QueryValue>,
  ): Promise<CalibrationView[]>;
  createCalibration(values: Record<string, unknown>): Promise<CalibrationView>;
  reservations(
    filters?: Record<string, QueryValue>,
  ): Promise<ReservationView[]>;
  createReservation(values: Record<string, unknown>): Promise<ReservationView>;
  cancelReservation(id: number): Promise<ReservationView>;
  workOrders(filters?: Record<string, QueryValue>): Promise<WorkOrderView[]>;
  workOrder(id: number): Promise<WorkOrderView>;
  createWorkOrder(values: Record<string, unknown>): Promise<WorkOrderView>;
  transitionWorkOrder(
    id: number,
    values: Record<string, unknown>,
  ): Promise<WorkOrderView>;
  safetyChecks(
    filters?: Record<string, QueryValue>,
  ): Promise<SafetyCheckView[]>;
  createSafetyCheck(values: Record<string, unknown>): Promise<SafetyCheckView>;
  updateSafetyCheck(
    id: number,
    values: Record<string, unknown>,
  ): Promise<SafetyCheckView>;
  closeSafetyCheck(
    id: number,
    values: Record<string, unknown>,
  ): Promise<SafetyCheckView>;
  trainingRecords(
    filters?: Record<string, QueryValue>,
  ): Promise<TrainingRecordView[]>;
  createTrainingRecord(
    values: Record<string, unknown>,
  ): Promise<TrainingRecordView>;
  updateTrainingRecord(
    id: number,
    values: Record<string, unknown>,
  ): Promise<TrainingRecordView>;
  files(targetType: string, targetId: string | number): Promise<LabFileView[]>;
  uploadFile(input: {
    targetType: string;
    targetId: string | number;
    purpose?: string;
    remark?: string;
    file: File;
  }): Promise<LabFileView>;
  updateFile(id: string, values: Record<string, unknown>): Promise<LabFileView>;
  deleteFile(id: string): Promise<{ id: string }>;
}

/**
 * Builds the typed callers over the application's API client.
 *
 * The client is a singleton resolved from the client application, so this memo is stable across
 * renders and safe to use as a loader dependency.
 */
export function useLabApi(): LabApi {
  const api = useApiClient();
  return useMemo<LabApi>(() => {
    // Every route answers with a `{ data }` envelope; unwrapping it once here keeps the callers in
    // terms of the records they asked for.
    const request = async <T>(
      options: Parameters<typeof api.request>[0],
    ): Promise<T> => {
      const payload = await api.request<{ data: T }>(options);
      return payload.data;
    };
    return {
      access: () =>
        request<LabAccess>({ path: '/lab/dashboard/access', method: 'GET' }),
      dashboard: () =>
        request<DashboardData>({ path: '/lab/dashboard', method: 'GET' }),
      laboratories: (filters = {}) =>
        request<LaboratoryView[]>({
          path: '/lab/laboratories',
          method: 'GET',
          query: query(filters),
        }),
      labMembers: (labId) =>
        request<LabMemberView[]>({
          path: `/lab/laboratories/${labId}/members`,
          method: 'GET',
        }),
      createLaboratory: (values) =>
        request<LaboratoryView>({
          path: '/lab/laboratories',
          method: 'POST',
          json: values,
        }),
      updateLaboratory: (id, values) =>
        request<LaboratoryView>({
          path: `/lab/laboratories/${id}`,
          method: 'PATCH',
          json: values,
        }),
      equipment: (filters = {}) =>
        request<EquipmentView[]>({
          path: '/lab/equipment',
          method: 'GET',
          query: query(filters),
        }),
      equipmentRecord: (id) =>
        request<EquipmentView>({ path: `/lab/equipment/${id}`, method: 'GET' }),
      createEquipment: (values) =>
        request<EquipmentView>({
          path: '/lab/equipment',
          method: 'POST',
          json: values,
        }),
      updateEquipment: (id, values) =>
        request<EquipmentView>({
          path: `/lab/equipment/${id}`,
          method: 'PATCH',
          json: values,
        }),
      calibrations: (filters = {}) =>
        request<CalibrationView[]>({
          path: '/lab/calibrations',
          method: 'GET',
          query: query(filters),
        }),
      createCalibration: (values) =>
        request<CalibrationView>({
          path: '/lab/calibrations',
          method: 'POST',
          json: values,
        }),
      reservations: (filters = {}) =>
        request<ReservationView[]>({
          path: '/lab/reservations',
          method: 'GET',
          query: query(filters),
        }),
      createReservation: (values) =>
        request<ReservationView>({
          path: '/lab/reservations',
          method: 'POST',
          json: values,
        }),
      cancelReservation: (id) =>
        request<ReservationView>({
          path: `/lab/reservations/${id}/cancel`,
          method: 'POST',
          json: {},
        }),
      workOrders: (filters = {}) =>
        request<WorkOrderView[]>({
          path: '/lab/work-orders',
          method: 'GET',
          query: query(filters),
        }),
      workOrder: (id) =>
        request<WorkOrderView>({
          path: `/lab/work-orders/${id}`,
          method: 'GET',
        }),
      createWorkOrder: (values) =>
        request<WorkOrderView>({
          path: '/lab/work-orders',
          method: 'POST',
          json: values,
        }),
      transitionWorkOrder: (id, values) =>
        request<WorkOrderView>({
          path: `/lab/work-orders/${id}/transition`,
          method: 'POST',
          json: values,
        }),
      safetyChecks: (filters = {}) =>
        request<SafetyCheckView[]>({
          path: '/lab/safety-checks',
          method: 'GET',
          query: query(filters),
        }),
      createSafetyCheck: (values) =>
        request<SafetyCheckView>({
          path: '/lab/safety-checks',
          method: 'POST',
          json: values,
        }),
      updateSafetyCheck: (id, values) =>
        request<SafetyCheckView>({
          path: `/lab/safety-checks/${id}`,
          method: 'PATCH',
          json: values,
        }),
      closeSafetyCheck: (id, values) =>
        request<SafetyCheckView>({
          path: `/lab/safety-checks/${id}/close`,
          method: 'POST',
          json: values,
        }),
      trainingRecords: (filters = {}) =>
        request<TrainingRecordView[]>({
          path: '/lab/training-records',
          method: 'GET',
          query: query(filters),
        }),
      createTrainingRecord: (values) =>
        request<TrainingRecordView>({
          path: '/lab/training-records',
          method: 'POST',
          json: values,
        }),
      updateTrainingRecord: (id, values) =>
        request<TrainingRecordView>({
          path: `/lab/training-records/${id}`,
          method: 'PATCH',
          json: values,
        }),
      files: (targetType, targetId) =>
        request<LabFileView[]>({
          path: '/lab/files',
          method: 'GET',
          query: { targetType, targetId: String(targetId) },
        }),
      uploadFile: ({ targetType, targetId, purpose, remark, file }) => {
        const body = new FormData();
        body.append('file', file, file.name);
        body.append('targetType', targetType);
        body.append('targetId', String(targetId));
        if (purpose) body.append('purpose', purpose);
        if (remark) body.append('remark', remark);
        // A FormData body is passed through untouched so the browser sets the multipart boundary.
        return request<LabFileView>({
          path: '/lab/files',
          method: 'POST',
          body,
        });
      },
      updateFile: (id, values) =>
        request<LabFileView>({
          path: `/lab/files/${id}`,
          method: 'PATCH',
          json: values,
        }),
      deleteFile: (id) =>
        request<{ id: string }>({
          path: `/lab/files/${id}`,
          method: 'DELETE',
        }),
    };
  }, [api]);
}

export { ApiClientError };
