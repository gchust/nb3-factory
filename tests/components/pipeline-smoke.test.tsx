import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function runtime() {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  return value;
}

async function renderPage() {
  const i18n = await runtime();
  render(
    <I18nProvider runtime={i18n}>
      <PipelineSmokePage />
    </I18nProvider>,
  );
  return i18n;
}

describe('pipeline smoke page', () => {
  it('renders the title and description', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Pipeline Smoke' }),
    ).toBeVisible();
    expect(
      screen.getByText('Used to verify the automated build pipeline.'),
    ).toBeVisible();
  });

  it('starts at zero and increments by one per click', async () => {
    await renderPage();
    const user = userEvent.setup();

    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('0');

    const increment = screen.getByRole('button', { name: '+1' });
    await user.click(increment);
    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('1');

    await user.click(increment);
    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('2');
  });

  it('resets to zero when the page is rendered again', async () => {
    await renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+1' }));
    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('1');

    cleanup();
    await renderPage();
    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('0');
  });
});
