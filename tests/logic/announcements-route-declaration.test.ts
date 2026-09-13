import type { AppClientRoutePageDefinition } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));

vi.mock('@/hooks/use-announcements', () => ({
  useAnnouncementsApi: () => api,
}));

import routes from '../../client/routes.js';

function findAnnouncementsRoute(): AppClientRoutePageDefinition {
  const contribution = routes.find((candidate) => candidate.parent === 'app');
  if (!contribution || contribution.parent !== 'app') {
    throw new Error('The application route contribution is missing.');
  }

  const route = contribution.routes.find(
    (candidate) => candidate.name === 'announcements',
  );
  if (!route || !('componentLoader' in route) || !route.componentLoader) {
    throw new Error('The announcements route is missing.');
  }
  return route;
}

describe('announcements route declaration', () => {
  it('mounts an authenticated page with a navigation label', () => {
    const route = findAnnouncementsRoute();

    expect(route.path).toBe('/announcements');
    expect(route.auth).toBe('required');
    expect(route.navigation?.title).toBe('navigation.announcements');
    expect(route.navigation?.icon).toBeDefined();
  });

  it('resolves its lazily loaded page component', async () => {
    const route = findAnnouncementsRoute();

    const module = await route.componentLoader();

    expect(module.default).toBeTypeOf('function');
  });
});
