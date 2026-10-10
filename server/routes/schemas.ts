import { z } from 'zod';

import type {
  ProjectMaterialFileView,
  ProjectMaterialView,
} from '../providers/project-materials.js';

/**
 * The schemas of the application's own project-materials API.
 *
 * The response schemas are annotated with the service's view types, so a
 * response the service stops producing fails `typecheck` instead of drifting
 * away from the API document.
 */

const MAX_TITLE_LENGTH = 255;
const MAX_FILE_IDS = 50;

export const ProjectMaterialParams = z.object({
  materialId: z.coerce
    .number()
    .int()
    .positive()
    .meta({ description: 'The material to act on.' }),
});

export const ListProjectMaterialsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const CreateProjectMaterialInput = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TITLE_LENGTH)
    .meta({ description: 'The material title.' }),
  fileIds: z.array(z.string().min(1)).max(MAX_FILE_IDS).optional().meta({
    description:
      'Ids of already-uploaded files to attach. Each file must have been uploaded by the caller.',
  }),
});

export const UpdateProjectMaterialInput = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TITLE_LENGTH)
    .meta({ description: 'The new title.' })
    .optional(),
  fileIds: z.array(z.string().min(1)).max(MAX_FILE_IDS).optional().meta({
    description:
      'The complete set of attached file ids. A file previously attached and left out is detached, not deleted.',
  }),
});

export const ProjectMaterialFileSchema: z.ZodType<ProjectMaterialFileView> = z
  .object({
    id: z.string().meta({ description: 'The file id.' }),
    disk: z
      .string()
      .meta({ description: 'The storage disk the file lives on.' }),
    key: z.string().meta({ description: 'The object key inside the disk.' }),
    filename: z.string().meta({ description: 'The uploaded file name.' }),
    ext: z
      .string()
      .meta({ description: 'The lower-case extension without the dot.' }),
    mimeType: z.string().meta({ description: 'The reported media type.' }),
    size: z.union([z.string(), z.number()]).meta({
      description: 'The size in bytes; a big integer arrives as a string.',
    }),
    createdAt: z.string().meta({ description: 'RFC 3339 creation time.' }),
    updatedAt: z.string().meta({ description: 'RFC 3339 last-update time.' }),
    contentUrl: z.string().meta({
      description:
        'The app-owned URL that serves the bytes. It requires a signed-in session and the file owner.',
    }),
  })
  .meta({ ref: 'ProjectMaterialFile' });

export const ProjectMaterialSchema: z.ZodType<ProjectMaterialView> = z
  .object({
    id: z.string().meta({ description: 'The material id.' }),
    title: z.string().meta({ description: 'The material title.' }),
    createdAt: z.string().meta({ description: 'RFC 3339 creation time.' }),
    updatedAt: z.string().meta({ description: 'RFC 3339 last-update time.' }),
    files: z
      .array(ProjectMaterialFileSchema)
      .meta({ description: 'The attachments, oldest first.' }),
  })
  .meta({ ref: 'ProjectMaterial' });
