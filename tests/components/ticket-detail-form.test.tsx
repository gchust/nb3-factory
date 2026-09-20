import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import TicketDetailPage from '../../client/pages/tickets/detail.js';

const action = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const returnMaterial = vi.hoisted(() => vi.fn().mockResolvedValue({}));

const BASE_TICKET = {
  id: 14,
  ticketNo: 'RP-0014',
  title: 'Meeting room lighting fault',
  buildingId: 2,
  buildingName: 'Building B',
  roomId: 5,
  roomNumber: '201',
  equipmentId: null,
  equipmentName: null,
  location: 'Meeting room',
  faultType: 'lighting',
  priority: 'high',
  description: 'One light does not turn on.',
  contactName: 'Liu',
  contactPhone: '13800000000',
  status: 'in_progress',
  reporterId: 'reporter-1',
  reporterName: 'Reporter',
  assigneeId: 'tech-1',
  assigneeName: 'Technician',
  assignedAt: '2026-09-20T01:00:00.000Z',
  dueAt: '2026-09-30T10:00:00.000Z',
  startedAt: '2026-09-20T02:00:00.000Z',
  finishedAt: null,
  faultCause: null,
  repairProcess: null,
  laborCost: 0,
  materialCost: 0,
  totalCost: 0,
  reworkCount: 0,
  cancelReason: null,
  acceptanceResult: null,
  acceptanceRemark: null,
  acceptedAt: null,
  completedAt: null,
  settledAt: null,
  overdue: false,
  createdAt: '2026-09-20T01:00:00.000Z',
  updatedAt: '2026-09-20T02:00:00.000Z',
  attachments: [],
  materials: [],
  events: [],
  settlement: null,
  capabilities: {
    viewAll: false,
    create: true,
    dispatch: false,
    work: true,
    accept: false,
    cancel: false,
    settle: false,
    stockIn: false,
    manageAssets: false,
  },
};

const detail = vi.hoisted(() => ({ ticket: {} as Record<string, unknown> }));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({}),
}));
vi.mock('@/lib/use-repair', () => ({
  useApiData: () => ({
    data: detail.ticket,
    error: undefined,
    loading: false,
    reload: vi.fn(),
  }),
  useRepairMeta: () => ({
    data: {
      buildings: [],
      rooms: [],
      equipment: [],
      materials: [],
      technicians: [],
    },
    error: undefined,
    loading: false,
    reload: vi.fn(),
  }),
  useRepairSession: () => ({
    data: {
      user: { userId: 'tech-1', name: 'Technician', role: 'technician' },
      capabilities: detail.ticket.capabilities,
    },
    error: undefined,
    loading: false,
    reload: vi.fn(),
  }),
}));
vi.mock('@/lib/repair-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/repair-api')>();
  return {
    ...actual,
    repairApi: { ...actual.repairApi, action, returnMaterial },
  };
});

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/tickets/14']}>
      <Routes>
        <Route path='/tickets/:id' element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  action.mockClear();
  returnMaterial.mockClear();
  detail.ticket = structuredClone(BASE_TICKET);
});

it('keeps every field of the acceptance form editable and submits them together', async () => {
  const user = userEvent.setup();
  renderPage();

  // Editing one field after another is the regression this test locks down: the page used to crash with
  // "Cannot read properties of null (reading 'value')" once a second field was edited, because the change
  // handler read the event after React had cleared `currentTarget`.
  const cause = await screen.findByLabelText('Cause');
  await user.type(cause, 'Loose contact');

  const process = screen.getByLabelText('Repair process');
  await user.type(process, 'Replaced the connector');

  const labor = screen.getByLabelText('Labor cost');
  await user.clear(labor);
  await user.type(labor, '80');

  expect(cause).toHaveValue('Loose contact');
  expect(process).toHaveValue('Replaced the connector');
  expect(labor).toHaveValue(80);

  await user.click(screen.getByRole('button', { name: 'Submit' }));

  await waitFor(() => {
    expect(action).toHaveBeenCalledWith(
      expect.anything(),
      14,
      'finish',
      expect.objectContaining({
        faultCause: 'Loose contact',
        repairProcess: 'Replaced the connector',
        laborCost: 80,
      }),
    );
  });
});

it('keeps the dispatch due date editable', async () => {
  detail.ticket = {
    ...structuredClone(BASE_TICKET),
    status: 'pending_dispatch',
    assigneeId: null,
    capabilities: {
      ...BASE_TICKET.capabilities,
      dispatch: true,
      work: false,
    },
  };
  const user = userEvent.setup();
  renderPage();

  const due = await screen.findByLabelText('Due at');
  await user.type(due, '2026-10-01T09:00');
  expect(due).toHaveValue('2026-10-01T09:00');
});
