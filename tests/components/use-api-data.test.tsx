import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: { request: vi.fn() } }));

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => mocks.client,
}));

import { useApiData } from '../../client/lib/use-api-data.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useApiData', () => {
  it('keeps the current result mounted while a reload is in flight', async () => {
    const pending = deferred<string>();
    let calls = 0;
    const load = () => {
      calls += 1;
      return calls === 1 ? Promise.resolve('first') : pending.promise;
    };

    const { result } = renderHook(() => useApiData('list', load));
    await waitFor(() => expect(result.current.data).toBe('first'));
    expect(result.current.loading).toBe(false);

    act(() => result.current.reload());
    // The previous page stays visible; the view is not swapped for a spinner.
    await waitFor(() => expect(calls).toBe(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('first');

    await act(async () => pending.resolve('second'));
    await waitFor(() => expect(result.current.data).toBe('second'));
  });

  it('clears the result when the key changes so records never mix', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useApiData(key, async () => `data:${key}`),
      { initialProps: { key: 'a' } },
    );
    await waitFor(() => expect(result.current.data).toBe('data:a'));

    const pending = deferred<string>();
    rerender({ key: 'b' });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data).toBe('data:b'));
    void pending;
  });

  it('surfaces a reload failure instead of stale data', async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve('first')
        : Promise.reject(new Error('network down'));
    };
    const { result } = renderHook(() => useApiData('list', load));
    await waitFor(() => expect(result.current.data).toBe('first'));

    act(() => result.current.reload());
    await waitFor(() =>
      expect((result.current.error as Error | undefined)?.message).toBe(
        'network down',
      ),
    );
    expect(result.current.data).toBeUndefined();
  });
});
