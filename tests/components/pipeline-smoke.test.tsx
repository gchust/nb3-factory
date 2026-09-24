import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.tsx';

async function renderPage(locale = 'en-US') {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init(locale);
  return render(
    <I18nProvider runtime={runtime}>
      <PipelineSmokePage />
    </I18nProvider>,
  );
}

describe('pipeline smoke page', () => {
  it.each([
    ['en-US', 'Pipeline Smoke', 'Used to verify the automated build pipeline.'],
    ['zh-CN', '流程冒烟', '用于验证自动搭建流程。'],
  ])(
    'renders its title and description in %s',
    async (locale, title, description) => {
      await renderPage(locale);

      expect(
        screen.getByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      expect(screen.getByText(description)).toBeVisible();
    },
  );

  it('starts at zero and increments by one on every click', async () => {
    await renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('0');

    const increment = screen.getByRole('button', { name: '+1' });
    await userEvent.click(increment);
    expect(screen.getByRole('status')).toHaveTextContent('1');
    await userEvent.click(increment);
    await userEvent.click(increment);
    expect(screen.getByRole('status')).toHaveTextContent('3');
  });
});
