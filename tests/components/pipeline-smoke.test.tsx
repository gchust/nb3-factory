import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.tsx';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('pipeline smoke page', () => {
  it('shows the title, explanation and a counter that starts at zero', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'pipelineSmoke.title',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('increases the count by one on every press of +1', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });

    await user.click(increment);
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(increment);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
