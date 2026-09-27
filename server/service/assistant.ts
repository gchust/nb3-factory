import {
  databaseManagerToken,
  type DatabaseManager,
  type Expression,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { ServiceModuleConfig } from '../config/service.js';
import {
  ServiceError,
  serviceAccessToken,
  type ServiceIdentity,
} from './access.js';
import { textValue } from './text.js';
import {
  serviceTicketToken,
  type AssistantTicketAction,
  type TicketActionPayload,
} from './tickets.js';

/**
 * The service assistant.
 *
 * It is deliberately honest about what it is: when no model service is
 * configured it says so and answers from the knowledge base and the tickets
 * the caller is already allowed to read. It never writes on its own — it
 * proposes an action, and only the explicit confirm endpoint performs it,
 * re-checking permission at that moment.
 */

export const serviceAssistantToken =
  createServiceToken<ServiceAssistantService>('service.assistant');

export const ASSISTANT_UNAVAILABLE_REASON = 'NO_MODEL_SERVICE_CONFIGURED';

export interface AssistantStatus {
  readonly available: boolean;
  readonly mode: 'knowledge-search' | 'model';
  readonly modelConfigured: boolean;
  readonly knowledgeSearch: boolean;
  readonly reason?: string;
}

export interface AssistantCitation {
  readonly type: 'article' | 'ticket';
  readonly id: number;
  readonly title: string;
  readonly snippet: string;
}

export interface AssistantProposal {
  readonly id: string;
  readonly kind: 'ticket-action' | 'knowledge-draft';
  readonly label: string;
  readonly requiresConfirmation: true;
  readonly ticketId?: number;
  readonly action?: AssistantTicketAction;
  readonly payload?: TicketActionPayload;
  readonly article?: {
    readonly title: string;
    readonly summary: string;
    readonly content: string;
    readonly category: string;
  };
}

export interface AssistantAnswer {
  readonly question: string;
  readonly status: AssistantStatus;
  readonly answer: string;
  readonly citations: readonly AssistantCitation[];
  readonly proposals: readonly AssistantProposal[];
}

export class ServiceAssistantService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
    private readonly config: ServiceModuleConfig,
    private readonly modelConfigured: boolean,
  ) {}

  status(): AssistantStatus {
    if (!this.config.assistant.enabled) {
      return {
        available: false,
        mode: 'knowledge-search',
        modelConfigured: this.modelConfigured,
        knowledgeSearch: false,
        reason: 'ASSISTANT_DISABLED',
      };
    }
    return {
      available: true,
      mode: this.modelConfigured ? 'model' : 'knowledge-search',
      modelConfigured: this.modelConfigured,
      knowledgeSearch: true,
      reason: this.modelConfigured ? undefined : ASSISTANT_UNAVAILABLE_REASON,
    };
  }

  async ask(input: {
    readonly identity: ServiceIdentity;
    readonly question: string;
    readonly ticketId?: number | null;
  }): Promise<AssistantAnswer> {
    const access = this.container.resolve(serviceAccessToken);
    access.requireAssistant(input.identity);
    const status = this.status();
    if (!status.available) {
      throw new ServiceError(
        409,
        'ASSISTANT_DISABLED',
        'The service assistant is disabled in this application.',
      );
    }

    const citations: AssistantCitation[] = [];
    const proposals: AssistantProposal[] = [];
    const terms = extractTerms(input.question);
    const articles = await this.searchArticles(
      terms,
      this.config.assistant.maxResults,
    );
    for (const article of articles) {
      citations.push({
        type: 'article',
        id: Number(article.id),
        title: textValue(article.title),
        snippet: snippetOf(
          textValue(article.summary) || textValue(article.content),
        ),
      });
    }

    let ticket: Row | null = null;
    if (input.ticketId !== undefined && input.ticketId !== null) {
      const tickets = this.container.resolve(serviceTicketToken);
      const candidate = await tickets.loadTicket(input.ticketId);
      await access.requireTicketRead(input.identity, asScopeRow(candidate));
      ticket = candidate;
      citations.push({
        type: 'ticket',
        id: Number(candidate.id),
        title: `${textValue(candidate.serial)} · ${textValue(candidate.title)}`,
        snippet: snippetOf(textValue(candidate.description)),
      });
      proposals.push(...this.proposalsForTicket(candidate));
    }

    const answer = this.composeAnswer(
      input.question,
      citations,
      ticket,
      status,
    );
    return { question: input.question, status, answer, citations, proposals };
  }

  /**
   * Performs a previously proposed action. Nothing is written before this
   * call, and permission is re-checked here rather than trusted from the
   * request that asked for the proposal.
   */
  async confirm(input: {
    readonly identity: ServiceIdentity;
    readonly proposal: AssistantProposal;
    readonly acknowledge: boolean;
  }): Promise<Record<string, unknown>> {
    const access = this.container.resolve(serviceAccessToken);
    access.requireAssistant(input.identity);
    if (!input.acknowledge) {
      throw new ServiceError(
        400,
        'CONFIRMATION_REQUIRED',
        'The proposed action must be explicitly confirmed.',
      );
    }
    if (input.proposal.requiresConfirmation !== true) {
      throw new ServiceError(
        400,
        'INVALID_PROPOSAL',
        'The proposal is not a confirmable action.',
      );
    }

    if (input.proposal.kind === 'ticket-action') {
      const action = input.proposal.action;
      const ticketId = input.proposal.ticketId;
      if (!action || ticketId === undefined) {
        throw new ServiceError(
          400,
          'INVALID_PROPOSAL',
          'The proposal is incomplete.',
        );
      }
      const tickets = this.container.resolve(serviceTicketToken);
      const result = await tickets.applyAction({
        ticketId,
        action,
        payload: input.proposal.payload ?? {},
        requestKey: `assistant:${input.proposal.id}`,
        actor: {
          id: input.identity.userId,
          name: this.config.assistant.enabled ? 'Service assistant' : null,
          role: 'assistant-confirmed',
        },
        identity: input.identity,
      });
      return {
        kind: 'ticket-action',
        action,
        ticketId,
        replayed: result.replayed,
        warnings: result.warnings,
        ticket: tickets.sanitizeFor(input.identity, result.ticket),
      };
    }

    access.requireKnowledgeWrite(input.identity);
    const article = input.proposal.article;
    if (!article) {
      throw new ServiceError(
        400,
        'INVALID_PROPOSAL',
        'The proposal is incomplete.',
      );
    }
    const now = new Date().toISOString();
    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;
    const result = await this.database
      .query()
      .insertInto('service_knowledge_articles')
      .values({
        slug,
        title: article.title,
        summary: article.summary,
        content: article.content,
        category: article.category,
        status: 'draft',
        tags: null,
        authorId: input.identity.userId,
        authorName: null,
        publishedAt: null,
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { kind: 'knowledge-draft', id: Number(result.insertId ?? 0), slug };
  }

  private async searchArticles(
    terms: readonly string[],
    limit: number,
  ): Promise<Row[]> {
    let query = this.database
      .query()
      .selectFrom('service_knowledge_articles')
      .selectAll()
      .where('status', '=', 'published');
    if (terms.length > 0) {
      query = query.where((eb) => {
        const clauses: Expression<boolean>[] = [];
        for (const term of terms) {
          clauses.push(eb('title', 'like', `%${term}%`));
          clauses.push(eb('summary', 'like', `%${term}%`));
          clauses.push(eb('content', 'like', `%${term}%`));
        }
        return eb.or(clauses);
      });
    }
    const rows = await query
      .limit(Math.min(Math.max(limit, 1), 20))
      .execute<Row>();
    return rows;
  }

  private proposalsForTicket(ticket: Row): AssistantProposal[] {
    const status = textValue(ticket.status);
    const id = Number(ticket.id);
    const serial = textValue(ticket.serial, String(id));
    const proposals: AssistantProposal[] = [
      {
        id: `ticket-${id}-comment-${Date.now().toString(36)}`,
        kind: 'ticket-action',
        label: `Add a progress comment to ${serial}`,
        requiresConfirmation: true,
        ticketId: id,
        action: 'comment',
        payload: {
          comment: 'Progress update recorded from the service assistant.',
        },
      },
    ];
    if (status === 'pending_assignment') {
      proposals.push({
        id: `ticket-${id}-assign-${Date.now().toString(36)}`,
        kind: 'ticket-action',
        label: `Start work on ${serial} as myself`,
        requiresConfirmation: true,
        ticketId: id,
        action: 'assign',
        payload: { assigneeId: '' },
      });
    }
    if (status === 'in_progress') {
      proposals.push({
        id: `ticket-${id}-resolve-${Date.now().toString(36)}`,
        kind: 'ticket-action',
        label: `Send ${serial} for customer confirmation`,
        requiresConfirmation: true,
        ticketId: id,
        action: 'resolve',
        payload: { resolution: 'Fault cleared and verified on site.' },
      });
    }
    if (status === 'pending_confirmation') {
      proposals.push({
        id: `ticket-${id}-confirm-${Date.now().toString(36)}`,
        kind: 'ticket-action',
        label: `Close ${serial} after customer confirmation`,
        requiresConfirmation: true,
        ticketId: id,
        action: 'confirm',
        payload: {},
      });
      proposals.push({
        id: `ticket-${id}-return-${Date.now().toString(36)}`,
        kind: 'ticket-action',
        label: `Return ${serial} for rework`,
        requiresConfirmation: true,
        ticketId: id,
        action: 'return',
        payload: { reason: 'Customer reported the fault is still present.' },
      });
    }
    return proposals;
  }

  private composeAnswer(
    question: string,
    citations: readonly AssistantCitation[],
    ticket: Row | null,
    status: AssistantStatus,
  ): string {
    const lines: string[] = [];
    if (!status.modelConfigured) {
      lines.push(
        'No model service is configured, so this answer is assembled from the knowledge base and the tickets you may read.',
      );
    }
    if (ticket) {
      lines.push(
        `Ticket ${textValue(ticket.serial)} is "${textValue(ticket.status)}" with priority "${textValue(ticket.priority)}".`,
      );
    }
    if (citations.length === 0) {
      lines.push(
        `No published article matched "${question}". Try a device model, a fault symptom, or a ticket number.`,
      );
    } else {
      lines.push(`${citations.length} relevant record(s) found:`);
      for (const citation of citations) {
        lines.push(`- ${citation.title}: ${citation.snippet}`);
      }
    }
    lines.push(
      'Any change is only a proposal. Confirm it explicitly before it is written.',
    );
    return lines.join('\n');
  }
}

function extractTerms(question: string): string[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'how',
    'what',
    'why',
    'does',
    '服务',
    '怎么',
    '如何',
    '什么',
  ]);
  const terms = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !stop.has(term));
  return [...new Set(terms)].slice(0, 5);
}

function snippetOf(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug.slice(0, 100) : 'article';
}

function asScopeRow(row: Row) {
  return {
    id: Number(row.id),
    region: (row.region as string | null) ?? null,
    assigneeId: (row.assigneeId as string | null) ?? null,
    reporterId: (row.reporterId as string | null) ?? null,
    confidential: row.confidential,
  };
}

export function createServiceAssistantService(
  container: ServiceResolver,
  config: ServiceModuleConfig,
  modelConfigured: boolean,
): ServiceAssistantService {
  return new ServiceAssistantService(
    container.resolve(databaseManagerToken),
    container,
    config,
    modelConfigured,
  );
}
