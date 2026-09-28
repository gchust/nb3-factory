import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import PipelineSmokePage from '../../client/pages/pipeline-smoke';

describe('PipelineSmokePage', () => {
  it('starts at zero', () => {
    render(<PipelineSmokePage />);

    expect(screen.getByTestId('pipeline-smoke-count')).toHaveTextContent('0');
  });

  it('adds one to the in-memory count on every click', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />);

    const count = screen.getByTestId('pipeline-smoke-count');
    const increment = screen.getByTestId('pipeline-smoke-increment');

    await user.click(increment);
    expect(count).toHaveTextContent('1');

    await user.click(increment);
    await user.click(increment);
    expect(count).toHaveTextContent('3');
  });
});
