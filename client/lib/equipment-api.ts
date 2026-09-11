import type { ApiClient } from '@nocobase/app-client';

/**
 * DTOs mirrored from the equipment-inspection server route's decorated output.
 */
export interface EquipmentFile {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  contentUrl?: string;
}

export interface InspectionRecord {
  id: number;
  equipmentId: number;
  inspectedAt: string | Date;
  inspector: string;
  conclusion: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  photos: EquipmentFile[];
}

export interface EquipmentSummary {
  id: number;
  deviceNo: string;
  name: string;
  location: string;
  status: string;
  owner: string | null;
  remark: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  mainImage?: EquipmentFile;
  documentCount: number;
  inspectionCount: number;
}

export interface EquipmentRecord extends EquipmentSummary {
  documents: EquipmentFile[];
  inspections: InspectionRecord[];
}

export interface EquipmentWrite {
  deviceNo: string;
  name: string;
  location: string;
  status: string;
  owner?: string | null;
  remark?: string | null;
  mainImageId?: string;
  documentIds?: readonly string[];
}

export interface InspectionWrite {
  equipmentId: number;
  inspectedAt: string;
  inspector: string;
  conclusion: string;
  photoIds?: readonly string[];
}

const readData = async <T>(promise: Promise<{ data: T }>): Promise<T> =>
  (await promise).data;

export const equipmentApi = {
  async list(api: ApiClient): Promise<EquipmentSummary[]> {
    return readData(api.request({ path: '/equipment', method: 'GET' }));
  },
  async get(api: ApiClient, id: number): Promise<EquipmentRecord> {
    return readData(api.request({ path: `/equipment/${id}`, method: 'GET' }));
  },
  async create(
    api: ApiClient,
    input: EquipmentWrite,
  ): Promise<EquipmentRecord> {
    return readData(
      api.request({ path: '/equipment', method: 'POST', json: input }),
    );
  },
  async update(
    api: ApiClient,
    id: number,
    input: EquipmentWrite,
  ): Promise<EquipmentRecord> {
    return readData(
      api.request({ path: `/equipment/${id}`, method: 'PUT', json: input }),
    );
  },
  async remove(api: ApiClient, id: number): Promise<void> {
    await api.request({ path: `/equipment/${id}`, method: 'DELETE' });
  },
  async getInspection(api: ApiClient, id: number): Promise<InspectionRecord> {
    return readData(api.request({ path: `/inspections/${id}`, method: 'GET' }));
  },
  async createInspection(
    api: ApiClient,
    input: InspectionWrite,
  ): Promise<InspectionRecord> {
    return readData(
      api.request({ path: '/inspections', method: 'POST', json: input }),
    );
  },
  async updateInspection(
    api: ApiClient,
    id: number,
    input: InspectionWrite,
  ): Promise<InspectionRecord> {
    return readData(
      api.request({ path: `/inspections/${id}`, method: 'PUT', json: input }),
    );
  },
  async removeInspection(api: ApiClient, id: number): Promise<void> {
    await api.request({ path: `/inspections/${id}`, method: 'DELETE' });
  },
};

/** True when `error` came back from the server as a 409 device-number conflict. */
export function isDeviceNoTaken(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === 409
  );
}
