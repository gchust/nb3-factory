import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  meetingRoomServiceToken,
  MeetingRoomServiceError,
  type MeetingRoomInput,
} from '../providers/index.js';

function parseRoomInput(value: unknown): MeetingRoomInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const location =
    typeof record.location === 'string' ? record.location.trim() : '';
  const capacity = Number(record.capacity);
  const available =
    typeof record.available === 'boolean' ? record.available : true;
  const equipment =
    typeof record.equipment === 'string' ? record.equipment.trim() : '';

  if (!code || !name || !location) {
    return undefined;
  }
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return undefined;
  }

  return {
    code,
    name,
    location,
    capacity,
    equipment: equipment || null,
    available,
  };
}

export const meetingRoomApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const rooms = app.container.resolve(meetingRoomServiceToken);

    router.use('/meeting-rooms', auth.required());

    router.get('/meeting-rooms', async (context) =>
      context.json({ data: await rooms.list() }),
    );

    router.get('/meeting-rooms/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id)) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid meeting room id.' },
          400,
        );
      }
      const room = await rooms.get(id);
      if (!room) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Meeting room not found.' },
          404,
        );
      }
      return context.json({ data: room });
    });

    router.post('/meeting-rooms', async (context) => {
      const body = (await context.req.json().catch(() => null)) as unknown;
      const input = parseRoomInput(body);
      if (!input) {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message:
              'code, name, location and a positive integer capacity are required.',
          },
          400,
        );
      }

      try {
        const room = await rooms.create(input);
        return context.json({ data: room }, 201);
      } catch (error) {
        if (error instanceof MeetingRoomServiceError) {
          return context.json(
            { code: error.code, message: error.message },
            error.code === 'CODE_TAKEN' ? 409 : 400,
          );
        }
        throw error;
      }
    });

    router.put('/meeting-rooms/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id)) {
        return context.json(
          { code: 'INVALID_ID', message: 'Invalid meeting room id.' },
          400,
        );
      }
      const body = (await context.req.json().catch(() => null)) as unknown;
      const input = parseRoomInput(body);
      if (!input) {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message:
              'code, name, location and a positive integer capacity are required.',
          },
          400,
        );
      }

      try {
        const room = await rooms.update(id, input);
        if (!room) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Meeting room not found.' },
            404,
          );
        }
        return context.json({ data: room });
      } catch (error) {
        if (error instanceof MeetingRoomServiceError) {
          return context.json(
            { code: error.code, message: error.message },
            error.code === 'CODE_TAKEN' ? 409 : 400,
          );
        }
        throw error;
      }
    });

    return router;
  });
