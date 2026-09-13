import { useMemo } from 'react';
import {
  apiClientToken,
  ApiClientError,
  useClientApplication,
  type ApiClient,
} from '@nocobase/app-client';

/** Attachment admission rules, mirrored from the server for instant feedback. */
export const MAX_ATTACHMENT_SIZE: number = 5 * 1024 * 1024;

export const CONTRACT_CATEGORIES = ['procurement', 'sales', 'service'] as const;

export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

export const ALL_CATEGORIES = 'all';

export type ContractCategoryFilter = ContractCategory | typeof ALL_CATEGORIES;

export interface ContractAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
}

export interface ContractRecord {
  readonly id: number;
  readonly name: string;
  readonly counterparty: string;
  readonly category: ContractCategory;
  readonly attachment: ContractAttachment | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContractSaveInput {
  readonly name: string;
  readonly counterparty: string;
  readonly category: ContractCategory;
  readonly attachmentId: string;
}

/** Client for the contract archive's business endpoints. */
export class ContractsApi {
  constructor(private readonly api: ApiClient) {}

  async list(
    category: ContractCategoryFilter,
  ): Promise<readonly ContractRecord[]> {
    const payload = await this.api.request({
      path: '/contracts',
      query: category === ALL_CATEGORIES ? undefined : { category },
    });
    return (payload as { data: ContractRecord[] }).data;
  }

  async get(id: number): Promise<ContractRecord> {
    const payload = await this.api.request({ path: `/contracts/${id}` });
    return (payload as { data: ContractRecord }).data;
  }

  async create(values: ContractSaveInput): Promise<ContractRecord> {
    const payload = await this.api.request({
      path: '/contracts',
      method: 'POST',
      json: values,
    });
    return (payload as { data: ContractRecord }).data;
  }

  async update(id: number, values: ContractSaveInput): Promise<ContractRecord> {
    const payload = await this.api.request({
      path: `/contracts/${id}`,
      method: 'PUT',
      json: values,
    });
    return (payload as { data: ContractRecord }).data;
  }

  /** Uploads one attachment and returns its stored metadata with content URL. */
  async uploadAttachment(file: File): Promise<ContractAttachment> {
    const form = new FormData();
    form.append('file', file);
    const payload = await this.api.request({
      path: '/contracts/attachments',
      method: 'POST',
      body: form,
    });
    return (payload as { data: ContractAttachment }).data;
  }
}

/** The contract client of the running application. */
export function useContractsApi(): ContractsApi {
  const app = useClientApplication();
  return useMemo(
    () => new ContractsApi(app.container.resolve(apiClientToken)),
    [app],
  );
}

/** Adds the download flag used by the content endpoint. */
export function downloadUrl(contentUrl: string): string {
  const separator = contentUrl.includes('?') ? '&' : '?';
  return `${contentUrl}${separator}download=1`;
}

/** Extensions accepted by the attachment picker. */
export const ATTACHMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.txt,.md,application/pdf,image/*,text/plain';

/** Mirrors the server admission rule so the picker rejects a file immediately. */
export function attachmentViolation(file: {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  const allowed =
    [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'text/plain',
      'text/markdown',
    ].includes(file.type.toLowerCase()) ||
    ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'txt', 'md'].includes(
      ext,
    );
  if (!allowed) return 'CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED';
  if (file.size > MAX_ATTACHMENT_SIZE) return 'CONTRACT_ATTACHMENT_TOO_LARGE';
  return null;
}

/** Translates a business-code error to a user-facing message. */
export function contractErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof ApiClientError && error.code) {
    const key = `contracts.errors.${error.code}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  if (error instanceof Error && error.message) return error.message;
  return t('contracts.errors.INTERNAL_ERROR');
}
