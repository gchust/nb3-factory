import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import HomePage from '../../client/pages/home.js';

/**
 * Renders the landing page against the real application wording, so the assertions cover the copy a reader sees and
 * the collapse interaction rather than only the key names in the source.
 */
async function renderPage(locale = 'en-US'): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init(locale);
  render(
    <I18nProvider runtime={runtime}>
      <HomePage />
    </I18nProvider>,
  );
  return runtime;
}

const notesBody =
  'The requirements added in the comments have been included in this build.';

describe('home announcement', () => {
  it('shows the announcement with the notes collapsed until the trigger is clicked', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Build pipeline verification' }),
    ).toBeVisible();
    expect(screen.getByText('Requirement from TestManage3')).toBeVisible();

    const trigger = screen.getByRole('button', { name: /Notes/u });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(notesBody)).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(screen.getByText(notesBody)).toBeVisible();

    await userEvent.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(screen.queryByText(notesBody)).not.toBeInTheDocument();
  });

  it('renders the Chinese copy and its notes body', async () => {
    await renderPage('zh-CN');

    expect(screen.getByRole('heading', { name: '搭建链路验证' })).toBeVisible();
    expect(screen.getByText('需求来自 TestManage3')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /说明/u }));
    expect(
      await screen.findByText('评论追加的需求已包含在本次搭建中'),
    ).toBeVisible();
  });
});
