import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';

import {
  equipmentInspectionServiceToken,
  EquipmentInspectionError,
  FILE_ACCESS_PATHS,
  type EquipmentRecord,
  type EquipmentSummary,
  type EquipmentWrite,
  type FileRow,
  type InspectionRecord,
  type InspectionWrite,
} from '../providers/equipment-inspection.js';

type FileDto = FileRow & { contentUrl?: string };

const contentUrlOf = (
  publicBasePath: string,
  accessPath: string,
  record: { id: string; ext: string },
): string =>
  `${publicBasePath}${accessPath}/${record.id}${record.ext ? `.${record.ext}` : ''}`;

const decorateFile = (
  publicBasePath: string,
  accessPath: string,
  record: FileRow | undefined,
): FileDto | undefined =>
  record
    ? {
        ...record,
        contentUrl: contentUrlOf(publicBasePath, accessPath, record),
      }
    : undefined;

const decorateFiles = (
  publicBasePath: string,
  accessPath: string,
  records: readonly FileRow[],
): FileDto[] =>
  records.map((record) => decorateFile(publicBasePath, accessPath, record)!);

const decorateEquipmentSummary = (
  app: Application,
  summary: EquipmentSummary,
): EquipmentSummary & { mainImage?: FileDto } => ({
  ...summary,
  mainImage: decorateFile(
    app.publicBasePath ?? '',
    FILE_ACCESS_PATHS.mainImage,
    summary.mainImage,
  ),
});

const decorateEquipmentRecord = (
  app: Application,
  record: EquipmentRecord,
): EquipmentRecord & { mainImage?: FileDto; documents: FileDto[] } => ({
  ...decorateEquipmentSummary(app, record),
  documents: decorateFiles(
    app.publicBasePath ?? '',
    FILE_ACCESS_PATHS.document,
    record.documents,
  ),
  inspections: record.inspections.map((inspection) =>
    decorateInspection(app, inspection),
  ),
});

const decorateInspection = (
  app: Application,
  inspection: InspectionRecord,
): InspectionRecord & { photos: FileDto[] } => ({
  ...inspection,
  photos: decorateFiles(
    app.publicBasePath ?? '',
    FILE_ACCESS_PATHS.photo,
    inspection.photos,
  ),
});

const parseId = (value: string): number | undefined => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

const jsonBody = async <T>(context: {
  req: { json: () => Promise<T> };
}): Promise<T> => context.req.json();

export const equipmentInspectionApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(equipmentInspectionServiceToken);
    router.onError((error, context) => {
      if (error instanceof EquipmentInspectionError) {
        const status =
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'DEVICE_NO_TAKEN'
              ? 409
              : error.code.startsWith('INVALID_')
                ? 400
                : 500;
        return context.json(
          { code: error.code, message: error.message },
          status,
        );
      }
      throw error;
    });

    // Guard only the equipment/inspection actions this router owns. Because
    // the contribution is flattened onto the shared application router at
    // /api, a bare `use('*', ...)` would intercept every /api route —
    // including the public sign-in API — and reject it with 401.
    router.use('/equipment', auth.required());
    router.use('/equipment/*', auth.required());
    router.use('/inspections', auth.required());
    router.use('/inspections/*', auth.required());

    // ----- equipment list -----
    router.get('/equipment', async (context) => {
      const rows = await service.listEquipment();
      return context.json({
        data: rows.map((row) => decorateEquipmentSummary(app, row)),
      });
    });

    // ----- equipment create -----
    router.post('/equipment', async (context) => {
      const input = (await jsonBody<EquipmentWrite>(context)) ?? {};
      const record = await service.createEquipment({
        deviceNo: String(input.deviceNo ?? ''),
        name: String(input.name ?? ''),
        location: String(input.location ?? ''),
        status: String(input.status ?? ''),
        owner: input.owner ?? null,
        remark: input.remark ?? null,
        mainImageId: input.mainImageId,
        documentIds: input.documentIds,
      });
      return context.json({ data: decorateEquipmentRecord(app, record) }, 201);
    });

    // ----- equipment detail -----
    router.get('/equipment/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid equipment id.' },
          400,
        );
      }
      const record = await service.getEquipment(id);
      if (!record) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Equipment not found.' },
          404,
        );
      }
      return context.json({ data: decorateEquipmentRecord(app, record) });
    });

    // ----- equipment update -----
    router.put('/equipment/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid equipment id.' },
          400,
        );
      }
      const input = (await jsonBody<EquipmentWrite>(context)) ?? {};
      const record = await service.updateEquipment(id, {
        deviceNo: String(input.deviceNo ?? ''),
        name: String(input.name ?? ''),
        location: String(input.location ?? ''),
        status: String(input.status ?? ''),
        owner: input.owner ?? null,
        remark: input.remark ?? null,
        mainImageId: input.mainImageId,
        documentIds: input.documentIds,
      });
      return context.json({ data: decorateEquipmentRecord(app, record) });
    });

    // ----- equipment delete -----
    router.delete('/equipment/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid equipment id.' },
          400,
        );
      }
      await service.deleteEquipment(id);
      return context.json({ data: { id } });
    });

    // ----- inspection create -----
    router.post('/inspections', async (context) => {
      const input = (await jsonBody<InspectionWrite>(context)) ?? {};
      const equipmentId =
        typeof input.equipmentId === 'number'
          ? input.equipmentId
          : Number(input.equipmentId);
      const record = await service.createInspection({
        equipmentId,
        inspectedAt: String(input.inspectedAt ?? ''),
        inspector: String(input.inspector ?? ''),
        conclusion: String(input.conclusion ?? ''),
        photoIds: input.photoIds,
      });
      return context.json({ data: decorateInspection(app, record) }, 201);
    });

    // ----- inspection detail (edit backfill) -----
    router.get('/inspections/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid inspection id.' },
          400,
        );
      }
      const record = await service.getInspection(id);
      if (!record) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Inspection not found.' },
          404,
        );
      }
      return context.json({ data: decorateInspection(app, record) });
    });

    // ----- inspection update -----
    router.put('/inspections/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid inspection id.' },
          400,
        );
      }
      const input = (await jsonBody<InspectionWrite>(context)) ?? {};
      const equipmentId =
        typeof input.equipmentId === 'number'
          ? input.equipmentId
          : Number(input.equipmentId);
      const record = await service.updateInspection(id, {
        equipmentId,
        inspectedAt: String(input.inspectedAt ?? ''),
        inspector: String(input.inspector ?? ''),
        conclusion: String(input.conclusion ?? ''),
        photoIds: input.photoIds,
      });
      return context.json({ data: decorateInspection(app, record) });
    });

    // ----- inspection delete -----
    router.delete('/inspections/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid inspection id.' },
          400,
        );
      }
      await service.deleteInspection(id);
      return context.json({ data: { id } });
    });

    return router;
  });
