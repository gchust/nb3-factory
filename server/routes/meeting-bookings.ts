import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  meetingBookingServiceToken,
  MeetingBookingServiceError,
  type MeetingBookingInput,
} from '../providers/index.js';

function parseBookingInput(value: unknown): MeetingBookingInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const organizer =
    typeof record.organizer === 'string' ? record.organizer.trim() : '';
  const roomId = Number(record.roomId);
  const startTime =
    typeof record.startTime === 'string'
      ? new Date(record.startTime)
      : new Date('');
  const endTime =
    typeof record.endTime === 'string'
      ? new Date(record.endTime)
      : new Date('');
  const notes = typeof record.notes === 'string' ? record.notes.trim() : '';

  if (!title || !organizer) {
    return undefined;
  }
  if (!Number.isInteger(roomId) || roomId <= 0) {
    return undefined;
  }
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return undefined;
  }

  return {
    title,
    organizer,
    roomId,
    startTime,
    endTime,
    notes: notes || null,
  };
}

function parseListQuery(value: Record<string, string | undefined>): {
  roomId?: number;
  date?: string;
  search?: string;
} {
  const roomId = value.roomId !== undefined ? Number(value.roomId) : undefined;
  const date = value.date;
  const search = value.search?.trim();

  return {
    roomId:
      roomId !== undefined && Number.isInteger(roomId) ? roomId : undefined,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    search: search || undefined,
  };
}

export const meetingBookingApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const bookings = app.container.resolve(meetingBookingServiceToken);

    router.use('/meeting-bookings', auth.required());

    router.get('/meeting-bookings', async (context) => {
      const query = context.req.query();
      const filters = parseListQuery(query);
      return context.json({ data: await bookings.list(filters) });
    });

    router.get('/meeting-bookings/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id)) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid booking id.' },
          400,
        );
      }
      const booking = await bookings.get(id);
      if (!booking) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Booking not found.' },
          404,
        );
      }
      return context.json({ data: booking });
    });

    router.post('/meeting-bookings', async (context) => {
      const body = (await context.req.json().catch(() => null)) as unknown;
      const input = parseBookingInput(body);
      if (!input) {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message:
              'title, organizer, roomId and valid startTime/endTime are required.',
          },
          400,
        );
      }

      try {
        const booking = await bookings.create(input);
        return context.json({ data: booking }, 201);
      } catch (error) {
        if (error instanceof MeetingBookingServiceError) {
          const status =
            error.code === 'TIME_CONFLICT' || error.code === 'ROOM_UNAVAILABLE'
              ? 409
              : error.code === 'ROOM_NOT_FOUND'
                ? 404
                : 400;
          return context.json(
            { code: error.code, message: error.message },
            status,
          );
        }
        throw error;
      }
    });

    router.post('/meeting-bookings/:id/cancel', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id)) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid booking id.' },
          400,
        );
      }
      const booking = await bookings.cancel(id);
      if (!booking) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Booking not found.' },
          404,
        );
      }
      return context.json({ data: booking });
    });

    return router;
  });
