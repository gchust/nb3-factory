import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PipelineSmokePage', () => {
  it('renders the page title and description', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'pipelineSmoke.title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();
  });

  it('starts at zero and adds one on every click', () => {
    render(<PipelineSmokePage />);

    expect(screen.getByText('0')).toBeInTheDocument();

    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });
    fireEvent.click(increment);
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(increment);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
