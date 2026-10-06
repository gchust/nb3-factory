import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('pipeline smoke page', () => {
  it('starts at zero and increases by one on every click', async () => {
    const value = await runtime();
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    const count = screen.getByTestId('pipeline-smoke-count');
    expect(count).toHaveTextContent('0');

    const increment = screen.getByRole('button', { name: '+1' });
    fireEvent.click(increment);
    expect(count).toHaveTextContent('1');
    fireEvent.click(increment);
    fireEvent.click(increment);
    expect(count).toHaveTextContent('3');
  });
});
