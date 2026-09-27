import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Outside an `I18nProvider` the runtime returns default values verbatim; map the keys this page uses to their
// English wording so the assertions read like the interface a user sees.
const { messages } = vi.hoisted(() => ({
  messages: {
    'pipelineSmoke.title': 'Pipeline Smoke',
    'pipelineSmoke.description': 'Used to verify the automated build pipeline.',
    'pipelineSmoke.increment': '+1',
  } as Record<string, string>,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}));

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

describe('pipeline smoke page', () => {
  it('starts at zero and increments by one on each click', () => {
    render(<PipelineSmokePage />);

    const count = screen.getByTestId('pipeline-smoke-count');
    expect(count).toHaveTextContent('0');

    const button = screen.getByRole('button', { name: '+1' });
    fireEvent.click(button);
    expect(count).toHaveTextContent('1');

    fireEvent.click(button);
    fireEvent.click(button);
    expect(count).toHaveTextContent('3');
  });

  it('renders the page title and description', () => {
    render(<PipelineSmokePage />);

    expect(
      screen.getByRole('heading', { name: 'Pipeline Smoke' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Used to verify the automated build pipeline.'),
    ).toBeInTheDocument();
  });
});
