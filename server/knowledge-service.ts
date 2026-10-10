import type {
  Authorization,
  AuthorizationContext,
  AuthorizationDecision,
  CompositeResourceConditions,
} from '@nocobase/authorization/core';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type {
  DatabaseManager,
  Repository,
  RepositoryPolicy,
} from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

import {
  KNOWLEDGE_DOCUMENTS_COLLECTION,
  KNOWLEDGE_DOCUMENTS_RESOURCE,
  type KnowledgeDocument,
} from './knowledge-resources.js';

/** A document plus how well it matched a question. */
export interface KnowledgeSearchMatch extends KnowledgeDocument {
  score: number;
}

/** The identity facts the assistant has about the person asking. */
export interface KnowledgeActor {
  id: string | number;
  roles?: readonly string[];
  isRoot?: boolean;
}

export interface KnowledgeService {
  /** Builds the same identity-scoped context the request middleware builds. */
  contextForActor(actor: KnowledgeActor): Promise<AuthorizationContext>;
  /** The documents this identity may read, newest first. */
  listDocuments(context: AuthorizationContext): Promise<KnowledgeDocument[]>;
  /** One document, or `undefined` when it does not exist or is out of scope. */
  getDocument(
    context: AuthorizationContext,
    documentId: number,
  ): Promise<KnowledgeDocument | undefined>;
  /**
   * Updates the two fields a supervisor may author. Throws
   * `AuthorizationDeniedError` when the identity holds no manage grant, and
   * returns `undefined` when the document is out of scope.
   */
  updateDocument(
    context: AuthorizationContext,
    documentId: number,
    input: { title?: string; body?: string },
  ): Promise<KnowledgeDocument | undefined>;
  /**
   * Ranked retrieval over exactly the documents the identity may read. A
   * restricted document never reaches the ranking, so the assistant cannot
   * quote what the asker is not allowed to open.
   */
  searchDocuments(
    context: AuthorizationContext,
    query: string,
    limit?: number,
  ): Promise<KnowledgeSearchMatch[]>;
}

export const knowledgeServiceToken = createServiceToken<KnowledgeService>(
  'nb3-factory/knowledge-service',
);

type CompositeDecision = AuthorizationDecision<CompositeResourceConditions>;

/**
 * A composite decision carries one Repository Policy per composed collection.
 * A denied branch is `false` rather than a policy, which a Repository refuses
 * to run under.
 */
function policyFromDecision(
  decision: CompositeDecision,
): RepositoryPolicy | undefined {
  const database = decision.conditions?.database as
    Readonly<Record<string, RepositoryPolicy | boolean>> | undefined;
  const policy = database?.[KNOWLEDGE_DOCUMENTS_COLLECTION];
  return typeof policy === 'object' && policy !== null ? policy : undefined;
}

/** Authorizes one composite action and returns its document policy, or throws. */
async function requirePolicy(
  context: AuthorizationContext,
  action: 'read' | 'manage',
): Promise<RepositoryPolicy> {
  const decision = await context.authorize({
    resource: { type: 'composite', id: KNOWLEDGE_DOCUMENTS_RESOURCE },
    action,
  });
  const policy = policyFromDecision(decision);
  if (decision.effect === 'deny' || !policy) {
    throw new AuthorizationDeniedError(decision);
  }
  return policy;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

/**
 * Splits text into comparable terms. ASCII words stay whole; a run of CJK
 * characters becomes its character bigrams, so a two-character term inside a
 * longer sentence still matches without any tokenizer or model call.
 */
export function searchTerms(text: string): string[] {
  const terms: string[] = [];
  for (const segment of normalize(text).split(' ')) {
    if (!segment) {
      continue;
    }
    if (
      /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u.test(segment)
    ) {
      const characters = Array.from(segment);
      if (characters.length === 1) {
        terms.push(characters[0]);
      } else {
        for (let index = 0; index < characters.length - 1; index += 1) {
          terms.push(`${characters[index]}${characters[index + 1]}`);
        }
      }
      continue;
    }
    terms.push(segment);
  }
  return terms;
}

/**
 * Ranked retrieval with no external service: a term found in the title counts
 * twice as much as one found in the body. Deterministic, so a repeated
 * question returns the same documents.
 */
export function rankDocuments(
  documents: readonly KnowledgeDocument[],
  query: string,
): KnowledgeSearchMatch[] {
  const terms = searchTerms(query);
  if (terms.length === 0) {
    return [];
  }
  const matches: KnowledgeSearchMatch[] = [];
  for (const document of documents) {
    const titleTerms = new Set(searchTerms(document.title));
    const bodyTerms = new Set(searchTerms(document.body));
    let hits = 0;
    for (const term of terms) {
      if (titleTerms.has(term)) {
        hits += 2;
      } else if (bodyTerms.has(term)) {
        hits += 1;
      }
    }
    if (hits > 0) {
      matches.push({ ...document, score: hits / terms.length });
    }
  }
  return matches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.title.localeCompare(right.title);
  });
}

export function createKnowledgeService(
  database: DatabaseManager,
  authorization: Authorization,
): KnowledgeService {
  const documents = (): Repository<KnowledgeDocument> =>
    database.repository<KnowledgeDocument>(KNOWLEDGE_DOCUMENTS_COLLECTION);

  // A Repository Policy makes every field the grant did not list optional in
  // the type. The grants this feature checks list the whole row, so the cast
  // is the truthful shape; the policy still constrains the SQL and the
  // writable fields at run time.
  const asDocument = (row: Partial<KnowledgeDocument> | undefined) =>
    row as KnowledgeDocument | undefined;
  const asDocuments = (rows: Partial<KnowledgeDocument>[]) =>
    rows as KnowledgeDocument[];

  return {
    async contextForActor(
      actor: KnowledgeActor,
    ): Promise<AuthorizationContext> {
      const principal = { type: 'user', id: String(actor.id) };
      const subjects = [
        { type: 'authenticated', id: '*' },
        ...(await authorization.subjects.resolveFor(principal)),
      ];
      return authorization.for({ principal, subjects });
    },

    async listDocuments(context) {
      const policy = await requirePolicy(context, 'read');
      return asDocuments(await documents().withPolicy(policy).findMany());
    },

    async getDocument(context, documentId) {
      const policy = await requirePolicy(context, 'read');
      return asDocument(
        await documents()
          .withPolicy(policy)
          .findOne({ filter: { id: documentId } }),
      );
    },

    async updateDocument(context, documentId, input) {
      const policy = await requirePolicy(context, 'manage');
      const repository = documents().withPolicy(policy);
      const existing = await repository.findOne({ filter: { id: documentId } });
      if (!existing) {
        return undefined;
      }
      const values: Partial<KnowledgeDocument> = { updatedAt: new Date() };
      if (input.title !== undefined) {
        values.title = input.title;
      }
      if (input.body !== undefined) {
        values.body = input.body;
      }
      await repository.updateOne({ filter: { id: documentId }, values });
      return asDocument(
        await repository.findOne({ filter: { id: documentId } }),
      );
    },

    async searchDocuments(context, query, limit = 5) {
      const policy = await requirePolicy(context, 'read');
      const visible = asDocuments(
        await documents().withPolicy(policy).findMany(),
      );
      return rankDocuments(visible, query).slice(0, limit);
    },
  };
}
