import { APP_NS, I18nProvider, I18nRuntime } from '@nocobase/i18n/client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EquipmentFormDialog } from '../../client/components/equipment/equipment-form-dialog.js';
import type { EquipmentListItem } from '../../client/components/equipment/types.js';
import locales from '../../client/locales/index.js';

const record: EquipmentListItem = {
  id: 8,
  name: 'Wireless Mouse',
  assetNumber: 'M1-MS-007',
  category: 'Accessories',
  status: 'available',
  description: 'Logitech M590',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  openBorrowRecordId: null,
  openBorrowRecordBorrowerId: null,
  canBorrow: true,
  canMaintain: true,
  canReturn: false,
};

function dialog(
  open: boolean,
  equipment: EquipmentListItem | null,
  onSubmit: () => Promise<void>,
  onOpenChange: (open: boolean) => void,
): ReactElement {
  return (
    <EquipmentFormDialog
      categories={['Accessories', 'Office supplies']}
      equipment={equipment}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
    />
  );
}

/**
 * Mounts the dialog inside a real i18n runtime so the assertion texts are the
 * English strings a user would see. The returned rerender keeps the provider
 * mounted so a programmatic open can be simulated on the same tree.
 */
async function mount(
  ui: ReactNode,
): Promise<ReturnType<typeof render> & { readonly runtime: I18nRuntime }> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    applicationNamespace: 'nb3-factory',
  });
  runtime.registerApplicationNamespace(APP_NS, locales);
  await runtime.init('en-US');
  const utils = render(<I18nProvider runtime={runtime}>{ui}</I18nProvider>);
  return { ...utils, runtime };
}

function withRuntime(runtime: I18nRuntime, ui: ReactNode): ReactElement {
  return <I18nProvider runtime={runtime}>{ui}</I18nProvider>;
}

describe('EquipmentFormDialog', () => {
  it('backfills the record fields when the page opens it for editing', async () => {
    // The page keeps the dialog mounted while closed and opens it
    // programmatically (setEditing), so `onOpenChange` never fires with
    // `true`. The fields have to be synced from the record on open instead.
    const onSubmit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const onOpenChange = vi.fn<(open: boolean) => void>();

    const utils = await mount(dialog(false, null, onSubmit, onOpenChange));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Opening sets the record; Base UI never fires onOpenChange(true) for a
    // programmatic open, so this exercises the backfill path itself.
    utils.rerender(
      withRuntime(utils.runtime, dialog(true, record, onSubmit, onOpenChange)),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Edit equipment')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Wireless Mouse');
    expect(screen.getByLabelText('Asset number')).toHaveValue('M1-MS-007');
    expect(screen.getByLabelText('Category')).toHaveValue('Accessories');
    expect(screen.getByLabelText('Description')).toHaveValue('Logitech M590');
  });

  it('submits the backfilled record when the user saves without editing', async () => {
    const onSubmit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const onOpenChange = vi.fn<(open: boolean) => void>();

    await mount(dialog(true, record, onSubmit, onOpenChange));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Wireless Mouse',
        assetNumber: 'M1-MS-007',
        category: 'Accessories',
        description: 'Logitech M590',
      });
    });
  });

  it('opens empty for a new record and submits the entered fields', async () => {
    const onSubmit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const onOpenChange = vi.fn<(open: boolean) => void>();

    await mount(dialog(true, null, onSubmit, onOpenChange));

    expect(screen.getByText('Add equipment')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Asset number')).toHaveValue('');
    expect(screen.getByLabelText('Category')).toHaveValue('');

    await userEvent.type(screen.getByLabelText('Name'), 'QA Conference Tablet');
    await userEvent.type(screen.getByLabelText('Asset number'), 'QA-PN-101');
    await userEvent.type(
      screen.getByLabelText('Category'),
      'Conference tablet',
    );
    await userEvent.type(
      screen.getByLabelText('Description'),
      'QA smoke-test device',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'QA Conference Tablet',
        assetNumber: 'QA-PN-101',
        category: 'Conference tablet',
        description: 'QA smoke-test device',
      });
    });
  });
});
