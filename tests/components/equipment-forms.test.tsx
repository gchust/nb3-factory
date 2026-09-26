import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';

/**
 * The two forms that write a record, driven through their real validation.
 *
 * What matters here is that an incomplete record never reaches the API: the
 * add/edit form without an asset number or a name, and the borrow form without
 * a borrower or an expected return date, both stop at the form and the server
 * is never called. A business failure that comes back from the server is shown
 * on the field or the form instead of being swallowed.
 */

const enUS = appEnUS as unknown as Record<string, unknown>;

function lookup(key: string): string | undefined {
  const flat = enUS[key];
  if (typeof flat === 'string') return flat;
  let node: unknown = enUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

vi.mock('@nocobase/i18n/client', () => ({
  useLocale: () => ({ locale: 'en-US' }),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = lookup(key) ?? key;
      return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
        options && name in options ? String(options[name]) : whole,
      );
    },
  }),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../client/pages/equipment/api.js', () => ({
  fetchEquipmentList: vi.fn(),
  fetchEquipment: vi.fn(),
  createEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  borrowEquipment: vi.fn(),
}));

import { ApiClientError } from '@nocobase/app-client';

import {
  borrowEquipment,
  createEquipment,
  updateEquipment,
} from '../../client/pages/equipment/api.js';
import { BorrowForm } from '../../client/pages/equipment/borrow-form.js';
import { EquipmentForm } from '../../client/pages/equipment/equipment-form.js';
import type { Equipment } from '../../client/pages/equipment/types.js';

function equipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: 1,
    assetNo: 'EQ-1',
    name: 'Laptop',
    category: 'IT',
    notes: '',
    status: 'available',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentBorrower: null,
    expectedReturnAt: null,
    currentLoanId: null,
    overdue: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EquipmentForm', () => {
  it('refuses to save without an asset number or a name', async () => {
    const onSubmitted = vi.fn();
    const { container } = render(
      <EquipmentForm formId='equipment-new-form' onSubmitted={onSubmitted} />,
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(
      await screen.findByText('Enter an asset number.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter an equipment name.')).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('saves a completed form and reports the record', async () => {
    const saved = equipment({ id: 5, assetNo: 'EQ-5', name: 'Scanner' });
    vi.mocked(createEquipment).mockResolvedValue(saved);
    const onSubmitted = vi.fn();
    const { container } = render(
      <EquipmentForm formId='equipment-new-form' onSubmitted={onSubmitted} />,
    );

    fireEvent.change(container.querySelector('#equipment-new-form-assetNo')!, {
      target: { value: ' EQ-5 ' },
    });
    fireEvent.change(container.querySelector('#equipment-new-form-name')!, {
      target: { value: 'Scanner' },
    });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(saved));
    expect(createEquipment).toHaveBeenCalledWith(expect.anything(), {
      assetNo: 'EQ-5',
      name: 'Scanner',
      category: '',
      notes: '',
    });
  });

  it('shows a server conflict on the asset number field', async () => {
    vi.mocked(createEquipment).mockRejectedValue(
      new ApiClientError('This asset number already exists', {
        status: 409,
        code: 'ASSET_NO_TAKEN',
        method: 'POST',
        url: '/api/equipment',
      }),
    );
    const { container } = render(
      <EquipmentForm formId='equipment-new-form' onSubmitted={vi.fn()} />,
    );

    fireEvent.change(container.querySelector('#equipment-new-form-assetNo')!, {
      target: { value: 'EQ-1' },
    });
    fireEvent.change(container.querySelector('#equipment-new-form-name')!, {
      target: { value: 'Laptop' },
    });
    fireEvent.submit(container.querySelector('form')!);

    expect(
      await screen.findByText('This asset number is already in use.'),
    ).toBeInTheDocument();
  });
});

describe('BorrowForm', () => {
  it('refuses to borrow without a borrower or an expected return date', async () => {
    const onSubmitted = vi.fn();
    const { container } = render(
      <BorrowForm
        equipmentId={1}
        formId='equipment-borrow-form'
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByText('Enter the borrower.')).toBeInTheDocument();
    expect(
      screen.getByText('Choose the expected return date.'),
    ).toBeInTheDocument();
    expect(borrowEquipment).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

describe('equipment form server failures', () => {
  it('shows a root error for a failure it cannot attach to a field', async () => {
    // The date field is a calendar, which is impractical to drive here. This
    // test covers the server-side conflict path through the edit form instead,
    // where the fields are plain inputs.
    vi.mocked(updateEquipment).mockRejectedValue(
      new ApiClientError('The equipment is already borrowed', {
        status: 409,
        code: 'NOT_AVAILABLE',
        method: 'POST',
        url: '/api/equipment/1',
      }),
    );
    const { container } = render(
      <EquipmentForm
        equipment={equipment()}
        formId='equipment-edit-form'
        onSubmitted={vi.fn()}
      />,
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(
      await screen.findByText('The request failed. Please try again.'),
    ).toBeInTheDocument();
  });
});
