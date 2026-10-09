import { z } from 'zod';

import type {
  ProjectMaterialFileView,
  ProjectMaterialView,
} from '../providers/project-materials.js';

/**
 * One attachment as the material endpoints return it. `contentUrl` is derived from the file's id and extension and
 * already carries the application's public base path, so the browser can use it in an `img` or a download link as it
 * is. The shape is tied to what the service returns, so the documented response cannot drift from the real one.
 */
export const ProjectMaterialFileSchema: z.ZodType<ProjectMaterialFileView> = z
  .object({
    id: z.string(),
    filename: z.string(),
    ext: z.string(),
    mimeType: z.string(),
    size: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    contentUrl: z.string(),
  })
  .meta({ ref: 'ProjectMaterialFile' });

/** A material with the attachments currently linked to it. */
export const ProjectMaterialSchema: z.ZodType<ProjectMaterialView> = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    files: z.array(ProjectMaterialFileSchema),
  })
  .meta({ ref: 'ProjectMaterial' });

export const ProjectMaterialParams = z.object({
  materialId: z.string().min(1),
});

/** `page` and `pageSize` arrive as strings; a list of the caller's own materials is small, so the cap is 100. */
export const ListProjectMaterialsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** The list envelope's `meta`, matching what the handler returns. */
export const ProjectMaterialListMeta = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

/**
 * A strict body so a misspelled field is rejected rather than ignored. `fileIds` is the complete set of attachments
 * the material should carry, in display order: they have already been uploaded, and saving links them. Omitting it on
 * update leaves the set unchanged.
 */
export const CreateProjectMaterialInput = z.strictObject({
  title: z
    .string()
    .min(1)
    .max(200)
    .meta({ description: 'The material title. Required.' }),
  description: z.string().max(2000).nullable().optional(),
  fileIds: z.array(z.string().min(1)).max(50).optional(),
});

export const UpdateProjectMaterialInput = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  fileIds: z.array(z.string().min(1)).max(50).optional(),
});
