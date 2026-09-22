import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

// The focused test has no i18n runtime, so keys resolve to themselves.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it('renders the smoke page and increments the in-memory counter', async () => {
  const user = userEvent.setup();
  render(<PipelineSmokePage />);

  expect(
    screen.getByRole('heading', { name: 'pipelineSmoke.title' }),
  ).toBeInTheDocument();
  expect(screen.getByText('pipelineSmoke.description')).toBeInTheDocument();

  const count = screen.getByTestId('pipeline-smoke-count');
  expect(count).toHaveTextContent('0');

  const increment = screen.getByRole('button', {
    name: 'pipelineSmoke.increment',
  });
  await user.click(increment);
  expect(count).toHaveTextContent('1');
  await user.click(increment);
  expect(count).toHaveTextContent('2');
});
