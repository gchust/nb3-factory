import type { ServiceKnowledgeService } from './knowledge-service.js';

/**
 * The after-sales assistant. It always answers with a real, database-backed
 * knowledge search over the application's published articles and manuals. It
 * only produces a generated answer when a language model is actually
 * configured.
 *
 * A generated answer is never synthesized from fixed text: when no model or
 * embedding service is configured the response says so, and the caller shows
 * the search results and a blocked notice instead of an invented reply.
 */

export interface AssistantAnswer {
  query: string;
  mode: 'knowledge_search' | 'generated';
  results: Awaited<ReturnType<ServiceKnowledgeService['search']>>;
  ai: {
    status: 'blocked' | 'ready';
    reason?: string;
    answer?: string;
  };
}

export interface AssistantGenerator {
  ready(): boolean;
  readonly reason: string;
  generate(question: string, context: readonly string[]): Promise<string>;
}

export class ServiceAssistantService {
  public constructor(
    private readonly knowledge: ServiceKnowledgeService,
    private readonly generator: AssistantGenerator,
  ) {}

  public async ask(question: string): Promise<AssistantAnswer> {
    const results = await this.knowledge.search(question, { limit: 8 });
    if (!this.generator.ready()) {
      return {
        query: question,
        mode: 'knowledge_search',
        results,
        ai: {
          status: 'blocked',
          reason: this.generator.reason,
        },
      };
    }
    const context = results
      .map(
        (hit, index) =>
          `[${index + 1}] ${hit.title}\n${hit.summary ?? ''}\n${hit.snippet}`,
      )
      .join('\n\n');
    const answer = await this.generator.generate(question, [context]);
    return {
      query: question,
      mode: 'generated',
      results,
      ai: { status: 'ready', answer },
    };
  }

  public async search(question: string) {
    return this.knowledge.search(question, { limit: 12 });
  }
}
