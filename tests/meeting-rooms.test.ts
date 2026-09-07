import { describe, expect, it } from 'vitest';

import {
  authGet,
  createTestApp,
  jsonRequest,
  seedRooms,
  type TestApp,
} from './helpers/meeting-test.js';

describe('meeting room API', () => {
  let app: TestApp;

  it('rejects anonymous requests with 401', async () => {
    app = await createTestApp();
    try {
      const response = await app.roomRouter.request('/meeting-rooms');
      expect(response.status).toBe(401);
    } finally {
      await app.disconnect();
    }
  });

  it('creates, lists, gets and updates a room', async () => {
    app = await createTestApp();
    try {
      const createResponse = await app.roomRouter.request(
        '/meeting-rooms',
        jsonRequest('POST', {
          code: 'R-001',
          name: 'Test Room',
          location: 'Floor 1',
          capacity: 10,
          equipment: 'projector',
          available: true,
        }),
      );
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as {
        data: { id: number; code: string };
      };
      expect(created.data.code).toBe('R-001');

      const listResponse = await app.roomRouter.request(
        '/meeting-rooms',
        authGet(),
      );
      expect(listResponse.status).toBe(200);
      const list = (await listResponse.json()) as {
        data: Array<{ id: number }>;
      };
      expect(list.data).toHaveLength(1);

      const getResponse = await app.roomRouter.request(
        `/meeting-rooms/${created.data.id}`,
        authGet(),
      );
      expect(getResponse.status).toBe(200);
      const got = (await getResponse.json()) as { data: { name: string } };
      expect(got.data.name).toBe('Test Room');

      const updateResponse = await app.roomRouter.request(
        `/meeting-rooms/${created.data.id}`,
        jsonRequest('PUT', {
          code: 'R-001',
          name: 'Renamed Room',
          location: 'Floor 2',
          capacity: 20,
          equipment: 'projector, whiteboard',
          available: false,
        }),
      );
      expect(updateResponse.status).toBe(200);
      const updated = (await updateResponse.json()) as {
        data: { name: string; capacity: number; available: boolean };
      };
      expect(updated.data.name).toBe('Renamed Room');
      expect(updated.data.capacity).toBe(20);
      expect(updated.data.available).toBe(false);
    } finally {
      await app.disconnect();
    }
  });

  it('rejects a duplicate room code with 409', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const response = await app.roomRouter.request(
        '/meeting-rooms',
        jsonRequest('POST', {
          code: 'R-101',
          name: 'Duplicate',
          location: 'Floor 1',
          capacity: 5,
          available: true,
        }),
      );
      expect(response.status).toBe(409);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('CODE_TAKEN');
    } finally {
      await app.disconnect();
    }
  });

  it('rejects invalid input with 400', async () => {
    app = await createTestApp();
    try {
      const response = await app.roomRouter.request(
        '/meeting-rooms',
        jsonRequest('POST', {
          code: 'R-002',
          name: 'No Capacity',
          location: 'Floor 1',
          available: true,
        }),
      );
      expect(response.status).toBe(400);
    } finally {
      await app.disconnect();
    }
  });

  it('returns 404 for a missing room', async () => {
    app = await createTestApp();
    try {
      const response = await app.roomRouter.request(
        '/meeting-rooms/9999',
        authGet(),
      );
      expect(response.status).toBe(404);
    } finally {
      await app.disconnect();
    }
  });
});
