import {
  defineCompositeResource,
  selection,
} from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';

/**
 * The knowledge assistant's authorization model, declared once and used by everything that touches a material.
 *
 * There is exactly one business operation over materials — reading one — plus the editorial operation a supervisor
 * needs. Both are composite resources so a single stored grant carries both the operation and the record scope it
 * reaches, and both compose the same database collection permission. The client materials route, the AI employee's
 * read tool and the default record scope all read this file, so a page and an answer can never disagree about which
 * materials a person may see.
 *
 * Nothing here grants access. A permission-set seed selects the concrete scopes; an administrator can change them
 * afterwards without touching this declaration.
 */

/** The logical Collection name, as declared by the migration and used by every Repository call. */
export const KNOWLEDGE_MATERIALS_COLLECTION = 'knowledgeMaterials';

/** The page grant identifiers stored for the two application pages. */
export const KNOWLEDGE_MATERIALS_PAGE = 'knowledge.materials';
export const KNOWLEDGE_ASSISTANT_PAGE = 'knowledge.assistant';

/** The composite resource key the two business operations belong to. */
export const KNOWLEDGE_MATERIALS_RESOURCE = 'knowledge.materials';

/** The one data scope of both actions: which materials of the collection the operation reaches. */
export const KNOWLEDGE_MATERIALS_SCOPE = 'materials';

/** The collection's shape, for compile-time field checks; the database's own metadata stays authoritative. */
export interface KnowledgeMaterial {
  id: string;
  title: string;
  content: string;
}

/** What a reader may receive. Every field of a material is readable. */
export const KNOWLEDGE_MATERIAL_READ_FIELDS = [
  'id',
  'title',
  'content',
] as const;

/**
 * What a supervisor may send when creating one. The identifier is created by whoever sends the record, because this
 * Collection's primary key is a plain string the database does not generate; it is listed explicitly rather than
 * relying on a wildcard, so nothing else can be written.
 */
export const KNOWLEDGE_MATERIAL_CREATE_FIELDS = [
  'id',
  'title',
  'content',
] as const;

/** What a supervisor may change afterwards. The two content items, and nothing else. */
export const KNOWLEDGE_MATERIAL_UPDATE_FIELDS = ['title', 'content'] as const;

const materialsRead = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeMaterial>(KNOWLEDGE_MATERIALS_COLLECTION)
    .read([...KNOWLEDGE_MATERIAL_READ_FIELDS]),
);

const materialsEdit = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeMaterial>(KNOWLEDGE_MATERIALS_COLLECTION)
    .read([...KNOWLEDGE_MATERIAL_READ_FIELDS])
    .create([...KNOWLEDGE_MATERIAL_CREATE_FIELDS])
    .update([...KNOWLEDGE_MATERIAL_UPDATE_FIELDS]),
);

/**
 * Reading a material and editing one, both bounded by which records the operation reaches.
 *
 * `view` is the read-only operation the colleague and the assistant use. `edit` adds creation and update, and is
 * granted only to the supervisor set. Their `materials` data scope is what the seed fills with a record selection:
 * all records for the supervisor, two named ones for the colleague.
 */
export const knowledgeMaterialsResource = defineCompositeResource(
  KNOWLEDGE_MATERIALS_RESOURCE,
  (resource) =>
    resource
      .title({ key: 'knowledge.resource.title', ns: 'nb3-factory' })
      .action('view', (action) =>
        action
          .title({ key: 'knowledge.action.view', ns: 'nb3-factory' })
          .grant(KNOWLEDGE_MATERIALS_SCOPE, materialsRead, {
            title: { key: 'knowledge.scope.materials', ns: 'nb3-factory' },
          }),
      )
      .action('edit', (action) =>
        action
          .title({ key: 'knowledge.action.edit', ns: 'nb3-factory' })
          .grant(KNOWLEDGE_MATERIALS_SCOPE, materialsEdit, {
            title: { key: 'knowledge.scope.materials', ns: 'nb3-factory' },
          }),
      ),
);

/** The reference the seed and the providers use to build and register grants. */
export function knowledgeMaterialsReference() {
  return knowledgeMaterialsResource.reference();
}

/** The record selection that reaches every material. */
export function allMaterials() {
  return selection.all();
}

/** The record selection that reaches exactly the given material identifiers. */
export function materialsById(ids: readonly string[]) {
  return selection.records(ids);
}
