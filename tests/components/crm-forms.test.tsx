import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import {
  CustomerForm,
  ContactForm,
  OpportunityForm,
  StageBadge,
} from '../../client/pages/crm/components.js';
import type { CustomerRecord } from '../../client/pages/crm/api.js';

async function createRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('en-US');
  return runtime;
}

const customers: CustomerRecord[] = [
  {
    id: 1,
    name: 'Acme',
    industry: null,
    createdAt: '2026-01-01T00:00:00.000',
    updatedAt: '2026-01-01T00:00:00.000',
  },
];

function submit(form: HTMLFormElement): void {
  fireEvent.submit(form);
}

describe('CRM forms', () => {
  it('requires a customer name and normalizes the submitted values', async () => {
    const runtime = await createRuntime();
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider runtime={runtime}>
        <CustomerForm
          submitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('A name is required.')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '  Northwind  ' },
    });
    fireEvent.change(screen.getByLabelText('Industry'), {
      target: { value: '   ' },
    });
    submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Northwind',
      industry: null,
    });
  });

  it('requires a customer on a contact form', async () => {
    const runtime = await createRuntime();
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider runtime={runtime}>
        <ContactForm
          customers={customers}
          submitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Jane' },
    });
    submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Select a customer.')).toBeVisible();
  });

  it('submits a contact with a preselected customer', async () => {
    const runtime = await createRuntime();
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider runtime={runtime}>
        <ContactForm
          customers={customers}
          initial={{ name: 'Jane', contactInfo: null, customerId: 1 }}
          submitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Contact info'), {
      target: { value: 'jane@example.com' },
    });
    submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Jane',
      contactInfo: 'jane@example.com',
      customerId: 1,
    });
  });

  it('rejects a negative opportunity amount', async () => {
    const runtime = await createRuntime();
    const onSubmit = vi.fn();
    const { container } = render(
      <I18nProvider runtime={runtime}>
        <OpportunityForm
          customers={customers}
          initial={{
            name: 'Renewal',
            customerId: 1,
            amount: 0,
            stage: 'following',
          }}
          submitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Expected amount'), {
      target: { value: '-10' },
    });
    submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an amount of zero or more.')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Expected amount'), {
      target: { value: '120000' },
    });
    submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Renewal',
      customerId: 1,
      amount: 120000,
      stage: 'following',
    });
  });

  it('renders stage labels in the active language', async () => {
    const runtime = await createRuntime();
    render(
      <I18nProvider runtime={runtime}>
        <StageBadge stage='won' />
        <StageBadge stage='following' />
        <StageBadge stage='lost' />
      </I18nProvider>,
    );
    expect(screen.getByText('Won')).toBeVisible();
    expect(screen.getByText('Following')).toBeVisible();
    expect(screen.getByText('Lost')).toBeVisible();

    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByText('赢单')).toBeVisible();
    expect(screen.getByText('跟进中')).toBeVisible();
    expect(screen.getByText('输单')).toBeVisible();
  });
});
