import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PipelineSmokePage', () => {
  it('shows the page title and description', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', { name: 'pipelineSmoke.title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();
  });

  it('starts at zero and adds one per click without persisting', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    const counter = screen.getByLabelText('pipelineSmoke.countLabel');
    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });

    expect(counter).toHaveTextContent('0');

    await user.click(increment);
    expect(counter).toHaveTextContent('1');

    await user.click(increment);
    await user.click(increment);
    expect(counter).toHaveTextContent('3');
  });
});
