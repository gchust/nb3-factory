import {
  ClientApplication,
  ClientApplicationContext,
  createAppClientConfig,
  defineAppClientRenderConfig,
} from '@nocobase/app-client';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FollowUpFormDialog,
  OpportunityFormDialog,
} from '@/components/sales/forms';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { Opportunity } from '@/lib/sales';

const { api } = vi.hoisted(() => ({
  api: {
    opportunities: vi.fn(),
    updateOpportunity: vi.fn(),
    createFollowUp: vi.fn(),
  },
}));

vi.mock('@/lib/sales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sales')>();
  return { ...actual, useSalesApi: () => api };
});

const APP = '@nocobase/app-template-default';
const applications: ClientApplication[] = [];

const MESSAGES: Record<string, string> = {
  'sales.opportunities.edit': 'Edit opportunity',
  'sales.followups.create': 'Record follow-up',
  'actions.close': 'Close',
};

const OPPORTUNITY: Opportunity = {
  id: 'opp-1',
  customerId: 'cust-1',
  customerName: 'Customer',
  name: 'Deal',
  amount: 1000,
  expectedCloseDate: '2026-12-01',
  stage: 'proposal',
  closeReason: null,
  ownerId: 'user-1',
  ownerName: 'User',
  isClosed: false,
};

async function createRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US'],
    applicationNamespace: APP,
  });
  runtime.registerApplicationNamespace(APP, {
    'en-US': () => Promise.resolve({ default: MESSAGES }),
  });
  await runtime.init('en-US');
  return runtime;
}

async function createApp(): Promise<ClientApplication> {
  const appRuntime = await resolveAppRuntime(
    defineAppRuntime({
      packageName: APP,
      createAppConfig: createAppClientConfig,
      plugins: defineClientPlugins([]),
    }),
    { rawConfig: { api: { baseURL: '/api' } } },
  );
  const app = new ClientApplication({
    runtime: appRuntime,
    createRenderConfig: () => defineAppClientRenderConfig({ routes: null }),
  });
  await app.start();
  applications.push(app);
  return app;
}

function renderInApp(
  app: ClientApplication,
  runtime: I18nRuntime,
  node: ReactNode,
) {
  return render(
    <ClientApplicationContext.Provider value={app}>
      <I18nProvider runtime={runtime}>{node}</I18nProvider>
    </ClientApplicationContext.Provider>,
  );
}

/**
 * A native date picker's calendar is browser chrome rendered outside the
 * dialog's DOM. Choosing a day therefore reaches the page as a press whose
 * target is outside the dialog — the sequence exercised here.
 */
function pressOutsideDialog(): void {
  const options = {
    bubbles: true,
    cancelable: true,
    detail: 1,
    button: 0,
  };
  document.body.dispatchEvent(
    new PointerEvent('pointerdown', { ...options, pointerType: 'mouse' }),
  );
  document.body.dispatchEvent(new MouseEvent('mousedown', options));
  document.body.dispatchEvent(new MouseEvent('mouseup', options));
  document.body.dispatchEvent(new MouseEvent('click', options));
  document.body.dispatchEvent(
    new PointerEvent('pointerup', { ...options, pointerType: 'mouse' }),
  );
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.shutdown()));
  vi.clearAllMocks();
});

describe('sales form dialogs and native date pickers', () => {
  it('keeps an outside press able to close a plain dialog (control)', async () => {
    const app = await createApp();
    const runtime = await createRuntime();
    let open = true;
    const onOpenChange = vi.fn((value: boolean) => {
      open = value;
    });

    const view = renderInApp(
      app,
      runtime,
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p>plain-dialog</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('plain-dialog')).toBeDefined();

    pressOutsideDialog();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
    view.rerender(
      <ClientApplicationContext.Provider value={app}>
        <I18nProvider runtime={runtime}>
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
              <p>plain-dialog</p>
            </DialogContent>
          </Dialog>
        </I18nProvider>
      </ClientApplicationContext.Provider>,
    );
    await waitFor(() => expect(screen.queryByText('plain-dialog')).toBeNull());
  });

  it('keeps the opportunity form open while its date picker is used', async () => {
    const app = await createApp();
    const runtime = await createRuntime();
    const onClose = vi.fn();
    const onSaved = vi.fn();

    renderInApp(
      app,
      runtime,
      <OpportunityFormDialog
        opportunity={OPPORTUNITY}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    dateInput?.focus();

    pressOutsideDialog();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Edit opportunity')).toBeDefined();
    expect(document.querySelector('input[type="date"]')).not.toBeNull();

    // Ignoring outside presses must not make the form impossible to dismiss.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the follow-up form open while its date picker is used', async () => {
    const app = await createApp();
    const runtime = await createRuntime();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    api.opportunities.mockResolvedValue({ data: [] });

    renderInApp(
      app,
      runtime,
      <FollowUpFormDialog
        customerId='cust-1'
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    dateInput?.focus();

    pressOutsideDialog();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Record follow-up')).toBeDefined();
  });
});
