import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';

/**
 * `/sales/opportunities` renders the filtered total from whatever the endpoint returned, and forwards the stage
 * filter to the endpoint rather than filtering rows in the browser. Both are the requirement the page exists for, so
 * the page is rendered against a fake API client that records every request and answers by stage.
 */

interface FakeRequest {
  readonly path: string;
  readonly query?: Record<string, unknown>;
}

// `vi.hoisted` runs before the mock factory below and before the module-level constants, so the client and the
// request log it fills live here.
const { REQUESTS, apiClient } = vi.hoisted(() => {
  const requests: FakeRequest[] = [];
  const seeded = [
    {
      id: 1,
      name: 'Website redesign',
      customerId: 1,
      customerName: 'Acme',
      amount: 1000,
      stage: 'following_up',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 2,
      name: 'Support retainer',
      customerId: 1,
      customerName: 'Acme',
      amount: 250.5,
      stage: 'won',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
  ];
  return {
    REQUESTS: requests,
    apiClient: {
      request: async (options: {
        path: string;
        query?: Record<string, unknown>;
      }) => {
        requests.push({ path: options.path, query: options.query });
        if (options.path === 'sales/opportunities') {
          const stage = options.query?.stage;
          return {
            data:
              typeof stage === 'string'
                ? seeded.filter((opportunity) => opportunity.stage === stage)
                : seeded,
          };
        }
        return { data: [] };
      },
    },
  };
});

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useApiClient: () => apiClient,
    useToaster: () => ({
      info: () => {},
      success: () => {},
      error: () => {},
    }),
  };
});

const missing = new Set<string>();

vi.mock('@nocobase/i18n/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/i18n/client')>();

  function lookup(key: string): string | undefined {
    let node: unknown = appEnUS;
    for (const part of key.split('.')) {
      if (!node || typeof node !== 'object') {
        return undefined;
      }
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : undefined;
  }

  return {
    ...actual,
    useLocale: () => ({ locale: 'en-US' }),
    useTranslation: () => ({
      i18n: { language: 'en-US' },
      t: (key: string, options?: Record<string, unknown>) => {
        const template = lookup(key);
        if (template === undefined) {
          missing.add(key);
          return key;
        }
        return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
          options && name in options ? String(options[name]) : whole,
        );
      },
    }),
  };
});

beforeAll(() => {
  // Browser APIs jsdom does not implement, which the select and the table reach for while mounting.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  Element.prototype.scrollIntoView = () => {};
});

async function renderOpportunities(url: string) {
  REQUESTS.length = 0;
  const { default: OpportunitiesPage } =
    await import('../../client/pages/sales/opportunities/index.tsx');
  const rendered = render(
    <MemoryRouter initialEntries={[url]}>
      <OpportunitiesPage />
    </MemoryRouter>,
  );
  return rendered;
}

/** The filtered total is the only `aria-live` region on the page. */
async function totalText(container: HTMLElement): Promise<string> {
  const element = await waitFor(() => {
    const live = container.querySelector('[aria-live="polite"]');
    if (!live) {
      throw new Error('total not rendered yet');
    }
    return live;
  });
  return element.textContent ?? '';
}

describe('sales opportunities page', () => {
  it('sends the stage filter to the endpoint and totals the returned rows', async () => {
    const { container } = await renderOpportunities(
      '/sales/opportunities?stage=won',
    );

    await screen.findByText('Support retainer');

    // The filter is applied by the endpoint, so the page never asks for the unfiltered rows and never filters in the
    // browser: the only request it makes carries the stage.
    await waitFor(() => {
      expect(REQUESTS).toContainEqual({
        path: 'sales/opportunities',
        query: { stage: 'won' },
      });
    });
    expect(
      REQUESTS.filter((request) => request.path === 'sales/opportunities'),
    ).toEqual([{ path: 'sales/opportunities', query: { stage: 'won' } }]);

    // Only the won opportunity came back, so the total counts it alone.
    expect(await totalText(container)).toBe('250.50');
    expect([...missing], 'keys with no English wording').toEqual([]);
  });

  it('totals every opportunity when no stage is selected', async () => {
    const { container } = await renderOpportunities('/sales/opportunities');

    await screen.findByText('Website redesign');

    expect(await totalText(container)).toBe('1,250.50');
    expect([...missing], 'keys with no English wording').toEqual([]);
  });
});
