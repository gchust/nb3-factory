import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

// The page reads only `useTranslation`; returning the key makes each assertion
// name the translation key it expects rather than a hard-coded English string.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('PipelineSmokePage', () => {
  it('renders the title and the one-line description', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', { name: 'pipelineSmoke.title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();
  });

  it('starts at zero and adds one per click', () => {
    render(<PipelineSmokePage />);

    expect(screen.getByText('0')).toBeInTheDocument();

    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });
    fireEvent.click(increment);
    fireEvent.click(increment);
    fireEvent.click(increment);

    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
