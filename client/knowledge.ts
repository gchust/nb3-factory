/**
 * The stored knowledge contract, mirrored from `server/knowledge/resources.ts`.
 *
 * The browser cannot import the server module: it would pull the authorization layer and the database package into
 * the client bundle, where neither belongs. The identifiers are therefore written twice, and each file names the
 * other so a change to one is a change to the other. They must agree on what is stored, not on how it is computed:
 * a page grant records the page `id`, a data grant records the composite resource `id`, and the Repository routes
 * answer on the Collection name.
 */

/** The pages the seeded permission sets grant, and the `authz` declarations in `client/routes.ts` look up. */
export const KNOWLEDGE_MATERIALS_PAGE = 'knowledge.materials';
export const KNOWLEDGE_ASSISTANT_PAGE = 'knowledge.assistant';

/** The composite resource whose `view` and `edit` actions the materials grants are written against. */
export const KNOWLEDGE_MATERIALS_RESOURCE = 'knowledge.materials';

/** The Collection the generated Repository routes are mounted for. */
export const KNOWLEDGE_MATERIALS_COLLECTION = 'knowledgeMaterials';
