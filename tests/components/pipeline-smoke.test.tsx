import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

describe('PipelineSmokePage', () => {
  it('shows a counter that starts at zero', () => {
    render(<PipelineSmokePage />);

    expect(screen.getByRole('heading')).toHaveTextContent(
      'pipelineSmoke.title',
    );
    expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();
    expect(screen.getByLabelText('pipelineSmoke.countLabel')).toHaveTextContent(
      '0',
    );
  });

  it('increments the counter once per +1 click', () => {
    render(<PipelineSmokePage />);

    const increment = screen.getByRole('button', {
      name: 'pipelineSmoke.increment',
    });
    const count = screen.getByLabelText('pipelineSmoke.countLabel');

    fireEvent.click(increment);
    expect(count).toHaveTextContent('1');
    fireEvent.click(increment);
    fireEvent.click(increment);
    expect(count).toHaveTextContent('3');
  });
});
