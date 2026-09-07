import { describe, expect, it } from 'vitest';

import {
  authGet,
  authRequest,
  createTestApp,
  jsonRequest,
  roomIdByCode,
  seedRooms,
  type TestApp,
} from './helpers/meeting-test.js';

interface BookingBody {
  data: {
    id: number;
    title: string;
    roomId: number;
    organizer: string;
    startTime: string;
    endTime: string;
    status: string;
    roomName: string;
    roomCode: string;
  };
}

interface ErrorBody {
  code: string;
  message: string;
}

function at(hour: number, minute = 0): string {
  return new Date(
    `2026-09-08T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
  ).toISOString();
}

describe('meeting booking API', () => {
  let app: TestApp;

  it('rejects anonymous requests with 401', async () => {
    app = await createTestApp();
    try {
      const response = await app.bookingRouter.request('/meeting-bookings');
      expect(response.status).toBe(401);
    } finally {
      await app.disconnect();
    }
  });

  it('creates a booking and lists it with room details', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomId = await roomIdByCode(app.database, 'R-101');

      const createResponse = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '项目周会',
          roomId,
          organizer: '张三',
          startTime: at(9),
          endTime: at(10),
          notes: '讨论进度',
        }),
      );
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as BookingBody;
      expect(created.data.status).toBe('booked');
      expect(created.data.roomCode).toBe('R-101');
      expect(created.data.roomName).toBe('会议室A');

      const listResponse = await app.bookingRouter.request(
        '/meeting-bookings',
        authGet(),
      );
      expect(listResponse.status).toBe(200);
      const list = (await listResponse.json()) as {
        data: BookingBody['data'][];
      };
      expect(list.data).toHaveLength(1);
      expect(list.data[0]?.title).toBe('项目周会');
    } finally {
      await app.disconnect();
    }
  });

  it('rejects a booking whose end time is not after its start time', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomId = await roomIdByCode(app.database, 'R-101');

      const response = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '无效预约',
          roomId,
          organizer: '张三',
          startTime: at(10),
          endTime: at(10),
        }),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(body.code).toBe('INVALID_TIME_RANGE');
    } finally {
      await app.disconnect();
    }
  });

  it('rejects an overlapping booking with 409', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomId = await roomIdByCode(app.database, 'R-101');

      const first = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '第一场',
          roomId,
          organizer: '张三',
          startTime: at(9),
          endTime: at(11),
        }),
      );
      expect(first.status).toBe(201);

      const overlap = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '冲突场次',
          roomId,
          organizer: '李四',
          startTime: at(10, 30),
          endTime: at(12),
        }),
      );
      expect(overlap.status).toBe(409);
      const body = (await overlap.json()) as ErrorBody;
      expect(body.code).toBe('TIME_CONFLICT');
    } finally {
      await app.disconnect();
    }
  });

  it('allows back-to-back (adjacent) bookings', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomId = await roomIdByCode(app.database, 'R-101');

      const first = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '上午场',
          roomId,
          organizer: '张三',
          startTime: at(9),
          endTime: at(10),
        }),
      );
      expect(first.status).toBe(201);

      const adjacent = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '下午场',
          roomId,
          organizer: '李四',
          startTime: at(10),
          endTime: at(11),
        }),
      );
      expect(adjacent.status).toBe(201);
    } finally {
      await app.disconnect();
    }
  });

  it('rejects booking an unavailable room', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomId = await roomIdByCode(app.database, 'R-201');

      const response = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '不可用房间',
          roomId,
          organizer: '张三',
          startTime: at(9),
          endTime: at(10),
        }),
      );
      expect(response.status).toBe(409);
      const body = (await response.json()) as ErrorBody;
      expect(body.code).toBe('ROOM_UNAVAILABLE');
    } finally {
      await app.disconnect();
    }
  });

  it('rejects booking a missing room with 404', async () => {
    app = await createTestApp();
    try {
      const response = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '不存在房间',
          roomId: 9999,
          organizer: '张三',
          startTime: at(9),
          endTime: at(10),
        }),
      );
      expect(response.status).toBe(404);
      const body = (await response.json()) as ErrorBody;
      expect(body.code).toBe('ROOM_NOT_FOUND');
    } finally {
      await app.disconnect();
    }
  });

  it('filters by room, date and search term', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomA = await roomIdByCode(app.database, 'R-101');
      const roomB = await roomIdByCode(app.database, 'R-102');

      await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '产品评审',
          roomId: roomA,
          organizer: '张三',
          startTime: at(9),
          endTime: at(10),
        }),
      );
      await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '技术分享',
          roomId: roomB,
          organizer: '李四',
          startTime: at(14),
          endTime: at(15),
        }),
      );

      const byRoom = await app.bookingRouter.request(
        `/meeting-bookings?roomId=${roomA}`,
        authGet(),
      );
      const roomList = (await byRoom.json()) as { data: BookingBody['data'][] };
      expect(roomList.data).toHaveLength(1);
      expect(roomList.data[0]?.title).toBe('产品评审');

      const byDate = await app.bookingRouter.request(
        '/meeting-bookings?date=2026-09-08',
        authGet(),
      );
      const dateList = (await byDate.json()) as { data: BookingBody['data'][] };
      expect(dateList.data).toHaveLength(2);

      const bySearch = await app.bookingRouter.request(
        '/meeting-bookings?search=技术',
        authGet(),
      );
      const searchList = (await bySearch.json()) as {
        data: BookingBody['data'][];
      };
      expect(searchList.data).toHaveLength(1);
      expect(searchList.data[0]?.title).toBe('技术分享');
    } finally {
      await app.disconnect();
    }
  });

  it('cancels a booking, keeps the record and releases the slot', async () => {
    app = await createTestApp();
    try {
      await seedRooms(app.database);
      const roomId = await roomIdByCode(app.database, 'R-101');

      const createResponse = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '待取消预约',
          roomId,
          organizer: '张三',
          startTime: at(9),
          endTime: at(10),
        }),
      );
      const created = (await createResponse.json()) as BookingBody;

      const cancelResponse = await app.bookingRouter.request(
        `/meeting-bookings/${created.data.id}/cancel`,
        authRequest('POST'),
      );
      expect(cancelResponse.status).toBe(200);
      const cancelled = (await cancelResponse.json()) as BookingBody;
      expect(cancelled.data.status).toBe('cancelled');

      // The record is kept and still visible.
      const getResponse = await app.bookingRouter.request(
        `/meeting-bookings/${created.data.id}`,
        authGet(),
      );
      expect(getResponse.status).toBe(200);
      const got = (await getResponse.json()) as BookingBody;
      expect(got.data.status).toBe('cancelled');

      // The slot is released: the same time can be booked again.
      const rebook = await app.bookingRouter.request(
        '/meeting-bookings',
        jsonRequest('POST', {
          title: '重新预约',
          roomId,
          organizer: '李四',
          startTime: at(9),
          endTime: at(10),
        }),
      );
      expect(rebook.status).toBe(201);
    } finally {
      await app.disconnect();
    }
  });

  it('returns 404 when cancelling a missing booking', async () => {
    app = await createTestApp();
    try {
      const response = await app.bookingRouter.request(
        '/meeting-bookings/9999/cancel',
        authRequest('POST'),
      );
      expect(response.status).toBe(404);
    } finally {
      await app.disconnect();
    }
  });
});
