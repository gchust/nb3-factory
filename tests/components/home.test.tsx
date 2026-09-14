import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiService, requestMock } = vi.hoisted(() => {
  const request = vi.fn();
  return { apiService: { request }, requestMock: request };
});

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: Symbol('api-client'),
  // The real hook resolves a container singleton, so it must return a stable object across renders.
  useService: () => apiService,
}));

vi.mock('@nocobase/i18n/client', () => {
  const messages: Record<string, string> = {
    'home.title': 'Preview smoke',
    'home.description': 'Preview smoke description',
    'home.retry': 'Retry',
    'home.buildInfo.title': 'Build information',
    'home.buildInfo.name': 'Application name',
    'home.buildInfo.startedAt': 'Server started at',
    'home.buildInfo.nodeVersion': 'Node version',
    'home.buildInfo.loading': 'Loading build information…',
    'home.buildInfo.error': 'Could not load build information.',
    'home.visits.title': 'Visit count',
    'home.visits.label': 'Total visits',
    'home.visits.loading': 'Loading the visit count…',
    'home.visits.error': 'Could not load the visit count.',
  };
  return {
    useTranslation: () => ({
      t: (key: string) => messages[key] ?? key,
    }),
  };
});

import HomePage from '../../client/pages/home.js';

const buildInfoPayload = {
  name: 'Smoke App',
  startedAt: '2026-09-14T08:30:00.000Z',
  nodeVersion: 'v24.20.0',
};

interface RequestOptions {
  readonly method?: string;
  readonly path: string;
}

describe('HomePage', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('renders server build information and the visit count', async () => {
    requestMock.mockImplementation((options: RequestOptions) =>
      options.path === 'preview-smoke/info'
        ? Promise.resolve({ data: buildInfoPayload })
        : Promise.resolve({ data: { count: 5 } }),
    );

    render(<HomePage />);

    expect(await screen.findByText('Smoke App')).toBeInTheDocument();
    expect(screen.getByText('v24.20.0')).toBeInTheDocument();
    expect(screen.getByText('Build information')).toBeInTheDocument();
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.getByText('Total visits')).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith({ path: 'preview-smoke/info' });
    expect(requestMock).toHaveBeenCalledWith({
      method: 'POST',
      path: 'preview-smoke/visits',
    });
  });

  it('shows an error and recovers when the caller retries', async () => {
    let failBuildInfo = true;
    requestMock.mockImplementation((options: RequestOptions) => {
      if (options.path !== 'preview-smoke/info') {
        return Promise.resolve({ data: { count: 1 } });
      }
      if (failBuildInfo) {
        failBuildInfo = false;
        return Promise.reject(new Error('build info unavailable'));
      }
      return Promise.resolve({ data: buildInfoPayload });
    });

    render(<HomePage />);

    expect(
      await screen.findByText('Could not load build information.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Smoke App')).toBeInTheDocument();
  });
});
