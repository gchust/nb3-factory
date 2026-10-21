import type { ApiClient } from '@nocobase/app-client';

import type {
  TicketAttachment,
  TicketCategory,
  TicketComment,
  TicketDashboard,
  TicketDetail,
  TicketFilters,
  TicketListItem,
  TicketPage,
  TicketPriority,
  TicketUser,
} from './types.js';

interface DataResponse<T> {
  readonly data: T;
}

interface ListResponse {
  readonly data: readonly TicketListItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly priority: TicketPriority;
  readonly category: TicketCategory;
}

export class TicketsClient {
  public constructor(private readonly api: ApiClient) {}

  public async list(filters: TicketFilters): Promise<TicketPage> {
    const response = await this.api.request<ListResponse>({
      path: 'tickets',
      query: {
        q: filters.q,
        status: filters.status,
        priority: filters.priority,
        category: filters.category,
        page: filters.page,
        pageSize: filters.pageSize,
      },
    });
    return { rows: response.data, total: response.meta.total };
  }

  public async get(ticketId: string): Promise<TicketDetail> {
    return this.data('tickets/' + encodeURIComponent(ticketId));
  }

  public async create(input: CreateTicketInput): Promise<TicketDetail> {
    return this.send('tickets', input);
  }

  public async addComment(
    ticketId: string,
    body: string,
    internal: boolean,
  ): Promise<TicketComment> {
    return this.send('tickets/' + encodeURIComponent(ticketId) + '/comments', {
      body,
      internal,
    });
  }

  public async dashboard(): Promise<TicketDashboard> {
    return this.data('tickets/dashboard');
  }

  public async engineers(): Promise<readonly TicketUser[]> {
    const response = await this.api.request<{
      readonly data: readonly TicketUser[];
    }>({ path: 'tickets/engineers' });
    return response.data;
  }

  public async assign(
    ticketId: string,
    assigneeId: string,
  ): Promise<TicketDetail> {
    return this.send('tickets/' + encodeURIComponent(ticketId) + '/assign', {
      assigneeId,
    });
  }

  public async accept(ticketId: string): Promise<TicketDetail> {
    return this.send('tickets/' + encodeURIComponent(ticketId) + '/accept', {});
  }

  public async resolve(ticketId: string): Promise<TicketDetail> {
    return this.send(
      'tickets/' + encodeURIComponent(ticketId) + '/resolve',
      {},
    );
  }

  public async close(ticketId: string): Promise<TicketDetail> {
    return this.send('tickets/' + encodeURIComponent(ticketId) + '/close', {});
  }

  public async reopen(ticketId: string): Promise<TicketDetail> {
    return this.send('tickets/' + encodeURIComponent(ticketId) + '/reopen', {});
  }

  public async upload(
    ticketId: string,
    file: File,
    commentId?: string,
  ): Promise<TicketAttachment> {
    const body = new FormData();
    body.append('file', file);
    if (commentId) body.append('commentId', commentId);
    const response = await this.api.request<DataResponse<TicketAttachment>>({
      path: 'tickets/' + encodeURIComponent(ticketId) + '/attachments',
      method: 'POST',
      body,
    });
    return response.data;
  }

  public async download(attachment: TicketAttachment): Promise<Blob> {
    const stream = await this.api.stream({ path: attachment.contentUrl });
    return new Response(stream).blob();
  }

  private async data<T>(path: string): Promise<T> {
    const response = await this.api.request<DataResponse<T>>({ path });
    return response.data;
  }

  private async send<T>(path: string, json: unknown): Promise<T> {
    const response = await this.api.request<DataResponse<T>>({
      path,
      method: 'POST',
      json,
    });
    return response.data;
  }
}
