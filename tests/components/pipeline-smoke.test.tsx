import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.tsx';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('pipeline smoke page', () => {
  it('starts at zero and increases by one per click', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('0');

    await user.click(
      screen.getByRole('button', { name: 'pipelineSmoke.increment' }),
    );
    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('1');

    await user.click(
      screen.getByRole('button', { name: 'pipelineSmoke.increment' }),
    );
    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('2');
  });
});
