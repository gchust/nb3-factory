import { defineTools } from '@nocobase/ai-employee';

import { MATERIALS_NAMESPACE } from '../../materials/resources.js';
import {
  materialsServiceToken,
  type MaterialsActor,
} from '../../materials/service.js';

export interface LookupMaterialsArgs {
  /** Optional case-insensitive keyword matched against title and body. */
  keywords?: string;
  /** Optional exact material id. */
  id?: number;
}

/**
 * The only tool the materials assistant has. It runs the read under the
 * caller's authorization policy, so confidential materials never reach the
 * model, the answer, a citation or an error message.
 */
export const lookupMaterialsTool = defineTools({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  i18n: { namespace: MATERIALS_NAMESPACE },
  introduction: {
    title: 'Look up internal materials',
    about:
      'Read the internal materials the current user is allowed to see, optionally narrowed by keywords or an id.',
  },
  definition: {
    name: 'lookup-materials',
    description: [
      'Read the internal knowledge materials the current user is authorized to view.',
      'Call this before answering any question about internal rules, contacts or projects.',
      'It returns only materials this user may read, with their id, title and full body.',
      'Cite the title (and include the id so the user can open it) of every material you rely on.',
      'If it returns no matching material, say the available materials are insufficient; never invent a rule or fact.',
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'string',
          description:
            'Optional keyword to search for in material titles and bodies.',
        },
        id: {
          type: 'number',
          description: 'Optional exact material id to read.',
        },
      },
      additionalProperties: false,
    },
  },
  dependencies: { materials: materialsServiceToken },
  async invoke(ctx, args: LookupMaterialsArgs) {
    const materials = ctx.deps.materials;
    const actor = ctx.actor as MaterialsActor;
    const context = await materials.contextForActor(actor);
    const policy = await materials.viewPolicy(context);

    if (policy.read === false) {
      return {
        materials: [],
        note: 'The current user has no permission to read internal materials.',
      };
    }

    if (typeof args?.id === 'number' && Number.isInteger(args.id)) {
      const material = await materials.get(context, args.id);
      return {
        materials: material ? [material] : [],
        note: material
          ? 'Found the requested material.'
          : 'No readable material has that id.',
      };
    }

    const all = await materials.list(context);
    const keywords = args?.keywords?.trim().toLowerCase();
    const matched = keywords
      ? all.filter(
          (material) =>
            material.title.toLowerCase().includes(keywords) ||
            material.content.toLowerCase().includes(keywords),
        )
      : all;

    return {
      materials: matched.map((material) => ({
        id: material.id,
        title: material.title,
        content: material.content,
        updatedAt: material.updatedAt,
      })),
      note:
        matched.length > 0
          ? 'Cite the title of every material used in the answer.'
          : 'No material matches the request. Tell the user the available materials are insufficient.',
    };
  },
});
