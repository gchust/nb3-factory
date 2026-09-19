import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  RentalError,
  rentalServiceToken,
  type Actor,
  type BookingFilters,
  type RentalService,
} from '../providers/rental-service.js';
import { resolveRentalRole } from '../providers/rental-access.js';
import {
  rentalFileContentUrl,
  type AttachmentRecord,
} from '../providers/rental-files.js';

export const rentalsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.has(authorizationToken)
      ? app.container.resolve<AppAuthorization>(authorizationToken)
      : undefined;
    const service = app.container.resolve<RentalService>(rentalServiceToken);

    const rentals = new Hono<AuthEnv>();
    rentals.use('*', auth.required());
    rentals.onError((error, context) => {
      if (error instanceof RentalError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as ContentfulStatusCode,
        );
      }
      throw error;
    });

    const actor = async (context: Context<AuthEnv>): Promise<Actor> => {
      const session = context.get('auth');
      if (!session) {
        throw new RentalError('UNAUTHORIZED', 'Authentication required.', 401);
      }
      return {
        userId: session.user.id,
        role: await resolveRentalRole(authorization, session.user.id),
      };
    };

    const withContentUrl = (
      records: readonly AttachmentRecord[],
    ): readonly (AttachmentRecord & { readonly contentUrl: string })[] =>
      records.map((record) => ({
        ...record,
        contentUrl: rentalFileContentUrl(app.publicBasePath ?? '', {
          id: record.fileId,
          ext: record.ext,
        }),
      }));

    rentals.get('/venues', async (context) =>
      context.json({
        data: await service.listVenues({
          search: context.req.query('search') || undefined,
          status: context.req.query('status') || undefined,
        }),
      }),
    );

    // Lets the interface show manager-only actions without guessing at roles.
    rentals.get('/me', async (context) => {
      const current = await actor(context);
      return context.json({
        data: { userId: current.userId, role: current.role },
      });
    });

    rentals.get('/tenants', async (context) =>
      context.json({
        data: await service.listTenants({
          search: context.req.query('search') || undefined,
        }),
      }),
    );

    rentals.get('/bookings', async (context) =>
      context.json({
        data: await service.listBookings(
          await actor(context),
          bookingFilters(context),
        ),
      }),
    );

    rentals.get('/bookings/:id', async (context) => {
      const booking = await service.getBooking(
        await actor(context),
        parseId(context.req.param('id')),
      );
      if (!booking) throw notFound(context.req.param('id'));
      return context.json({ data: booking });
    });

    rentals.post('/bookings', async (context) => {
      const body = await readJson(context);
      const created = await service.createBooking(await actor(context), {
        venueId: body.venueId as number,
        tenantId: body.tenantId as number,
        title: body.title as string,
        startAt: body.startAt as string,
        endAt: body.endAt as string,
        fee: body.fee as number | undefined,
        ownerId: body.ownerId as string | undefined,
        note: body.note as string | undefined,
      });
      return context.json({ data: created }, 201);
    });

    rentals.post('/bookings/:id/confirm', async (context) =>
      context.json({
        data: await service.confirmBooking(
          await actor(context),
          parseId(context.req.param('id')),
        ),
      }),
    );

    rentals.post('/bookings/:id/deliver', async (context) => {
      const body = await readJson(context);
      return context.json({
        data: await service.deliverBooking(
          await actor(context),
          parseId(context.req.param('id')),
          { condition: body.condition as string },
        ),
      });
    });

    rentals.post('/bookings/:id/return', async (context) => {
      const body = await readJson(context);
      return context.json({
        data: await service.returnBooking(
          await actor(context),
          parseId(context.req.param('id')),
          {
            condition: body.condition as string,
            damageNote: body.damageNote as string | undefined,
            damageFee: body.damageFee as number | undefined,
          },
        ),
      });
    });

    rentals.post('/bookings/:id/settle', async (context) =>
      context.json({
        data: await service.settleBooking(
          await actor(context),
          parseId(context.req.param('id')),
        ),
      }),
    );

    rentals.post('/bookings/:id/cancel', async (context) => {
      const body = await readJson(context);
      return context.json({
        data: await service.cancelBooking(
          await actor(context),
          parseId(context.req.param('id')),
          { reason: body.reason as string | undefined },
        ),
      });
    });

    rentals.post('/bookings/:id/owner', async (context) => {
      const body = await readJson(context);
      return context.json({
        data: await service.reassignOwner(
          await actor(context),
          parseId(context.req.param('id')),
          body.ownerId as string,
        ),
      });
    });

    // Attachments are linked after the file bytes are uploaded, so these
    // routes only carry metadata and enforce the rental's own access rules.
    rentals.get('/bookings/:id/attachments', async (context) =>
      context.json({
        data: withContentUrl(
          await service.listBookingAttachments(
            await actor(context),
            parseId(context.req.param('id')),
          ),
        ),
      }),
    );

    rentals.post('/bookings/:id/attachments', async (context) => {
      const body = await readJson(context);
      return context.json(
        {
          data: withContentUrl(
            await service.addBookingAttachments(
              await actor(context),
              parseId(context.req.param('id')),
              body.kind,
              body.fileIds,
            ),
          ),
        },
        201,
      );
    });

    rentals.delete('/bookings/:id/attachments/:attachmentId', async (context) =>
      context.json({
        data: withContentUrl(
          await service.removeBookingAttachment(
            await actor(context),
            parseId(context.req.param('id')),
            parseId(context.req.param('attachmentId')),
          ),
        ),
      }),
    );

    // Covers and gallery sizes for every venue, so the venue list needs one
    // request rather than one per row.
    rentals.get('/venue-media', async (context) => {
      const summaries = await service.listVenueMedia();
      return context.json({
        data: summaries.map((summary) => ({
          venueId: summary.venueId,
          gallery: summary.gallery,
          cover: summary.cover ? withContentUrl([summary.cover])[0] : null,
        })),
      });
    });

    rentals.get('/venues/:id/attachments', async (context) =>
      context.json({
        data: withContentUrl(
          await service.listVenueAttachments(
            await actor(context),
            parseId(context.req.param('id')),
          ),
        ),
      }),
    );

    rentals.post('/venues/:id/attachments', async (context) => {
      const body = await readJson(context);
      return context.json(
        {
          data: withContentUrl(
            await service.addVenueAttachments(
              await actor(context),
              parseId(context.req.param('id')),
              body.kind,
              body.fileIds,
            ),
          ),
        },
        201,
      );
    });

    rentals.delete('/venues/:id/attachments/:attachmentId', async (context) =>
      context.json({
        data: withContentUrl(
          await service.removeVenueAttachment(
            await actor(context),
            parseId(context.req.param('id')),
            parseId(context.req.param('attachmentId')),
          ),
        ),
      }),
    );

    rentals.get('/owners', async (context) => {
      const current = await actor(context);
      if (current.role !== 'manager') {
        throw new RentalError(
          'FORBIDDEN',
          'Only a manager may list owners.',
          403,
        );
      }
      return context.json({ data: await service.listOwners() });
    });

    rentals.get('/summary', async (context) => {
      const now = new Date();
      const from = parseOptionalDate(context.req.query('from')) ?? now;
      const to =
        parseOptionalDate(context.req.query('to')) ??
        new Date(from.getTime() + 30 * 86400000);
      return context.json({
        data: await service.summary(await actor(context), from, to),
      });
    });

    router.route('/rentals', rentals);
    return router;
  });

function bookingFilters(context: Context<AuthEnv>): BookingFilters {
  const venueId = Number(context.req.query('venueId'));
  const filters: BookingFilters = {
    status: context.req.query('status') || undefined,
    ownerId: context.req.query('ownerId') || undefined,
    search: context.req.query('search') || undefined,
    venueId: Number.isInteger(venueId) && venueId > 0 ? venueId : undefined,
    from: parseOptionalDate(context.req.query('from')),
    to: parseOptionalDate(context.req.query('to')),
  };
  return filters;
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RentalError('VALIDATION_FAILED', `${value} is not a date.`, 400);
  }
  return date;
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new RentalError('VALIDATION_FAILED', 'Invalid booking id.', 400);
  }
  return id;
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function notFound(value: string | undefined): RentalError {
  return new RentalError('NOT_FOUND', `Booking ${value} does not exist.`, 404);
}
