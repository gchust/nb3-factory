import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import { toMaterialView } from './read.js';
import { MATERIALS_COLLECTION, MATERIALS_RESOURCE_ID } from './resources.js';

/** The identity a tool call runs as; `ctx.actor` carries exactly these. */
export interface MaterialSearchActor {
  readonly id: string | number;
  readonly roles?: readonly string[];
  readonly isRoot?: boolean;
}

/** One material the asker is allowed to read. */
export interface MaterialSearchHit {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
}

export interface MaterialSearchResult {
  /** How the rows were chosen: by keyword, or the asker's whole readable set. */
  readonly mode: 'matched' | 'authorized';
  readonly materials: readonly MaterialSearchHit[];
}

/** Smallest number of authorized rows the service ranks at once. */
const RANKING_LIMIT = 200;

function termsOf(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const words = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
  return words.flatMap((word) =>
    word.length > 2 && /[\u3400-\u9fff]/u.test(word)
      ? Array.from({ length: word.length - 1 }, (_, index) =>
          word.slice(index, index + 2),
        )
      : [word],
  );
}

/**
 * Reads the materials a caller may see and ranks them against a query.
 *
 * Authorization is not a filter applied after the read: the caller's own
 * `app.materials` `view` decision is resolved first, and its database policy is
 * bound to the Repository, so the database only ever returns rows the caller
 * may read. A colleague's decision carries the `confidential = false` scope and
 * a confidential row is never selected; the ranking below only orders rows that
 * already passed authorization.
 */
export class MaterialSearchService {
  constructor(
    private readonly authorization: AppAuthorization,
    private readonly database: DatabaseManager,
  ) {}

  async search(
    actor: MaterialSearchActor,
    query: string,
    limit = 20,
  ): Promise<MaterialSearchResult> {
    const principal = { type: 'user', id: String(actor.id) };
    // Omitting the resolved memberships would deny every team-based grant.
    const subjects = [
      { type: 'authenticated', id: '*' },
      ...(await this.authorization.subjects.resolveFor(principal)),
    ];
    const decision = await this.authorization
      .for({ principal, subjects })
      .authorize({
        resource: { type: 'composite', id: MATERIALS_RESOURCE_ID },
        action: 'view',
      });
    const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
    if (decision.effect === 'deny' || !policy) {
      return { mode: 'authorized', materials: [] };
    }

    const rows = await this.database
      .repository(MATERIALS_COLLECTION)
      .withPolicy(policy)
      .findMany({ limit: RANKING_LIMIT });

    const hits: MaterialSearchHit[] = rows.map(toMaterialView);

    const terms = termsOf(query);
    const limitCount = Math.min(Math.max(Math.trunc(limit), 1), 50);
    if (!terms.length) {
      return { mode: 'authorized', materials: hits.slice(0, limitCount) };
    }

    const scored = hits
      .map((hit) => {
        const haystack = `${hit.title}\n${hit.body}`.toLowerCase();
        const score = terms.reduce(
          (total, term) => (haystack.includes(term) ? total + 1 : total),
          0,
        );
        return { hit, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.length
      ? {
          mode: 'matched',
          materials: scored.slice(0, limitCount).map((e) => e.hit),
        }
      : // Nothing matched by keyword. Hand back the asker's whole readable set
        // so the assistant can answer, or state that the materials do not
        // contain the answer, instead of guessing.
        { mode: 'authorized', materials: hits.slice(0, limitCount) };
  }
}
