import { z } from 'zod';

import type { MaterialView } from '../materials/read.js';

// Typed against `MaterialView`, so the documented response cannot drift from
// what the handler returns without failing typecheck.
export const MaterialSchema: z.ZodType<MaterialView> = z
  .object({
    id: z.string().meta({ description: 'The material id.' }),
    title: z.string().meta({ description: 'The material title.' }),
    body: z.string().meta({ description: 'The material body.' }),
    confidential: z.boolean().meta({
      description: 'Whether the material is restricted to supervisors.',
    }),
  })
  .meta({ ref: 'Material' });

export const ListMaterialsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  q: z.string().optional().meta({
    description: 'Case-insensitive keywords matched in title and body.',
  }),
});

export const GetMaterialQuery = z.object({
  id: z.string().optional().meta({ description: 'The material id to read.' }),
  filter: z.string().optional().meta({
    description:
      'A JSON object selecting the material, accepting id, title or confidential.',
  }),
});

/** The validated query `GET /materials` and `GET /materials:list` hand to their handler. */
export type ListMaterialsQueryInput = z.output<typeof ListMaterialsQuery>;

/** The validated query `GET /materials:get` hands to its handler. */
export type GetMaterialQueryInput = z.output<typeof GetMaterialQuery>;
