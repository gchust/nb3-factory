import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The page only reads `t`; returning the key keeps the assertions independent of the wording while still exercising
// the real component.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

describe('PipelineSmokePage', () => {
  it('starts at zero and adds one per click', () => {
    render(<PipelineSmokePage />);

    expect(screen.getByRole('status')).toHaveTextContent(/^0$/u);

    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });
    fireEvent.click(increment);
    expect(screen.getByRole('status')).toHaveTextContent(/^1$/u);
    fireEvent.click(increment);
    expect(screen.getByRole('status')).toHaveTextContent(/^2$/u);
  });

  it('renders its title and single line of explanation', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'pipelineSmoke.title',
      }),
    ).toBeVisible();
    expect(screen.getByText('pipelineSmoke.description')).toBeVisible();
  });
});
