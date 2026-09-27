import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type {
  AuthorizationEnv,
  AuthorizationContext,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import { MeetingBookingError } from '../meeting/domain.js';
import type { MeetingBookingErrorCode } from '../meeting/domain.js';
import type { MeetingBookingService } from '../meeting/service.js';
import type { MeetingAuthorizationPolicies } from '../meeting/store.js';
import { meetingBookingServiceFactoryToken } from '../meeting/tokens.js';

type MeetingEnv = AuthEnv & AuthorizationEnv;

/**
 * The composite actions this feature exposes. They are named here rather than
 * derived from a builder so the route and the seed share one source of truth.
 */
const ROOMS_RESOURCE = 'meeting.rooms';
const BOOKINGS_RESOURCE = 'meeting.bookings';

const STATUS_BY_CODE: Readonly<
  Record<MeetingBookingErrorCode, 400 | 404 | 409>
> = {
  INVALID_ROOM: 400,
  INVALID_BOOKING: 400,
  INVALID_TIME_RANGE: 400,
  ROOM_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  ROOM_NAME_TAKEN: 409,
  ROOM_IN_USE: 409,
  BOOKING_CONFLICT: 409,
};

/** A path segment that addresses a row; anything else is simply not found. */
function parseId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

interface MeetingRequestServices {
  readonly service: MeetingBookingService;
  readonly rooms: RepositoryPolicy;
  readonly bookings: RepositoryPolicy;
}

/**
 * Authorizes the composite action and returns a service whose repositories are
 * exactly the policies that decision granted. `policyFor` folds the four CRUD
 * decisions of the same action, so a route reads the node it is about to use
 * and refuses anything else — reading is not implied by a write grant and a
 * write is not implied by a read grant.
 */
async function servicesFor(
  app: Application,
  context: {
    get: (key: 'authz') => AuthorizationContext;
  },
  resource: string,
  action: string,
): Promise<MeetingRequestServices> {
  const authorization = app.container.resolve(authorizationToken);
  const authz = context.get('authz');
  const operation = { resource, action };
  const [rooms, bookings] = await Promise.all([
    authorization.database.policyFor('meetingRooms', authz, operation),
    authorization.database.policyFor('meetingBookings', authz, operation),
  ]);
  const policies: MeetingAuthorizationPolicies = {
    meetingRooms: rooms,
    meetingBookings: bookings,
  };
  const factory = app.container.resolve(meetingBookingServiceFactoryToken);
  return { service: factory(policies), rooms, bookings };
}

/** The signed-in principal; `auth.required()` guarantees it is present. */
function ownerIdOf(context: {
  get: (key: 'auth') => AuthEnv['Variables']['auth'];
}): string | undefined {
  return context.get('auth')?.user?.id;
}

export const apiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const auth = app.container.resolve(authenticationToken);

    const rooms = new Hono<MeetingEnv>();
    rooms.use('*', auth.required());
    rooms.use('*', app.container.resolve(authorizationToken).middleware());

    const bookings = new Hono<MeetingEnv>();
    bookings.use('*', auth.required());
    bookings.use('*', app.container.resolve(authorizationToken).middleware());

    rooms.get('/', async (context) => {
      const { service, rooms: policy } = await servicesFor(
        app,
        context,
        ROOMS_RESOURCE,
        'view',
      );
      if (policy.read === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to view meeting rooms.',
          },
          403,
        );
      }
      return context.json({ data: await service.listRooms() });
    });

    rooms.post('/', async (context) => {
      const { service, rooms: policy } = await servicesFor(
        app,
        context,
        ROOMS_RESOURCE,
        'manage',
      );
      if (policy.create === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to manage meeting rooms.',
          },
          403,
        );
      }
      return context.json(
        { data: await service.createRoom(await context.req.json()) },
        201,
      );
    });

    rooms.patch('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'ROOM_NOT_FOUND', message: 'The room does not exist.' },
          404,
        );
      }
      const { service, rooms: policy } = await servicesFor(
        app,
        context,
        ROOMS_RESOURCE,
        'manage',
      );
      if (policy.update === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to manage meeting rooms.',
          },
          403,
        );
      }
      return context.json({
        data: await service.updateRoom(id, await context.req.json()),
      });
    });

    rooms.delete('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'ROOM_NOT_FOUND', message: 'The room does not exist.' },
          404,
        );
      }
      const { service, rooms: policy } = await servicesFor(
        app,
        context,
        ROOMS_RESOURCE,
        'manage',
      );
      if (policy.delete === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to manage meeting rooms.',
          },
          403,
        );
      }
      await service.deleteRoom(id);
      return context.json({ data: { id } });
    });

    bookings.get('/', async (context) => {
      const { service, bookings: policy } = await servicesFor(
        app,
        context,
        BOOKINGS_RESOURCE,
        'view',
      );
      if (policy.read === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to view meeting bookings.',
          },
          403,
        );
      }
      return context.json({ data: await service.listBookings() });
    });

    bookings.post('/', async (context) => {
      const { service, bookings: policy } = await servicesFor(
        app,
        context,
        BOOKINGS_RESOURCE,
        'book',
      );
      if (policy.create === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to book meeting rooms.',
          },
          403,
        );
      }
      const ownerId = ownerIdOf(context);
      if (!ownerId) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'A session is required.' },
          401,
        );
      }
      return context.json(
        {
          data: await service.createBooking(await context.req.json(), ownerId),
        },
        201,
      );
    });

    bookings.post('/:id/cancel', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'BOOKING_NOT_FOUND', message: 'The booking does not exist.' },
          404,
        );
      }
      const { service, bookings: policy } = await servicesFor(
        app,
        context,
        BOOKINGS_RESOURCE,
        'cancel',
      );
      if (policy.update === false) {
        return context.json(
          {
            code: 'FORBIDDEN',
            message: 'Not permitted to cancel meeting bookings.',
          },
          403,
        );
      }
      return context.json({ data: await service.cancelBooking(id) });
    });

    const router = new Hono<MeetingEnv>();
    router.onError((error, context) => {
      if (error instanceof MeetingBookingError) {
        return context.json(
          { code: error.code, message: error.message },
          STATUS_BY_CODE[error.code],
        );
      }
      if (error instanceof SyntaxError) {
        return context.json(
          { code: 'INVALID_REQUEST', message: 'The request body is not JSON.' },
          400,
        );
      }
      throw error;
    });
    router.route('/meeting-rooms', rooms);
    router.route('/meeting-bookings', bookings);
    // The contribution contract is expressed over a blank Env; the concrete
    // `auth`/`authz` variables this router reads are declared internally.
    return router as unknown as Hono;
  });
