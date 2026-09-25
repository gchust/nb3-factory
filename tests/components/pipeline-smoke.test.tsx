import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function incrementButton() {
  return screen.getByRole('button', { name: 'pipelineSmoke.increment' });
}

describe('pipeline smoke page', () => {
  it('starts at zero and increments by one per click', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    expect(screen.getByText('0')).toBeInTheDocument();

    const increment = incrementButton();
    await user.click(increment);
    await user.click(increment);
    await user.click(increment);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('keeps the count in page memory only', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PipelineSmokePage />);

    await user.click(incrementButton());
    expect(screen.getByText('1')).toBeInTheDocument();

    unmount();
    render(<PipelineSmokePage />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
