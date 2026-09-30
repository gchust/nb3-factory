import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type {
  AssistantAnswer,
  CreateTicketResult,
  DashboardSummary,
  DirectoryTeam,
  DirectoryUser,
  KnowledgeHit,
  ServiceArticle,
  ServiceAttachment,
  ServiceCustomer,
  ServiceDevice,
  ServiceError,
  ServiceInspection,
  ServiceManual,
  ServiceSchedule,
  ServiceTicket,
} from './types.js';

/**
 * Thin wrappers over the application's `ApiClient` for `/api/service/*`.
 *
 * Every call goes through the client the runtime built, so the deployment base
 * path and the session cookie are the runtime's business, never a literal
 * `/api` in the page. The response envelope is always `{ data }`, and a failed
 * request becomes a `ServiceError` the page can show.
 */

type QueryValue = string | number | boolean | undefined;

/** A response envelope, or the raw body of an attachment stream. */
type Envelope<T> = { readonly data: T };

/**
 * A failed service request, carrying the HTTP status and the server's error
 * code. It extends `Error` so a thrown failure is always an error object; the
 * status is what lets a page tell a conflict from a plain failure.
 */
export class ServiceRequestError extends Error implements ServiceError {
  public readonly code: string | null;
  public readonly status: number;

  public constructor(
    message: string,
    options: { readonly code?: string | null; readonly status?: number } = {},
  ) {
    super(message);
    this.name = 'ServiceRequestError';
    this.code = options.code ?? null;
    this.status = options.status ?? 0;
  }
}

function toError(error: unknown): ServiceRequestError {
  if (error instanceof ApiClientError) {
    return new ServiceRequestError(error.message, {
      code: error.code ?? null,
      status: error.status,
    });
  }
  return new ServiceRequestError(
    error instanceof Error ? error.message : String(error),
  );
}

function query(
  input: Record<string, QueryValue>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === '') continue;
    result[key] = value;
  }
  return result;
}

export class ServiceApi {
  public constructor(private readonly client: ApiClient) {}

  /* --------------------------------------------------------------- dashboard */

  public async dashboard(): Promise<DashboardSummary> {
    const response = await this.get<DashboardSummary>('service/dashboard');
    return response;
  }

  /* --------------------------------------------------------------- customers */

  public async listCustomers(
    input: {
      query?: string;
      limit?: number;
    } = {},
  ): Promise<ServiceCustomer[]> {
    return this.get<ServiceCustomer[]>('service/customers', query(input));
  }

  public async createCustomer(
    values: Record<string, unknown>,
  ): Promise<ServiceCustomer> {
    return this.post<ServiceCustomer>('service/customers', { json: values });
  }

  public async updateCustomer(
    id: number,
    values: Record<string, unknown>,
  ): Promise<ServiceCustomer> {
    return this.patch<ServiceCustomer>(`service/customers/${id}`, {
      json: values,
    });
  }

  /* ----------------------------------------------------------------- devices */

  public async listDevices(
    input: {
      customerId?: number;
      query?: string;
      status?: string;
    } = {},
  ): Promise<ServiceDevice[]> {
    return this.get<ServiceDevice[]>('service/devices', query(input));
  }

  public async createDevice(
    values: Record<string, unknown>,
  ): Promise<ServiceDevice> {
    return this.post<ServiceDevice>('service/devices', { json: values });
  }

  public async updateDevice(
    id: number,
    values: Record<string, unknown>,
  ): Promise<ServiceDevice> {
    return this.patch<ServiceDevice>(`service/devices/${id}`, { json: values });
  }

  /* ----------------------------------------------------------------- tickets */

  public async listTickets(
    input: {
      status?: string;
      statuses?: string;
      priority?: string;
      query?: string;
      assigneeId?: string;
      overdue?: boolean;
      limit?: number;
    } = {},
  ): Promise<ServiceTicket[]> {
    return this.get<ServiceTicket[]>('service/tickets', query(input));
  }

  public async getTicket(id: number): Promise<ServiceTicket> {
    return this.get<ServiceTicket>(`service/tickets/${id}`);
  }

  public async createTicket(
    values: Record<string, unknown>,
  ): Promise<CreateTicketResult> {
    try {
      const response = await this.client.request<
        Envelope<ServiceTicket> & { readonly acceptance?: unknown }
      >({ path: 'service/tickets', method: 'POST', json: values });
      const acceptance = response.acceptance;
      return {
        ticket: response.data,
        acceptance:
          acceptance && typeof acceptance === 'object'
            ? (acceptance as CreateTicketResult['acceptance'])
            : null,
      };
    } catch (error) {
      throw toError(error);
    }
  }

  public async transitionTicket(
    id: number,
    action: string,
    values: Record<string, unknown>,
  ): Promise<ServiceTicket> {
    return this.post<ServiceTicket>(
      `service/tickets/${id}/transitions/${action}`,
      { json: values },
    );
  }

  public async shareTicket(
    id: number,
    subjectType: string,
    subjectId: string,
  ): Promise<{ key: string }> {
    return this.post<{ key: string }>(`service/tickets/${id}/share`, {
      json: { subjectType, subjectId },
    });
  }

  public async unshareTicket(
    id: number,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    await this.client.request({
      path: `service/tickets/${id}/share`,
      method: 'DELETE',
      query: { subjectType, subjectId },
    });
  }

  /* ------------------------------------------------------------- inspections */

  public async listInspections(
    input: {
      status?: string;
      overview?: string;
      overdue?: boolean;
    } = {},
  ): Promise<ServiceInspection[]> {
    return this.get<ServiceInspection[]>('service/inspections', query(input));
  }

  public async getInspection(id: number): Promise<ServiceInspection> {
    return this.get<ServiceInspection>(`service/inspections/${id}`);
  }

  public async createInspection(
    values: Record<string, unknown>,
  ): Promise<ServiceInspection> {
    return this.post<ServiceInspection>('service/inspections', {
      json: values,
    });
  }

  public async completeInspection(
    id: number,
    values: { result: string; findings?: string | null },
  ): Promise<ServiceInspection> {
    return this.post<ServiceInspection>(`service/inspections/${id}/complete`, {
      json: values,
    });
  }

  /* --------------------------------------------------------------- knowledge */

  public async listArticles(
    input: { query?: string; category?: string; status?: string } = {},
  ): Promise<ServiceArticle[]> {
    return this.get<ServiceArticle[]>(
      'service/knowledge/articles',
      query(input),
    );
  }

  public async getArticle(id: number): Promise<ServiceArticle> {
    return this.get<ServiceArticle>(`service/knowledge/articles/${id}`);
  }

  public async createArticle(
    values: Record<string, unknown>,
  ): Promise<ServiceArticle> {
    return this.post<ServiceArticle>('service/knowledge/articles', {
      json: values,
    });
  }

  public async listManuals(
    input: { query?: string; deviceCategory?: string; status?: string } = {},
  ): Promise<ServiceManual[]> {
    return this.get<ServiceManual[]>('service/knowledge/manuals', query(input));
  }

  /** The attachments of one ticket or one manual, newest last. */
  public async listAttachments(input: {
    ticketId?: number;
    manualId?: number;
  }): Promise<ServiceAttachment[]> {
    return this.get<ServiceAttachment[]>('service/attachments', query(input));
  }

  public async getManual(id: number): Promise<ServiceManual> {
    return this.get<ServiceManual>(`service/knowledge/manuals/${id}`);
  }

  public async searchKnowledge(term: string): Promise<KnowledgeHit[]> {
    return this.get<KnowledgeHit[]>('service/knowledge/search', {
      query: term,
    });
  }

  /* ------------------------------------------------------------- attachments */

  public async uploadAttachment(input: {
    file: File;
    ticketId?: number;
    manualId?: number;
    category?: string;
  }): Promise<ServiceAttachment> {
    const body = new FormData();
    body.append('file', input.file);
    if (input.ticketId !== undefined)
      body.append('ticketId', String(input.ticketId));
    if (input.manualId !== undefined)
      body.append('manualId', String(input.manualId));
    if (input.category !== undefined) body.append('category', input.category);
    return this.post<ServiceAttachment>('service/attachments', { body });
  }

  public async deleteAttachment(id: string): Promise<void> {
    await this.client.request({
      path: `service/attachments/${id}`,
      method: 'DELETE',
    });
  }

  /**
   * Reads an attachment's bytes through the authenticated API client and hands
   * back an object URL the browser can render or download. The cookie travels
   * with the request, so no endpoint is exposed as a plain link.
   */
  public async openAttachment(id: string): Promise<string> {
    const stream = await this.client.stream({
      path: `service/attachments/${id}`,
      method: 'GET',
    });
    const blob = await new Response(stream).blob();
    return URL.createObjectURL(blob);
  }

  /* -------------------------------------------------------------- directory */

  public async listUsers(): Promise<DirectoryUser[]> {
    return this.get<DirectoryUser[]>('service/directory/users');
  }

  public async listTeams(): Promise<DirectoryTeam[]> {
    return this.get<DirectoryTeam[]>('service/directory/teams');
  }

  /* -------------------------------------------------------------- assistant */

  public async ask(question: string): Promise<AssistantAnswer> {
    return this.post<AssistantAnswer>('service/assistant/ask', {
      json: { question },
    });
  }

  /* ------------------------------------------------------------ schedules */

  public async listSchedules(): Promise<ServiceSchedule[]> {
    return this.get<ServiceSchedule[]>('service/schedules');
  }

  /** Dispatches a domain schedule immediately through the Scheduler target. */
  public async runSchedule(key: string): Promise<ServiceSchedule> {
    return this.post<ServiceSchedule>(
      `service/schedules/${encodeURIComponent(key)}/run`,
      { json: {} },
    );
  }

  /* ------------------------------------------------------------ transport */

  private async get<T>(
    path: string,
    requestQuery?: Record<string, string | number | boolean>,
  ): Promise<T> {
    try {
      const response = await this.client.request<Envelope<T>>({
        path,
        method: 'GET',
        ...(requestQuery ? { query: requestQuery } : {}),
      });
      return response.data;
    } catch (error) {
      throw toError(error);
    }
  }

  private async post<T>(
    path: string,
    options: { readonly json: unknown } | { readonly body: BodyInit },
  ): Promise<T> {
    try {
      const response = await this.client.request<Envelope<T>>({
        path,
        method: 'POST',
        ...options,
      });
      return response.data;
    } catch (error) {
      throw toError(error);
    }
  }

  private async patch<T>(
    path: string,
    options: { json?: unknown },
  ): Promise<T> {
    try {
      const response = await this.client.request<Envelope<T>>({
        path,
        method: 'PATCH',
        ...options,
      });
      return response.data;
    } catch (error) {
      throw toError(error);
    }
  }
}

/** True when the failure is a conflict the user can fix by reloading fresh data. */
export function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as ServiceError).status === 409
  );
}

/** The i18n-agnostic message of a `ServiceError`, for logs and fallbacks. */
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = (error as ServiceError).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * A single attachment's human-readable size. The server serializes a BIGINT
 * size as a decimal string, so the value is coerced before the arithmetic that
 * would otherwise turn it into `NaN` and report "0 B".
 */
export function formatBytes(bytes: number | string): string {
  const value = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / 1024 ** index;
  return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export type { ServiceError };
export type { ApiClient };
