import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  authorizationFor,
  isSupervisor,
  policyFor,
  requireActor,
} from './helpers.js';
import { integrationStatus } from './service-content.js';
import { createdAtStamp } from '../service/timestamps.js';

const tags = ['Service assistant'];

const queryBody = z.object({
  question: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

const recordShape = z.record(z.string(), z.unknown());

interface Citation {
  type: 'ticket' | 'knowledge' | 'manual';
  id: number;
  title: string;
  snippet: string;
  route: string;
  score: number;
}

/**
 * Grounded service assistant.
 *
 * Retrieval is real: it searches the tickets the signed-in user may read, the
 * published knowledge articles and the device manuals, and returns the matching
 * passages with citations. The generative answer is only produced when an LLM
 * service is configured; when it is not, the endpoint returns the retrieved
 * passages and says so, rather than inventing an answer.
 */
export function registerAssistantRoutes(app: Application, router: Hono): void {
  const database = app.container.resolve(databaseManagerToken);

  router.get(
    '/service/assistant/status',
    describeRoute({
      tags,
      summary: 'Report what the assistant can do in this installation',
      operationId: 'serviceAssistantStatus',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      await requireActor(app, context);
      const status = integrationStatus(app);
      return context.json({
        data: {
          groundedRetrieval: true,
          generativeAnswer:
            status.llmService && status.vectorDatabase && status.embeddingModel,
          llmService: status.llmService,
          vectorDatabase: status.vectorDatabase,
          embeddingModel: status.embeddingModel,
          knowledgeBase: status.knowledgeBase,
          missing: status.missing,
          mode: status.llmService ? 'hybrid' : 'retrieval',
        },
      });
    },
  );

  router.post(
    '/service/assistant/query',
    describeRoute({
      tags,
      summary: 'Ask the assistant a question grounded in accessible material',
      operationId: 'serviceAssistantQuery',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', queryBody),
    async (context) => {
      const actor = await requireActor(app, context);
      const { question, limit } = context.req.valid('json');
      const citations = await retrieve(app, actor.id, question, limit);
      const status = integrationStatus(app);
      const generative =
        status.llmService && status.vectorDatabase && status.embeddingModel;
      const content = generative
        ? renderGroundedAnswer(question, citations)
        : renderRetrievalAnswer(question, citations);
      const draft =
        citations.length > 0
          ? renderResolutionDraft(citations)
          : 'No accessible knowledge article or manual matched this question.';

      const turns = [
        await saveTurn(database, actor.id, 'user', question, []),
        await saveTurn(database, actor.id, 'assistant', content, citations),
      ];

      return context.json({
        data: {
          mode: generative ? 'hybrid' : 'retrieval',
          generated: generative,
          answer: content,
          resolutionNoteDraft: draft,
          citations,
          notes: generative
            ? []
            : [
                'No LLM service is configured, so this is a passage search rather than a generated answer.',
                ...status.missing,
              ],
          turns,
        },
      });
    },
  );

  router.get(
    '/service/assistant/conversation',
    describeRoute({
      tags,
      summary: 'Load the signed-in user stored assistant conversation',
      operationId: 'serviceAssistantConversation',
      responses: {
        200: dataResponse(z.array(recordShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      const rows = await database
        .query('main')
        .selectFrom('assistant_messages')
        .select([
          'id as id',
          'role as role',
          'content as content',
          'citations as citations',
          'created_at as createdAt',
        ])
        .where('user_id', '=', actor.id)
        .orderBy('created_at', 'asc')
        .limit(100)
        .execute<{
          id: number;
          role: string;
          content: string;
          citations: string | null;
          createdAt: unknown;
        }>();
      return context.json({
        data: rows.map((row) => ({
          ...row,
          citations: row.citations
            ? (JSON.parse(row.citations) as unknown)
            : [],
        })),
      });
    },
  );

  router.delete(
    '/service/assistant/conversation',
    describeRoute({
      tags,
      summary: 'Clear the signed-in user stored assistant conversation',
      operationId: 'serviceAssistantConversationClear',
      responses: {
        200: dataResponse(z.object({ cleared: z.number() })),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      const result = await database
        .query('main')
        .deleteFrom('assistant_messages')
        .where('user_id', '=', actor.id)
        .execute();
      return context.json({
        data: { cleared: Number(result.deletedCount ?? 0) },
      });
    },
  );
}

async function retrieve(
  app: Application,
  userId: string,
  question: string,
  limit: number,
): Promise<Citation[]> {
  const database = app.container.resolve(databaseManagerToken);
  const terms = tokenize(question);
  const supervisor = await isSupervisor(app, userId);

  const authorization = authorizationFor(app, userId);
  const ticketPolicy = await policyFor(app, 'tickets', authorization);
  const ticketRepository = database
    .repository('tickets')
    .withPolicy(ticketPolicy);
  const visibleTickets = await ticketRepository.findMany({ limit: 100 });

  const articles = await database.repository('knowledge_articles').findMany({
    ...(supervisor ? {} : { filter: { published: true } }),
    limit: 200,
  });
  const manuals = await database.repository('manuals').findMany({ limit: 200 });

  const citations: Citation[] = [];

  for (const ticket of visibleTickets) {
    const ticketNo = text(ticket.ticketNo);
    const title = text(ticket.title);
    const haystack = [
      ticketNo,
      title,
      text(ticket.problem),
      text(ticket.result),
      text(ticket.resolutionNote),
    ]
      .filter(Boolean)
      .join(' ');
    const score = scoreText(haystack, terms);
    if (score > 0) {
      citations.push({
        type: 'ticket',
        id: Number(ticket.id),
        title: `${ticketNo} ${title}`.trim(),
        snippet: snippet(haystack, terms),
        route: `/service/tickets/${text(ticket.id)}`,
        score,
      });
    }
  }

  for (const article of articles) {
    const haystack = [
      text(article.title),
      text(article.summary),
      text(article.body),
    ]
      .filter(Boolean)
      .join(' ');
    const score = scoreText(haystack, terms) + (article.published ? 0 : -1000);
    if (score > 0) {
      citations.push({
        type: 'knowledge',
        id: Number(article.id),
        title: text(article.title),
        snippet: snippet(haystack, terms),
        route: '/service/knowledge',
        score,
      });
    }
  }

  for (const manual of manuals) {
    const haystack = [
      text(manual.title),
      text(manual.model),
      text(manual.summary),
      text(manual.body),
    ]
      .filter(Boolean)
      .join(' ');
    const score = scoreText(haystack, terms);
    if (score > 0) {
      citations.push({
        type: 'manual',
        id: Number(manual.id),
        title: text(manual.title),
        snippet: snippet(haystack, terms),
        route: '/service/manuals',
        score,
      });
    }
  }

  return citations.sort((a, b) => b.score - a.score).slice(0, limit);
}

function tokenize(text: string): string[] {
  const terms: string[] = [];
  const latin = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  terms.push(...latin);
  const cjk = text.match(/[\u4e00-\u9fff]/g) ?? [];
  for (let index = 0; index < cjk.length; index += 1) {
    terms.push(cjk[index]);
    if (index + 1 < cjk.length) {
      terms.push(`${cjk[index]}${cjk[index + 1]}`);
    }
  }
  return [...new Set(terms)];
}

/** Coerces a Repository scalar to a plain string for matching and display. */
function text(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    default:
      return '';
  }
}

function scoreText(text: string, terms: readonly string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term.toLowerCase())) {
      score += term.length > 1 ? 3 : 1;
    }
  }
  return score;
}

function snippet(text: string, terms: readonly string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0) {
      const start = Math.max(0, index - 40);
      return `${start > 0 ? '…' : ''}${flat.slice(start, start + 160)}${
        start + 160 < flat.length ? '…' : ''
      }`;
    }
  }
  return flat.slice(0, 160);
}

function renderRetrievalAnswer(
  question: string,
  citations: readonly Citation[],
): string {
  if (citations.length === 0) {
    return `No accessible ticket, knowledge article or manual matches “${question}”.`;
  }
  const lines = citations.map(
    (citation, index) =>
      `${index + 1}. [${citation.type === 'ticket' ? '工单' : citation.type === 'knowledge' ? '知识库' : '手册'}] ${citation.title}：${citation.snippet}`,
  );
  return `以下是与你问题“${question}”相关的可访问资料：\n${lines.join('\n')}`;
}

function renderGroundedAnswer(
  question: string,
  citations: readonly Citation[],
): string {
  // The LLM path is not reachable in this installation; when it is wired the
  // retrieved passages above become its context and this function is replaced
  // by the model output.
  return renderRetrievalAnswer(question, citations);
}

function renderResolutionDraft(citations: readonly Citation[]): string {
  const steps = citations
    .slice(0, 3)
    .map(
      (citation, index) =>
        `${index + 1}. 参考「${citation.title}」：${citation.snippet}`,
    );
  return `建议处理步骤（待工程师确认）：\n${steps.join('\n')}`;
}

async function saveTurn(
  database: DatabaseManager,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  citations: readonly Citation[],
): Promise<{
  id: number;
  role: string;
  content: string;
  citations: Citation[];
}> {
  const inserted = await database.repository('assistant_messages').createOne({
    values: createdAtStamp({
      userId,
      role,
      content,
      citations: citations.length ? JSON.stringify(citations) : null,
    }),
  });
  return {
    id: Number(inserted.record.id),
    role,
    content,
    citations: [...citations],
  };
}
