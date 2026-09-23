import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

it('renders the smoke page and counts in memory on each click', () => {
  render(<PipelineSmokePage />);

  expect(
    screen.getByRole('heading', { name: 'pipelineSmoke.title' }),
  ).toBeVisible();
  expect(screen.getByText('pipelineSmoke.description')).toBeVisible();

  const count = screen.getByTestId('pipeline-smoke-count');
  expect(count).toHaveTextContent('0');

  const increment = screen.getByRole('button', {
    name: 'pipelineSmoke.increment',
  });
  fireEvent.click(increment);
  expect(count).toHaveTextContent('1');
  fireEvent.click(increment);
  expect(count).toHaveTextContent('2');
});
