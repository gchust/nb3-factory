import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  MaterialsError,
  materialsServiceToken,
  type MaterialRecord,
} from '../providers/materials.js';
import { MATERIAL_FILES_ACCESS_PATH } from './material-files.js';
import {
  MaterialInputSchema,
  MaterialParamsSchema,
  MaterialSchema,
} from './schemas.js';

/**
 * The application's materials API: list, read, create, update and delete a material and the files it owns. Every route
 * is scoped to the signed-in user by the service, so a caller never names an owner.
 */
export const materialsRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const materials = () => app.container.resolve(materialsServiceToken);
  const present = (material: MaterialRecord) => withContentUrl(app, material);

  router.use('/materials', auth.required());
  router.use('/materials/*', auth.required());

  router.get(
    '/materials',
    describeRoute({
      tags: ['Materials'],
      summary: 'List the materials of the signed-in user',
      operationId: 'listMaterials',
      responses: {
        '200': listResponse(MaterialSchema),
        '401': apiErrorResponse(401),
        '500': apiErrorResponse(500),
      },
    }),
    async (context) => {
      const items = await run(() => materials().list(ownerId(context)));
      return context.json({ data: items.map(present) });
    },
  );

  router.post(
    '/materials',
    describeRoute({
      tags: ['Materials'],
      summary: 'Create a material',
      description:
        'Creates a material for the signed-in user from a title and the ids of files it already uploaded. Files that belong to somebody else are refused.',
      operationId: 'createMaterial',
      responses: {
        '200': dataResponse(MaterialSchema),
        '400': apiErrorResponse(400),
        '401': apiErrorResponse(401),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('json', MaterialInputSchema),
    async (context) => {
      const input = context.req.valid('json');
      const material = await run(() =>
        materials().create(ownerId(context), {
          title: input.title,
          fileIds: input.fileIds,
        }),
      );
      return context.json({ data: present(material) });
    },
  );

  router.get(
    '/materials/:materialId',
    describeRoute({
      tags: ['Materials'],
      summary: 'Read one material',
      operationId: 'getMaterial',
      responses: {
        '200': dataResponse(MaterialSchema),
        '401': apiErrorResponse(401),
        '404': apiErrorResponse(404),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('param', MaterialParamsSchema),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const material = await run(() =>
        materials().get(ownerId(context), materialId),
      );
      return context.json({ data: present(material) });
    },
  );

  router.patch(
    '/materials/:materialId',
    describeRoute({
      tags: ['Materials'],
      summary: 'Update a material',
      description:
        'Replaces the title and the set of attached files. A file that was attached and is left out is detached.',
      operationId: 'updateMaterial',
      responses: {
        '200': dataResponse(MaterialSchema),
        '400': apiErrorResponse(400),
        '401': apiErrorResponse(401),
        '404': apiErrorResponse(404),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('param', MaterialParamsSchema),
    apiValidator('json', MaterialInputSchema),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const input = context.req.valid('json');
      const material = await run(() =>
        materials().update(ownerId(context), materialId, {
          title: input.title,
          fileIds: input.fileIds,
        }),
      );
      return context.json({ data: present(material) });
    },
  );

  router.delete(
    '/materials/:materialId',
    describeRoute({
      tags: ['Materials'],
      summary: 'Delete a material',
      description:
        'Detaches every file first, so a deleted material leaves no attachment behind.',
      operationId: 'deleteMaterial',
      responses: {
        '204': emptyResponse('The material was deleted.'),
        '401': apiErrorResponse(401),
        '404': apiErrorResponse(404),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('param', MaterialParamsSchema),
    async (context) => {
      const { materialId } = context.req.valid('param');
      await run(() => materials().remove(ownerId(context), materialId));
      return context.body(null, 204);
    },
  );

  return router;
});

/** The signed-in user, which every route above reaches only behind `auth.required()`. */
function ownerId(context: Context): string {
  return (context as Context<AuthEnv>).get('auth')!.user.id;
}

/** Runs a service call, turning a domain failure into the HTTP error the API documents. */
async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toApiError(error);
  }
}

function toApiError(error: unknown): unknown {
  if (!(error instanceof MaterialsError)) return error;
  if (error.code === 'MATERIAL_NOT_FOUND') {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'MATERIAL_NOT_FOUND',
      domain: 'materials',
      message: error.message,
    });
  }
  if (error.code === 'FILE_NOT_OWNED') {
    return new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: 'FILE_NOT_OWNED',
      domain: 'materials',
      message: error.message,
    });
  }
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'INVALID_TITLE',
    domain: 'materials',
    message: error.message,
  });
}

/** Adds the absolute content URL of every attachment, which is what the client opens. */
function withContentUrl(app: Application, material: MaterialRecord) {
  const base = (app.publicBasePath ?? '').replace(/\/$/, '');
  return {
    ...material,
    files: material.files.map((file) => ({
      ...file,
      contentUrl: `${base}${MATERIAL_FILES_ACCESS_PATH}/${encodeURIComponent(file.id)}${
        file.ext ? `.${encodeURIComponent(file.ext)}` : ''
      }`,
    })),
  };
}
