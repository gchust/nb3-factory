import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  requireCapability,
  sharedTicketIds,
  ticketAccessible,
  type ServiceCaller,
  type TicketScopeRow,
} from './service-auth.js';
import { ServiceRuleError } from './tickets.js';

interface KnowledgeRow {
  id: number;
  title: string;
  deviceCategory: string | null;
  summary: string | null;
  body: string | null;
}

interface AssistantTicketRow extends TicketScopeRow {
  ticketNo: string;
  title: string;
  status: string;
  description: string | null;
}

function keywords(text: string): string[] {
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-z0-9]{2,}/g) ?? [];
  const chinese = normalized.match(/[\u4e00-\u9fa5]{1,4}/g) ?? [];
  return [...new Set([...latin, ...chinese])].slice(0, 24);
}

function score(text: string | null | undefined, terms: string[]): number {
  if (!text) return 0;
  const haystack = text.toLowerCase();
  let total = 0;
  for (const term of terms) if (haystack.includes(term)) total += 1;
  return total;
}

/**
 * The Service Assistant answers from the application's own knowledge base and
 * ticket history. When an LLM service is configured it is used to summarise the
 * retrieved evidence; without one the deterministic answer is still complete,
 * so the feature never depends on an external credential to work.
 */
export class AssistantService {
  constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get query() {
    return this.database.query();
  }

  async listConversations(caller: ServiceCaller) {
    await requireCapability(caller, 'assistant.use');
    return this.query
      .selectFrom('serviceAssistantConversations')
      .selectAll()
      .where('userId', '=', caller.id)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .execute();
  }

  async createConversation(caller: ServiceCaller, title?: string) {
    await requireCapability(caller, 'assistant.use');
    const now = new Date();
    // `createdAt` is written but not used as a read-back key: SQLite stores the
    // datetime in its own textual form, so equality on a JS `Date` would not
    // match. The row just inserted is the newest for this user.
    await this.query
      .insertInto('serviceAssistantConversations')
      .values({
        userId: caller.id,
        title: title?.trim() || '服务助手会话',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.query
      .selectFrom('serviceAssistantConversations')
      .selectAll()
      .where('userId', '=', caller.id)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
  }

  private async ownedConversation(caller: ServiceCaller, id: number) {
    const conversation = await this.query
      .selectFrom('serviceAssistantConversations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!conversation || String(conversation.userId) !== caller.id)
      throw new ServiceRuleError('Conversation not found', 404);
    return conversation;
  }

  async detail(caller: ServiceCaller, id: number) {
    await requireCapability(caller, 'assistant.use');
    const conversation = await this.ownedConversation(caller, id);
    const messages = await this.query
      .selectFrom('serviceAssistantMessages')
      .selectAll()
      .where('conversationId', '=', id)
      .orderBy('id', 'asc')
      .execute();
    return { conversation, messages };
  }

  private async retrieve(caller: ServiceCaller, question: string) {
    const terms = keywords(question);
    const knowledge = (await this.query
      .selectFrom('serviceKnowledge')
      .select(['id', 'title', 'deviceCategory', 'summary', 'body'])
      .where('status', '=', 'published')
      .limit(200)
      .execute()) as unknown as KnowledgeRow[];
    const rankedKnowledge = knowledge
      .map((article) => ({
        article,
        score:
          score(article.title, terms) * 3 +
          score(article.summary, terms) * 2 +
          score(article.body, terms),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((item) => item.article);

    const tickets = (await this.query
      .selectFrom('serviceTickets')
      .select([
        'id',
        'ticketNo',
        'title',
        'status',
        'region',
        'confidential',
        'assigneeId',
        'reporterId',
        'description',
      ])
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .execute()) as unknown as AssistantTicketRow[];
    const shared = await sharedTicketIds(this.database, caller.id);
    const visible: AssistantTicketRow[] = [];
    for (const ticket of tickets) {
      if (await ticketAccessible(caller, ticket, shared)) visible.push(ticket);
    }
    const rankedTickets = visible
      .map((ticket) => ({
        ticket,
        score:
          score(ticket.title, terms) * 2 + score(ticket.description, terms),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item) => item.ticket);
    return { rankedKnowledge, rankedTickets, terms };
  }

  private deterministicAnswer(
    question: string,
    evidence: Awaited<ReturnType<AssistantService['retrieve']>>,
  ): string {
    const lines: string[] = [];
    if (!evidence.rankedKnowledge.length && !evidence.rankedTickets.length) {
      lines.push(`未在知识库或工单记录中找到与“${question}”直接相关的内容。`);
      lines.push('建议：补充设备型号与故障现象，或联系服务主管进一步排查。');
      return lines.join('\n');
    }
    if (evidence.rankedKnowledge.length) {
      lines.push('参考知识库：');
      for (const article of evidence.rankedKnowledge) {
        lines.push(`- 《${article.title}》：${article.summary ?? ''}`);
        if (article.body)
          lines.push(`  处理要点：${article.body.slice(0, 160)}`);
      }
    }
    if (evidence.rankedTickets.length) {
      lines.push('相关历史工单：');
      for (const ticket of evidence.rankedTickets) {
        lines.push(`- ${ticket.ticketNo}【${ticket.status}】${ticket.title}`);
      }
    }
    lines.push('建议优先按知识库中的排查步骤逐项确认，并记录现场结果。');
    return lines.join('\n');
  }

  /** Best-effort LLM summary; any failure falls back to the deterministic answer. */
  private async tryLlm(
    caller: ServiceCaller,
    question: string,
    contextText: string,
  ): Promise<string | undefined> {
    try {
      const llmServices = this.app.config.get<unknown>('ai.llmServices');
      if (!Array.isArray(llmServices) || llmServices.length === 0)
        return undefined;
      const services = await import('@nocobase/app-plugin-ai-employee/server');
      const container = this.app.container;
      if (
        !container.has(services.aiConversationsManagerToken) ||
        !container.has(services.agentServiceFactoryToken)
      )
        return undefined;
      const conversations = container.resolve(
        services.aiConversationsManagerToken,
      );
      const factory = container.resolve(services.agentServiceFactoryToken);
      const conversation = await conversations.create({
        userId: caller.id,
        title: '服务助手',
      });
      const agent = await factory.createAgent({
        sessionId: conversation.sessionId,
        systemPrompt:
          '你是设备售后服务助手。只依据提供的知识库与工单证据作答，使用简体中文，先给结论再给步骤。',
      });
      const result = await agent.invoke({
        userMessages: [
          {
            role: 'user',
            content: `问题：${question}\n\n可用证据：\n${contextText}`,
          },
        ],
      });
      return extractText(result);
    } catch {
      return undefined;
    }
  }

  async ask(caller: ServiceCaller, conversationId: number, question: string) {
    await requireCapability(caller, 'assistant.use');
    if (!question?.trim()) throw new ServiceRuleError('Question is required');
    await this.ownedConversation(caller, conversationId);
    const evidence = await this.retrieve(caller, question);
    const contextText = [
      ...evidence.rankedKnowledge.map(
        (article) =>
          `【知识】${article.title}\n${article.summary ?? ''}\n${article.body ?? ''}`,
      ),
      ...evidence.rankedTickets.map(
        (ticket) =>
          `【工单】${ticket.ticketNo} ${ticket.title} (${ticket.status})`,
      ),
    ].join('\n\n');
    const answer =
      (await this.tryLlm(caller, question, contextText)) ??
      this.deterministicAnswer(question, evidence);

    const now = new Date();
    await this.database.transaction(async (connection) => {
      await connection.query
        .insertInto('serviceAssistantMessages')
        .values({
          conversationId,
          role: 'user',
          content: question.trim(),
          context: null,
          createdAt: now,
        })
        .execute();
      await connection.query
        .insertInto('serviceAssistantMessages')
        .values({
          conversationId,
          role: 'assistant',
          content: answer,
          context: JSON.stringify({
            knowledge: evidence.rankedKnowledge.map((article) => article.id),
            tickets: evidence.rankedTickets.map((ticket) => ticket.ticketNo),
          }),
          createdAt: now,
        })
        .execute();
      await connection.query
        .updateTable('serviceAssistantConversations')
        .set({ updatedAt: now })
        .where('id', '=', conversationId)
        .execute();
    });
    return {
      answer,
      knowledge: evidence.rankedKnowledge,
      tickets: evidence.rankedTickets,
    };
  }
}

function extractText(result: unknown): string | undefined {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return undefined;
  const record = result as Record<string, unknown>;
  if (typeof record.content === 'string') return record.content;
  const messages = record.messages;
  if (Array.isArray(messages)) {
    const list = messages as unknown[];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const message = list[index];
      if (
        message &&
        typeof message === 'object' &&
        (message as { role?: string }).role === 'assistant'
      ) {
        const content = (message as { content?: unknown }).content;
        if (typeof content === 'string') return content;
      }
    }
  }
  return undefined;
}
