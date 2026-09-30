import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import {
  materialsLookupToken,
  type MaterialMatch,
} from '../../materials-service.js';

/** A material as the model receives it, including where to read it. */
interface MaterialCitation extends MaterialMatch {
  /**
   * A page-relative link. The chat is served under the same base path as the
   * materials page, so `materials?id=1` resolves to the page that can open the
   * record — the user still needs their own `view` grant to read it there.
   */
  url: string;
}

function toCitation(material: MaterialMatch): MaterialCitation {
  return { ...material, url: `materials?id=${material.id}` };
}

/**
 * Reads the materials the asking user may see, so an assistant can answer from
 * the library instead of from model memory.
 *
 * Read-only by construction: it declares no write action, and the service it
 * depends on authorizes `view` against the same composite resource the
 * materials page uses. A colleague's tool call therefore returns only public
 * materials; the confidential record is excluded in SQL before the result ever
 * reaches the model, so it cannot appear in an answer, a citation or an error.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'Search materials',
    about: 'Read the internal materials the current user is allowed to see.',
  },
  definition: {
    name: 'materials-lookup',
    description:
      'Read the internal materials the current user is allowed to see. Call with a search term to find relevant materials, or with an id to read one. Returns only materials this user may read; if the result is empty, the material library contains no supporting evidence.',
    schema: z.object({
      query: z
        .string()
        .describe('A word or phrase to search the material title and body.')
        .optional(),
      id: z
        .number()
        .int()
        .positive()
        .describe('Read one material by id instead of searching.')
        .optional(),
    }),
  },
  dependencies: { materials: materialsLookupToken },
  async invoke(ctx, args) {
    const input = z
      .object({
        query: z.string().optional(),
        id: z.number().int().positive().optional(),
      })
      .parse(args);

    const matches = await ctx.deps.materials.list(ctx.actor, input.query);
    const selected =
      input.id === undefined
        ? matches
        : matches.filter((material) => material.id === input.id);

    return {
      status: 'success',
      content: {
        query: input.query ?? null,
        materials: selected.map(toCitation),
      },
    };
  },
});
