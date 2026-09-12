import { useMemo } from 'react';
import {
  apiClientToken,
  ApiClientError,
  useClientApplication,
  type ApiClient,
} from '@nocobase/app-client';
import type {
  ClientFileRepository,
  ClientUploadOptions,
  FileRecord,
  UploadManyInput,
  UploadManyResult,
  UploadOneInput,
  UploadOneResult,
} from '@nocobase/app-plugin-file/client';

import type { ContractFileKind } from './contract-files.js';
import { pickSingleUploadRecord } from './contract-files.js';

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

/** Display order of contract statuses. */
export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'draft',
  'active',
  'expired',
  'terminated',
];

/** A contract as the server returns it, bodies and attachments decorated. */
export interface ContractRecord {
  readonly id: number;
  readonly contractNo: string;
  readonly name: string;
  readonly party: string;
  readonly signedAt: string | null;
  readonly amount: string | number | null;
  readonly status: ContractStatus;
  readonly remark: string | null;
  readonly bodyFileId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: FileRecord | null;
  readonly attachments: readonly FileRecord[];
}

/** What the form submits when saving a contract. */
export interface ContractSaveInput {
  readonly contractNo: string;
  readonly name: string;
  readonly party: string;
  readonly signedAt?: string | null;
  readonly amount?: string | null;
  readonly status?: ContractStatus;
  readonly remark?: string | null;
  readonly bodyFileId?: string | null;
  readonly attachmentFileIds?: readonly string[];
}

/** Client for the business endpoints of the contract archive. */
export class ContractsApi {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<readonly ContractRecord[]> {
    const payload = await this.api.request({
      path: '/contracts:list',
      method: 'POST',
    });
    return (payload as { data: ContractRecord[] }).data;
  }

  async get(id: number): Promise<ContractRecord> {
    const payload = await this.api.request({
      path: '/contracts:get',
      method: 'POST',
      json: { filter: { id } },
    });
    return (payload as { data: ContractRecord }).data;
  }

  async create(values: ContractSaveInput): Promise<ContractRecord> {
    const payload = await this.api.request({
      path: '/contracts:create',
      method: 'POST',
      json: { values },
    });
    return (payload as { data: ContractRecord }).data;
  }

  async update(id: number, values: ContractSaveInput): Promise<ContractRecord> {
    const payload = await this.api.request({
      path: '/contracts:update',
      method: 'POST',
      json: { filter: { id }, values },
    });
    return (payload as { data: ContractRecord }).data;
  }

  async remove(id: number): Promise<void> {
    await this.api.request({
      path: '/contracts:delete',
      method: 'POST',
      json: { filter: { id } },
    });
  }

  async deleteAttachment(contractId: number, fileId: string): Promise<void> {
    await this.api.request({
      path: '/contracts:deleteAttachment',
      method: 'POST',
      json: { filter: { id: contractId, fileId } },
    });
  }
}

/**
 * Builds a repository the File upload controls can use.
 *
 * The upload actions are routed to this application's business endpoints,
 * which enforce the file admission rules (PDF-only body, allowed attachment
 * types, 5 MiB per file) server-side. The multipart field name matches the
 * endpoint convention: the body endpoint reads `file`, the attachment endpoint
 * accepts `files` (the control also sends single files through `uploadOne`).
 * The base repository methods (findOne, findMany, ...) query the File
 * plugin's own read-only actions.
 */
export function createContractFilesRepository(
  api: ApiClient,
  kind: ContractFileKind,
): ClientFileRepository {
  const collection =
    kind === 'body' ? 'contractBodyFiles' : 'contractAttachments';
  const action = kind === 'body' ? 'uploadBody' : 'uploadAttachments';
  const field = kind === 'body' ? 'file' : 'files';
  const base = api.repository<FileRecord>(collection);
  return Object.assign(base, {
    async uploadOne(
      { file }: UploadOneInput,
      options?: ClientUploadOptions,
    ): Promise<UploadOneResult> {
      const form = new FormData();
      form.append(field, file);
      const payload = await api.request({
        path: `/contracts:${action}`,
        method: 'POST',
        body: form,
        signal: options?.signal,
      });
      // The body endpoint answers with a single record object while the
      // attachment endpoint answers with an array; pick a single record from
      // either shape (see pickSingleUploadRecord).
      const record = pickSingleUploadRecord(
        (payload as { data?: FileRecord | readonly FileRecord[] }).data,
      );
      return { record, createdTargets: [] };
    },
    async uploadMany(
      { files }: UploadManyInput,
      options?: ClientUploadOptions,
    ): Promise<UploadManyResult> {
      const form = new FormData();
      for (const file of files) form.append(field, file);
      const payload = await api.request({
        path: `/contracts:${action}`,
        method: 'POST',
        body: form,
        signal: options?.signal,
      });
      const records = (payload as { data: readonly FileRecord[] }).data;
      return { createdCount: records.length, records };
    },
  });
}

/** Everything the pages need to talk to the contract archive. */
export interface ContractsClient {
  readonly api: ContractsApi;
  /** Repository powering the single-PDF body upload control. */
  readonly bodyRepository: ClientFileRepository;
  /** Repository powering the multi-file attachment upload control. */
  readonly attachmentsRepository: ClientFileRepository;
}

/** The shared contract client of the running application. */
export function useContractsApi(): ContractsClient {
  const app = useClientApplication();
  return useMemo(() => {
    const api = new ContractsApi(app.container.resolve(apiClientToken));
    return {
      api,
      bodyRepository: createContractFilesRepository(
        app.container.resolve(apiClientToken),
        'body',
      ),
      attachmentsRepository: createContractFilesRepository(
        app.container.resolve(apiClientToken),
        'attachment',
      ),
    };
  }, [app]);
}

/** Renders a stored amount like `360000.00` as a readable number. */
export function formatContractAmount(value: string | number): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

/**
 * Translates a business-code error to a user-facing message.
 *
 * Known codes resolve through the locale files; anything else falls back to the
 * server message (which is deliberately readable Chinese) or a generic string.
 */
export function contractErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallbackKey = 'contracts.errors.INTERNAL_ERROR',
): string {
  if (error instanceof ApiClientError && error.code) {
    const key = `contracts.errors.${error.code}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  if (error instanceof Error) {
    const message = error.message;
    if (message) return message;
  }
  return t(fallbackKey);
}
