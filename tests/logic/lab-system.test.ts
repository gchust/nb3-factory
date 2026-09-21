// @vitest-environment node
// This suite drives the HTTP surface of the server, so it runs without a DOM. A
// `FormData` body has to reach `fetch` unchanged, which the jsdom globals cannot
// do; the Node globals can.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createLabTestApp,
  dataOf,
  jsonRequest,
  rawRequest,
  type JsonResponse,
  type LabTestApp,
} from '../helpers/lab-app.js';

/**
 * End-to-end coverage of the laboratory system against a real application.
 *
 * Every assertion goes through the HTTP surface — routing, authentication,
 * authorisation, the query layer, the migrations and the seeds are all real.
 * The fixtures are deliberately uneven (one laboratory with an unresolved high
 * safety issue, one piece of equipment with expired calibration, one piece of
 * equipment a student must not see) so the rules can be observed, not asserted.
 */

interface Dashboard {
  laboratories: { id: number; code: string; name: string }[];
  equipment: {
    total: number;
    byStatus: Record<string, number>;
    calibrationExpired: number;
    calibrationExpiringSoon: number;
  };
  workOrders: { total: number; open: number; byStatus: Record<string, number> };
  safety: { total: number; open: number; blocking: number };
  training: { total: number; participants: number };
  reservations: { upcoming: number; total: number };
  restricted: boolean;
}

interface Laboratory {
  id: number;
  code: string;
  name: string;
  role: string | null;
  equipmentCount: number;
}

interface Equipment {
  id: number;
  assetNo: string;
  name: string;
  status: string;
  labId: number;
  labName: string | null;
  studentVisible: boolean;
  studentDescription: string | null;
  calibrationExpired: boolean;
  calibrationExpiringSoon: boolean;
  openBlockingIssues: number;
  restricted: boolean;
}

interface WorkOrder {
  id: number;
  code: string;
  labId: number;
  status: string;
  assigneeId: string | null;
  resolvedAt: string | null;
  reviewComment: string | null;
  events?: { action: string; toStatus: string | null }[];
}

interface SafetyCheck {
  id: number;
  labId: number;
  title: string;
  status: string;
  severity: string | null;
  result: string;
}

interface Reservation {
  id: number;
  equipmentId: number;
  status: string;
}

interface LabFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  purpose: string | null;
  targetType: string;
  targetId: string;
  contentUrl: string;
}

const LAB_A = 'LAB-A';
const LAB_B = 'LAB-B';

const lab = {} as LabTestApp;
const cookies = new Map<string, string>();
const ids = {
  labs: new Map<string, number>(),
  equipment: new Map<string, number>(),
  workOrders: new Map<string, number>(),
  safety: new Map<string, number>(),
};

/** Issues a JSON request as a signed-in user. */
async function api(
  who: string,
  path: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  return jsonRequest(lab, path, { ...init, cookie: cookies.get(who)! });
}

async function filesFor(
  who: string,
  targetType: string,
  targetId: number | string,
) {
  const response = await api(
    who,
    `/api/lab/files?targetType=${targetType}&targetId=${targetId}`,
  );
  expect(response.status).toBe(200);
  return dataOf<LabFile[]>(response);
}

function fileNamed(files: LabFile[], filename: string): LabFile {
  const found = files.find((file) => file.filename === filename);
  if (!found) {
    throw new Error(
      `Attachment ${filename} is missing from ${JSON.stringify(files.map((f) => f.filename))}`,
    );
  }
  return found;
}

beforeAll(async () => {
  const created = await createLabTestApp();
  Object.assign(lab, created);
  for (const username of [
    'nocobase',
    'labadmin',
    'teacher1',
    'tech1',
    'safety1',
    'student1',
    'lab2admin',
  ]) {
    cookies.set(username, await lab.session(username));
  }

  for (const row of dataOf<Laboratory[]>(
    await api('nocobase', '/api/lab/laboratories'),
  )) {
    ids.labs.set(row.code, row.id);
  }
  for (const row of dataOf<Equipment[]>(
    await api('nocobase', '/api/lab/equipment'),
  )) {
    ids.equipment.set(row.assetNo, row.id);
  }
  for (const row of dataOf<WorkOrder[]>(
    await api('nocobase', '/api/lab/work-orders'),
  )) {
    ids.workOrders.set(row.code, row.id);
  }
  for (const row of dataOf<SafetyCheck[]>(
    await api('nocobase', '/api/lab/safety-checks'),
  )) {
    // The only open inspection is the ventilation-hood finding in LAB-A.
    if (row.status === 'open') {
      ids.safety.set('ventilation', row.id);
    }
  }
}, 180_000);

afterAll(async () => {
  await lab.close();
});

describe('laboratory system', () => {
  describe('seeded state', () => {
    it('reports the seeded ledger, work orders, inspections and training on the dashboard', async () => {
      const dashboard = dataOf<Dashboard>(
        await api('nocobase', '/api/lab/dashboard'),
      );

      expect(dashboard.laboratories.map((row) => row.code).sort()).toEqual([
        LAB_A,
        LAB_B,
      ]);
      expect(dashboard.equipment.total).toBe(6);
      expect(dashboard.equipment.byStatus.available).toBe(4);
      expect(dashboard.equipment.byStatus.maintenance).toBe(1);
      expect(dashboard.equipment.byStatus.retired).toBe(1);
      // EQ-2026-002 is past its calibration date and EQ-2026-005 failed its last one.
      expect(dashboard.equipment.calibrationExpired).toBeGreaterThanOrEqual(2);

      expect(dashboard.workOrders.total).toBe(3);
      expect(dashboard.workOrders.open).toBe(2);
      expect(dashboard.workOrders.byStatus.completed).toBe(1);

      expect(dashboard.safety.total).toBe(3);
      expect(dashboard.safety.open).toBe(1);
      expect(dashboard.safety.blocking).toBe(1);

      expect(dashboard.training.total).toBe(3);
      expect(dashboard.training.participants).toBe(26);

      expect(dashboard.reservations.total).toBeGreaterThanOrEqual(2);
      expect(dashboard.restricted).toBe(false);
    });

    it('serves every seeded attachment with byte-exact content', async () => {
      const equipmentFiles = await filesFor(
        'nocobase',
        'equipment',
        ids.equipment.get('EQ-2026-001')!,
      );
      expect(equipmentFiles.map((file) => file.filename).sort()).toEqual([
        '电子天平-使用说明书.pdf',
        '电子天平-铭牌.png',
      ]);

      const nameplate = fileNamed(equipmentFiles, '电子天平-铭牌.png');
      // The URL carries the path the deployment mounts the application under.
      expect(nameplate.contentUrl).toBe(
        `${lab.publicBasePath}/lab-files/${nameplate.id}/content`,
      );
      expect(nameplate.mimeType).toBe('image/png');

      const response = await rawRequest(lab, nameplate.contentUrl, {
        cookie: cookies.get('nocobase'),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
      expect(response.headers.get('content-disposition')).toContain('inline');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.length).toBe(nameplate.size);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    });
  });

  describe('account registration', () => {
    it('registers a self-service account that can then sign in', async () => {
      const registered = await jsonRequest(lab, '/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: 'newcomer@lab.example.com',
          name: 'New Comer',
          password: 'lab12345',
          username: 'newcomer',
        }),
      });
      expect(registered.status).toBe(200);
      cookies.set('newcomer', await lab.session('newcomer', 'lab12345'));

      // A new account holds no laboratory membership and no student permission
      // set, so it has no laboratory role and reads nothing. The published
      // equipment catalogue requires the student role an administrator assigns;
      // `studentVisible` on a record is not by itself a grant.
      const dashboard = dataOf<Dashboard>(
        await api('newcomer', '/api/lab/dashboard'),
      );
      expect(dashboard.restricted).toBe(true);
      expect(dashboard.laboratories).toEqual([]);
      expect(dashboard.equipment.total).toBe(0);
      expect(dashboard.workOrders.total).toBe(0);
      expect(dashboard.safety.total).toBe(0);

      expect(
        dataOf<Laboratory[]>(await api('newcomer', '/api/lab/laboratories')),
      ).toEqual([]);
      expect(
        dataOf<Equipment[]>(await api('newcomer', '/api/lab/equipment')),
      ).toEqual([]);

      const published = ids.equipment.get('EQ-2026-001')!;
      const detail = await api('newcomer', `/api/lab/equipment/${published}`);
      expect(detail.status).toBe(403);
    });
  });

  describe('laboratory isolation', () => {
    it('shows a laboratory administrator only the laboratories they belong to', async () => {
      const admin = dataOf<Laboratory[]>(
        await api('labadmin', '/api/lab/laboratories'),
      );
      expect(admin.map((row) => row.code)).toEqual([LAB_A]);
      expect(admin[0]!.role).toBe('lab_admin');

      const other = dataOf<Laboratory[]>(
        await api('lab2admin', '/api/lab/laboratories'),
      );
      expect(other.map((row) => row.code)).toEqual([LAB_B]);

      const root = dataOf<Laboratory[]>(
        await api('nocobase', '/api/lab/laboratories'),
      );
      expect(root.map((row) => row.code).sort()).toEqual([LAB_A, LAB_B]);
    });

    it('scopes the equipment ledger to the caller laboratory', async () => {
      const admin = dataOf<Equipment[]>(
        await api('labadmin', '/api/lab/equipment'),
      );
      expect(admin.map((row) => row.labId)).toEqual([
        ids.labs.get(LAB_A),
        ids.labs.get(LAB_A),
        ids.labs.get(LAB_A),
        ids.labs.get(LAB_A),
        ids.labs.get(LAB_A),
      ]);

      const other = dataOf<Equipment[]>(
        await api('lab2admin', '/api/lab/equipment'),
      );
      expect(other.map((row) => row.assetNo)).toEqual(['EQ-2026-101']);
    });

    it('refuses cross-laboratory reads and writes', async () => {
      const foreignEquipment = ids.equipment.get('EQ-2026-001')!;
      const read = await api(
        'lab2admin',
        `/api/lab/equipment/${foreignEquipment}`,
      );
      expect(read.status).toBe(403);
      expect((read.body as { code: string }).code).toBe('FORBIDDEN');

      const labB = ids.labs.get(LAB_B)!;
      const edit = await api('labadmin', `/api/lab/laboratories/${labB}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed by the wrong administrator' }),
      });
      expect(edit.status).toBe(403);

      const create = await api('labadmin', '/api/lab/equipment', {
        method: 'POST',
        body: JSON.stringify({
          assetNo: 'EQ-X-001',
          name: 'Trespassing balance',
          labId: labB,
        }),
      });
      expect(create.status).toBe(403);

      const workOrder = await api('labadmin', '/api/lab/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-101')!,
          title: 'Cross-laboratory repair',
          description: 'Should be refused.',
        }),
      });
      expect(workOrder.status).toBe(403);
    });

    it('enforces the write roles each module declares', async () => {
      const labA = ids.labs.get(LAB_A)!;

      const teacherEquipment = await api('teacher1', '/api/lab/equipment', {
        method: 'POST',
        body: JSON.stringify({
          assetNo: 'EQ-X-002',
          name: 'Teacher balance',
          labId: labA,
        }),
      });
      expect(teacherEquipment.status).toBe(403);

      const technicianLab = await api('tech1', '/api/lab/laboratories', {
        method: 'POST',
        body: JSON.stringify({ code: 'LAB-X', name: 'Technician laboratory' }),
      });
      expect(technicianLab.status).toBe(403);

      const studentLab = await api('student1', '/api/lab/laboratories', {
        method: 'POST',
        body: JSON.stringify({ code: 'LAB-Y', name: 'Student laboratory' }),
      });
      expect(studentLab.status).toBe(403);
    });
  });

  describe('student visibility', () => {
    it('hides equipment a student may not see', async () => {
      const visible = dataOf<Equipment[]>(
        await api('student1', '/api/lab/equipment'),
      );
      expect(visible.map((row) => row.assetNo).sort()).toEqual([
        'EQ-2026-001',
        'EQ-2026-002',
        'EQ-2026-004',
        'EQ-2026-101',
      ]);
      expect(visible.every((row) => row.studentVisible)).toBe(true);
      expect(visible.every((row) => row.restricted)).toBe(true);

      const hidden = ids.equipment.get('EQ-2026-003')!;
      const response = await api('student1', `/api/lab/equipment/${hidden}`);
      expect(response.status).toBe(403);
    });

    it('keeps maintenance, safety and training records away from students', async () => {
      for (const path of [
        '/api/lab/work-orders',
        '/api/lab/safety-checks',
        '/api/lab/training-records',
      ]) {
        const response = await api('student1', path);
        expect(response.status).toBe(200);
        expect(dataOf<unknown[]>(response)).toEqual([]);
      }
    });

    it('reports a restricted dashboard without laboratory scope', async () => {
      const dashboard = dataOf<Dashboard>(
        await api('student1', '/api/lab/dashboard'),
      );
      expect(dashboard.restricted).toBe(true);
      expect(dashboard.laboratories).toEqual([]);
      expect(dashboard.equipment.total).toBe(4);
      expect(dashboard.workOrders.total).toBe(0);
      expect(dashboard.safety.total).toBe(0);
      expect(dashboard.training.total).toBe(0);
    });
  });

  describe('reservations', () => {
    const window = () => {
      const start = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      return { startsAt: start.toISOString(), endsAt: end.toISOString() };
    };

    it('refuses a reservation on equipment whose calibration has expired', async () => {
      const response = await api('student1', '/api/lab/reservations', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-002')!,
          ...window(),
        }),
      });
      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toContain(
        'Calibration has expired',
      );
    });

    it('refuses a reservation while the laboratory has an unresolved high safety issue', async () => {
      const response = await api('student1', '/api/lab/reservations', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-001')!,
          ...window(),
        }),
      });
      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toContain(
        'safety issue',
      );
    });

    it('refuses a reservation on equipment that is not available', async () => {
      const response = await api('labadmin', '/api/lab/reservations', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-003')!,
          ...window(),
        }),
      });
      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toContain(
        'maintenance',
      );
    });

    let reservationId = 0;

    it('accepts a reservation on a student-visible, calibrated instrument', async () => {
      const response = await api('student1', '/api/lab/reservations', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-101')!,
          purpose: '分析化学实验样品测量。',
          ...window(),
        }),
      });
      expect(response.status).toBe(201);
      const created = dataOf<Reservation>(response);
      reservationId = created.id;
      expect(created.status).toBe('reserved');
    });

    it('refuses a reservation that overlaps an existing one', async () => {
      const response = await api('student1', '/api/lab/reservations', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-101')!,
          ...window(),
        }),
      });
      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toContain(
        'already reserved',
      );
    });

    it('lets only the owner or a laboratory administrator cancel a reservation', async () => {
      const seeded = dataOf<Reservation[]>(
        await api(
          'nocobase',
          `/api/lab/reservations?equipmentId=${ids.equipment.get('EQ-2026-001')}`,
        ),
      );
      expect(seeded.length).toBe(1);

      const refused = await api(
        'teacher1',
        `/api/lab/reservations/${seeded[0]!.id}/cancel`,
        {
          method: 'POST',
        },
      );
      expect(refused.status).toBe(403);

      const cancelled = await api(
        'student1',
        `/api/lab/reservations/${reservationId}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      expect(cancelled.status).toBe(200);
      expect(dataOf<Reservation>(cancelled).status).toBe('cancelled');

      const again = await api(
        'student1',
        `/api/lab/reservations/${reservationId}/cancel`,
        {
          method: 'POST',
        },
      );
      expect(again.status).toBe(409);
    });
  });

  describe('work order workflow', () => {
    const workOrder = () => ids.workOrders.get('WO-2026-001')!;

    it('walks a work order from repair to review', async () => {
      const submitted = await api(
        'tech1',
        `/api/lab/work-orders/${workOrder()}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'submit_review',
            comment: '轴承已更换，等待验收。',
          }),
        },
      );
      expect(submitted.status).toBe(200);
      expect(dataOf<WorkOrder>(submitted).status).toBe('pending_review');

      const illegal = await api(
        'tech1',
        `/api/lab/work-orders/${workOrder()}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'submit_review' }),
        },
      );
      expect(illegal.status).toBe(409);
    });

    it('restricts completion to a laboratory administrator', async () => {
      const response = await api(
        'tech1',
        `/api/lab/work-orders/${workOrder()}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'complete',
            comment: '技术员无权验收。',
          }),
        },
      );
      expect(response.status).toBe(403);
    });

    it('requires a review comment to complete a work order', async () => {
      const response = await api(
        'labadmin',
        `/api/lab/work-orders/${workOrder()}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'complete' }),
        },
      );
      expect(response.status).toBe(400);
    });

    it('blocks completion while the laboratory has an unresolved high safety issue', async () => {
      const response = await api(
        'labadmin',
        `/api/lab/work-orders/${workOrder()}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'complete', comment: '验收通过。' }),
        },
      );
      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toContain(
        'safety issue',
      );
    });

    it('restricts closing a safety inspection to the safety officer and the administrator', async () => {
      const refused = await api(
        'teacher1',
        `/api/lab/safety-checks/${ids.safety.get('ventilation')!}/close`,
        {
          method: 'POST',
          body: JSON.stringify({ comment: '教师无权关闭隐患。' }),
        },
      );
      expect(refused.status).toBe(403);
    });

    it('closes the safety issue and then allows the work order to complete', async () => {
      const closed = await api(
        'safety1',
        `/api/lab/safety-checks/${ids.safety.get('ventilation')!}/close`,
        {
          method: 'POST',
          body: JSON.stringify({
            comment: '通风柜已维修，复测面风速 0.51 m/s，符合要求。',
          }),
        },
      );
      expect(closed.status).toBe(200);
      const check = dataOf<SafetyCheck>(closed);
      expect(check.status).toBe('closed');
      expect(check.severity).toBeNull();

      const completed = await api(
        'labadmin',
        `/api/lab/work-orders/${workOrder()}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'complete',
            comment: '复检合格，隐患已闭环。',
          }),
        },
      );
      expect(completed.status).toBe(200);
      const order = dataOf<WorkOrder>(completed);
      expect(order.status).toBe('completed');
      expect(order.resolvedAt).not.toBeNull();
      expect(order.reviewComment).toContain('隐患已闭环');
      expect(order.events?.map((event) => event.toStatus)).toContain(
        'completed',
      );

      const restored = dataOf<Equipment>(
        await api(
          'labadmin',
          `/api/lab/equipment/${ids.equipment.get('EQ-2026-003')!}`,
        ),
      );
      expect(restored.status).toBe('available');
    });

    it('now accepts the reservation the safety issue was blocking', async () => {
      const start = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
      const response = await api('student1', '/api/lab/reservations', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-001')!,
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
        }),
      });
      expect(response.status).toBe(201);
    });

    it('lets a teacher raise a work order but not assign it', async () => {
      const created = await api('teacher1', '/api/lab/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: ids.equipment.get('EQ-2026-004')!,
          title: '分光光度计基线漂移',
          description: '预热后基线持续漂移，需检查光源。',
          type: 'repair',
          priority: 'normal',
        }),
      });
      expect(created.status).toBe(201);
      const order = dataOf<WorkOrder>(created);
      expect(order.status).toBe('open');
      const reloaded = dataOf<WorkOrder>(
        await api('teacher1', `/api/lab/work-orders/${order.id}`),
      );
      expect(reloaded.events?.length).toBe(1);

      const refused = await api(
        'teacher1',
        `/api/lab/work-orders/${order.id}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'assign', assigneeId: 'demo-tech1' }),
        },
      );
      expect(refused.status).toBe(403);

      const assigned = await api(
        'labadmin',
        `/api/lab/work-orders/${order.id}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'assign', assigneeId: 'demo-tech1' }),
        },
      );
      expect(assigned.status).toBe(200);
      expect(dataOf<WorkOrder>(assigned).assigneeId).toBe('demo-tech1');
    });

    it('refuses a transition on another laboratory work order', async () => {
      const response = await api(
        'lab2admin',
        `/api/lab/work-orders/${ids.workOrders.get('WO-2026-003')!}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'assign', assigneeId: 'demo-tech1' }),
        },
      );
      expect(response.status).toBe(403);
    });
  });

  describe('attachments and preview safety', () => {
    it('lets a student read manuals and nameplates of equipment they can see', async () => {
      const equipmentId = ids.equipment.get('EQ-2026-001')!;
      const files = await filesFor('student1', 'equipment', equipmentId);
      expect(files.map((file) => file.purpose).sort()).toEqual([
        'manual',
        'nameplate',
      ]);

      const manual = fileNamed(files, '电子天平-使用说明书.pdf');
      const response = await rawRequest(lab, manual.contentUrl, {
        cookie: cookies.get('student1'),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.length).toBe(manual.size);
    });

    it('withholds maintenance attachments from a student', async () => {
      const list = await api(
        'student1',
        `/api/lab/files?targetType=work_order&targetId=${ids.workOrders.get('WO-2026-001')}`,
      );
      expect(list.status).toBe(403);

      const labFiles = await filesFor(
        'labadmin',
        'work_order',
        ids.workOrders.get('WO-2026-001')!,
      );
      expect(labFiles.map((file) => file.purpose).sort()).toEqual([
        'after_repair',
        'before_repair',
        'fault_report',
      ]);
      const report = fileNamed(labFiles, '离心机-故障分析报告.docx');
      const refused = await rawRequest(lab, report.contentUrl, {
        cookie: cookies.get('student1'),
      });
      expect(refused.status).toBe(403);
    });

    it('serves a long text notice inline and complete', async () => {
      const files = await filesFor(
        'labadmin',
        'laboratory',
        ids.labs.get(LAB_A)!,
      );
      const notice = fileNamed(files, '物理测量实验室-安全风险告知书.txt');
      expect(notice.size).toBeGreaterThan(20_000);

      const response = await rawRequest(lab, notice.contentUrl, {
        cookie: cookies.get('labadmin'),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(response.headers.get('content-disposition')).toContain('inline');
      const text = await response.text();
      expect(Buffer.byteLength(text, 'utf8')).toBe(notice.size);
      expect(text).toContain('第 28 次宣讲记录');
    });

    it('forces a file that cannot be previewed to download', async () => {
      const files = await filesFor(
        'labadmin',
        'laboratory',
        ids.labs.get(LAB_A)!,
      );
      const archive = fileNamed(files, '实验室历史资料归档.zip');

      const response = await rawRequest(lab, archive.contentUrl, {
        cookie: cookies.get('labadmin'),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'application/octet-stream',
      );
      expect(response.headers.get('content-disposition')).toContain(
        'attachment',
      );
      expect(response.headers.get('content-security-policy')).toContain(
        "default-src 'none'",
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
      expect(bytes.length).toBe(archive.size);
    });

    it('honours an explicit download request and encodes non-ASCII names', async () => {
      const files = await filesFor(
        'labadmin',
        'equipment',
        ids.equipment.get('EQ-2026-001')!,
      );
      const nameplate = fileNamed(files, '电子天平-铭牌.png');

      const response = await rawRequest(
        lab,
        `${nameplate.contentUrl}?download=1`,
        {
          cookie: cookies.get('labadmin'),
        },
      );
      expect(response.status).toBe(200);
      const disposition = response.headers.get('content-disposition')!;
      expect(disposition).toContain('attachment');
      expect(disposition).toContain("filename*=UTF-8''");
      expect(disposition).toContain(encodeURIComponent('电子天平-铭牌.png'));
    });

    it('answers with 404 for an unknown or malformed file id', async () => {
      const unknown = await rawRequest(
        lab,
        '/lab-files/7f3b9c6e-0000-4000-8000-00000000ffff/content',
        {
          cookie: cookies.get('labadmin'),
        },
      );
      expect(unknown.status).toBe(404);

      const malformed = await rawRequest(lab, '/lab-files/not-a-uuid/content', {
        cookie: cookies.get('labadmin'),
      });
      expect(malformed.status).toBe(404);
    });

    it('rejects an attachment outside the read scope of the caller laboratory', async () => {
      const files = await filesFor(
        'lab2admin',
        'equipment',
        ids.equipment.get('EQ-2026-101')!,
      );
      const nameplate = fileNamed(files, '酸度计-铭牌.png');
      const refused = await rawRequest(lab, nameplate.contentUrl, {
        cookie: cookies.get('labadmin'),
      });
      expect(refused.status).toBe(403);
    });

    it('uploads, reads, updates and deletes an attachment', async () => {
      const equipmentId = ids.equipment.get('EQ-2026-001')!;
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );

      const form = new FormData();
      form.set('targetType', 'equipment');
      form.set('targetId', String(equipmentId));
      form.set('purpose', 'attachment');
      form.set('remark', '验收时补拍的铭牌照片。');
      form.set(
        'file',
        new File([new Uint8Array(png)], '补拍-铭牌.png', { type: 'image/png' }),
      );

      const uploaded = await api('labadmin', '/api/lab/files', {
        method: 'POST',
        body: form,
      });
      expect(uploaded.status).toBe(201);
      const file = dataOf<LabFile>(uploaded);
      expect(file.filename).toBe('补拍-铭牌.png');
      expect(file.size).toBe(png.length);
      expect(file.uploadedById).toBeTruthy();

      const downloaded = await rawRequest(lab, file.contentUrl, {
        cookie: cookies.get('labadmin'),
      });
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer()).equals(png)).toBe(
        true,
      );

      const patched = await api('labadmin', `/api/lab/files/${file.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ remark: '已核对资产编号。' }),
      });
      expect(patched.status).toBe(200);
      expect(dataOf<LabFile>(patched).remark).toBe('已核对资产编号。');

      const deleted = await api('labadmin', `/api/lab/files/${file.id}`, {
        method: 'DELETE',
      });
      expect(deleted.status).toBe(200);

      const gone = await rawRequest(lab, file.contentUrl, {
        cookie: cookies.get('labadmin'),
      });
      expect(gone.status).toBe(404);
    });

    it('refuses an upload a student may not make and a file type it may not store', async () => {
      const equipmentId = ids.equipment.get('EQ-2026-001')!;
      const makeForm = (filename: string, type: string) => {
        const form = new FormData();
        form.set('targetType', 'equipment');
        form.set('targetId', String(equipmentId));
        form.set(
          'file',
          new File([new Uint8Array([1, 2, 3])], filename, { type }),
        );
        return form;
      };

      const student = await api('student1', '/api/lab/files', {
        method: 'POST',
        body: makeForm('学生上传.png', 'image/png'),
      });
      expect(student.status).toBe(403);

      const executable = await api('labadmin', '/api/lab/files', {
        method: 'POST',
        body: makeForm('payload.exe', 'application/octet-stream'),
      });
      expect(executable.status).toBe(400);

      const script = await api('labadmin', '/api/lab/files', {
        method: 'POST',
        body: makeForm('payload.svg', 'image/svg+xml'),
      });
      expect(script.status).toBe(400);
    });

    it('refuses an upload against another laboratory record', async () => {
      const form = new FormData();
      form.set('targetType', 'equipment');
      form.set('targetId', String(ids.equipment.get('EQ-2026-101')!));
      form.set(
        'file',
        new File([new Uint8Array([1, 2, 3])], '跨实验室.png', {
          type: 'image/png',
        }),
      );

      const response = await api('labadmin', '/api/lab/files', {
        method: 'POST',
        body: form,
      });
      expect(response.status).toBe(403);
    });
  });

  describe('route security', () => {
    const anonymous = [
      ['GET', '/api/lab/dashboard'],
      ['GET', '/api/lab/equipment'],
      ['GET', '/api/lab/files?targetType=laboratory&targetId=1'],
      ['POST', '/api/lab/laboratories'],
      ['GET', '/lab-files/7f3b9c6e-0000-4000-8000-00000000ffff/content'],
    ] as const;

    it('requires a session on every route it owns', async () => {
      for (const [method, path] of anonymous) {
        const response = await rawRequest(lab, path, {
          method,
          body: method === 'POST' ? JSON.stringify({}) : undefined,
        });
        expect(response.status, `${method} ${path}`).toBe(401);
      }
    });

    it('leaves framework routes and unknown paths alone', async () => {
      const health = await rawRequest(lab, '/api/healthz');
      expect(health.status).toBe(200);

      // A GET under `/api` that matches nothing is answered by the client shell,
      // which the framework owns; a method this contribution does not serve is not.
      const missing = await api('labadmin', '/api/lab/does-not-exist', {
        method: 'POST',
        body: '{}',
      });
      expect(missing.status).toBe(404);

      const badId = await api('labadmin', '/api/lab/equipment/not-a-number');
      expect(badId.status).toBe(400);

      // Better Auth's own session endpoint still answers for this application.
      const session = await rawRequest(lab, '/api/auth/get-session', {
        cookie: cookies.get('labadmin')!,
      });
      expect(session.status).toBe(200);
    });

    it('rejects a body that is not JSON and a method it does not serve', async () => {
      const notJson = await api('labadmin', '/api/lab/laboratories', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'code=LAB-C',
      });
      expect(notJson.status).toBe(400);

      const wrongMethod = await api(
        'labadmin',
        `/api/lab/equipment/${ids.equipment.get('EQ-2026-001')}`,
        {
          method: 'DELETE',
        },
      );
      expect(wrongMethod.status).toBe(404);
    });

    it('validates required input rather than storing an incomplete record', async () => {
      const response = await api('labadmin', '/api/lab/equipment', {
        method: 'POST',
        body: JSON.stringify({
          name: '没有资产编号的天平',
          labId: ids.labs.get(LAB_A),
        }),
      });
      expect(response.status).toBe(400);
      expect((response.body as { code: string }).code).toBe('INVALID_INPUT');
    });
  });
});
