import type { DatabaseManager } from '@nocobase/db';

import type { ServiceActor } from './access.js';
import type { KnowledgeArticle, Ticket } from './domain.js';
import { ServiceNotFoundError, ServiceValidationError } from './errors.js';
import { visibleTicketIds } from './visibility.js';

export interface AssistantAnswer {
  readonly draft: string;
  readonly sources: readonly { id: number; title: string }[];
  readonly language: 'zh-CN' | 'en-US';
}

export interface AssistantService {
  search(
    query: string,
    actor: ServiceActor,
  ): Promise<readonly KnowledgeArticle[]>;
  draft(
    input: {
      ticketId?: number | null;
      question?: string | null;
      language?: string | null;
    },
    actor: ServiceActor,
  ): Promise<AssistantAnswer>;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  '设备',
  '问题',
  '工单',
  '客户',
]);

function tokenize(text: string): string[] {
  const latin = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  return [...new Set([...latin, ...chinese])].filter(
    (token) => !STOP_WORDS.has(token),
  );
}

export function createAssistantService(
  database: DatabaseManager,
): AssistantService {
  const articles = () =>
    database.repository<KnowledgeArticle>('knowledge_articles');
  const tickets = () => database.repository<Ticket>('tickets');

  return {
    async search(query, actor) {
      // Reachability of the knowledge base is the route's composite check; this
      // service only narrows the published articles, so any role that may view
      // the knowledge page can ask the same question.
      void actor;
      const tokens = tokenize(query);
      const rows = (await articles().findMany()) ?? [];
      const published = rows.filter((row) => row.status === 'published');
      if (tokens.length === 0) return published.slice(0, 5);
      const scored = published
        .map((row) => {
          const haystack =
            `${row.title} ${row.summary ?? ''} ${row.tags ?? ''} ${row.content}`.toLowerCase();
          const score = tokens.reduce(
            (total, token) =>
              haystack.includes(token.toLowerCase()) ? total + 1 : total,
            0,
          );
          return { row, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);
      return scored.slice(0, 5).map((entry) => entry.row);
    },

    async draft(input, actor) {
      const language = input.language === 'en-US' ? 'en-US' : 'zh-CN';
      let ticket: Ticket | undefined;
      let question = input.question?.trim() ?? '';
      if (input.ticketId != null) {
        // The assistant must not become a way around record visibility. An
        // actor who cannot read the ticket gets the same "not found" answer as
        // one that does not exist, so the refusal never confirms that a hidden
        // ticket exists.
        const visibility = await visibleTicketIds(database, actor);
        const reachable =
          visibility.kind === 'all' ||
          (visibility.kind === 'ids' &&
            visibility.ids.includes(input.ticketId));
        if (!reachable) throw new ServiceNotFoundError('Ticket not found');
        ticket = await tickets().findOne({ filter: { id: input.ticketId } });
        if (!ticket) throw new ServiceNotFoundError('Ticket not found');
        question = [ticket.title, ticket.description, ticket.handling]
          .filter(Boolean)
          .join(' ');
      }
      if (!question) {
        throw new ServiceValidationError('A ticket or a question is required', {
          question: 'required',
        });
      }
      const sources = await this.search(question, actor);
      const draft = composeDraft({ question, ticket, sources, language });
      return {
        draft,
        sources: sources.map((article) => ({
          id: article.id,
          title: article.title,
        })),
        language,
      };
    },
  };
}

function composeDraft(input: {
  question: string;
  ticket?: Ticket;
  sources: readonly KnowledgeArticle[];
  language: 'zh-CN' | 'en-US';
}): string {
  const { ticket, sources, language } = input;
  if (language === 'en-US') {
    const lines: string[] = [];
    lines.push('Suggested handling draft:');
    if (ticket) {
      lines.push(`- Ticket ${ticket.ticketNo}: ${ticket.title}`);
      lines.push(`- Priority: ${ticket.priority}`);
    }
    if (sources.length === 0) {
      lines.push(
        '- No matching manual was found. Please inspect the device on site and record the findings.',
      );
    } else {
      lines.push('- Recommended references:');
      for (const article of sources) {
        lines.push(`  - ${article.title}`);
      }
      lines.push(`- Suggested first step: ${firstStep(sources[0])}`);
    }
    lines.push(
      '- Ask the customer to confirm the result before closing the ticket.',
    );
    return lines.join('\n');
  }
  const lines: string[] = [];
  lines.push('建议处理草稿：');
  if (ticket) {
    lines.push(`- 工单 ${ticket.ticketNo}：${ticket.title}`);
    lines.push(`- 优先级：${ticket.priority}`);
  }
  if (sources.length === 0) {
    lines.push('- 知识库中没有匹配的手册，请先现场排查并记录现象。');
  } else {
    lines.push('- 推荐引用手册：');
    for (const article of sources) {
      lines.push(`  - ${article.title}`);
    }
    lines.push(`- 建议第一步：${firstStep(sources[0])}`);
  }
  lines.push('- 处理完成后请让客户确认结果，再提交关闭。');
  return lines.join('\n');
}

function firstStep(article: KnowledgeArticle | undefined): string {
  if (!article) return '';
  const content = article.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return content[0] ?? article.title;
}
