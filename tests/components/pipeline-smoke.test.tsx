import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

// The page only needs translated labels; the real i18n runtime has its own integration tests.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

it('increments the in-memory counter by one per click', () => {
  render(<PipelineSmokePage />);

  const count = screen.getByTestId('pipeline-smoke-count');
  expect(count).toHaveTextContent('0');
  expect(screen.getByText('pipelineSmoke.title')).toBeInTheDocument();
  expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();

  const increment = screen.getByRole('button', {
    name: 'pipelineSmoke.increment',
  });

  fireEvent.click(increment);
  fireEvent.click(increment);
  fireEvent.click(increment);

  expect(count).toHaveTextContent('3');
});
