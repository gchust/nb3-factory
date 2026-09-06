import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import {
  TicketCategoryBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../../client/components/ticket-badges.js';
import enUS from '../../client/locales/en-US.js';

const APP_NAMESPACE = 'nb3-factory';

let runtime: I18nRuntime;

beforeAll(async () => {
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    applicationNamespace: APP_NAMESPACE,
  });
  runtime.registerApplicationNamespace(APP_NAMESPACE, {
    'en-US': () => Promise.resolve(enUS),
  });
  await runtime.init('en-US');
});

function renderWithI18n(ui: ReactElement) {
  return render(
    <I18nProvider runtime={runtime}>
      <NamespaceScope ns={APP_NAMESPACE}>{ui}</NamespaceScope>
    </I18nProvider>,
  );
}

describe('ticket badges', () => {
  it('renders a translated status badge', () => {
    renderWithI18n(<TicketStatusBadge status='pending' />);
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('renders every status label', () => {
    const { rerender } = renderWithI18n(<TicketStatusBadge status='pending' />);
    for (const [status, label] of [
      ['pending', 'Pending'],
      ['inProgress', 'In progress'],
      ['resolved', 'Resolved'],
      ['closed', 'Closed'],
    ] as const) {
      rerender(
        <I18nProvider runtime={runtime}>
          <NamespaceScope ns={APP_NAMESPACE}>
            <TicketStatusBadge status={status} />
          </NamespaceScope>
        </I18nProvider>,
      );
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('renders a translated priority badge', () => {
    renderWithI18n(<TicketPriorityBadge priority='urgent' />);
    expect(screen.getByText('Urgent')).toBeDefined();
  });

  it('renders a translated category badge', () => {
    renderWithI18n(<TicketCategoryBadge category='network' />);
    expect(screen.getByText('Network')).toBeDefined();
  });
});
