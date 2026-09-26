import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Outside an `I18nProvider` the runtime returns the key verbatim, so the mock does the same and the assertions
// below can name the translation keys the page asks for.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

describe('pipeline smoke page', () => {
  it('renders the title and description', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'pipelineSmoke.title' }),
    ).toBeVisible();
    expect(screen.getByText('pipelineSmoke.description')).toBeVisible();
  });

  it('starts at zero and increases by one per click', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    expect(screen.getByText('0')).toBeVisible();
    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });

    await user.click(increment);
    expect(screen.getByText('1')).toBeVisible();

    await user.click(increment);
    await user.click(increment);
    expect(screen.getByText('3')).toBeVisible();
  });
});
