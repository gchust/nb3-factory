import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function runtime(): Promise<I18nRuntime> {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  return value;
}

function renderPage(value: I18nRuntime) {
  return render(
    <I18nProvider runtime={value}>
      <PipelineSmokePage />
    </I18nProvider>,
  );
}

describe('pipeline smoke page', () => {
  it('renders the title, description, initial count and increment button', async () => {
    renderPage(await runtime());

    expect(
      screen.getByRole('heading', { name: 'Pipeline Smoke' }),
    ).toBeVisible();
    expect(
      screen.getByText('Used to verify the automated build pipeline.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Count')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });

  it('increases the count by one for every click', async () => {
    renderPage(await runtime());
    const button = screen.getByRole('button', { name: '+1' });
    const count = screen.getByLabelText('Count');

    fireEvent.click(button);
    expect(count).toHaveTextContent('1');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(count).toHaveTextContent('3');
  });

  it('renders the localized Chinese copy', async () => {
    const value = await runtime();
    renderPage(value);

    await act(() => value.changeLanguage('zh-CN'));

    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程。')).toBeVisible();
    expect(screen.getByLabelText('计数')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });
});
