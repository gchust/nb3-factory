import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Outside an `I18nProvider` this page reads the real keys; supply the English wording so the test asserts what a
// reader sees rather than the key paths.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'pipelineSmoke.title': 'Pipeline smoke',
          'pipelineSmoke.description':
            'Used to verify the automated build pipeline.',
          'pipelineSmoke.count': 'Count',
          'pipelineSmoke.increment': '+1',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

describe('PipelineSmokePage', () => {
  it('shows the title, the explanation and an initial count of 0', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', { name: 'Pipeline smoke' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Used to verify the automated build pipeline.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('adds one on every click of the +1 button', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    const button = screen.getByRole('button', { name: '+1' });
    await user.click(button);
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(button);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('keeps the count in page memory, so a remount starts again at 0', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PipelineSmokePage />);

    await user.click(screen.getByRole('button', { name: '+1' }));
    expect(screen.getByText('1')).toBeInTheDocument();

    unmount();
    render(<PipelineSmokePage />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
