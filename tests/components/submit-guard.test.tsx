// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  newRequestId,
  useSubmitGuard,
} from '../../client/pages/recruitment/hooks.js';

/**
 * A repeated click on Save must not create two records. React re-enables the
 * button once the request resolves, and the dialog is still animating closed at
 * that moment, so a second click can reach it. This guard is the fix.
 */
describe('useSubmitGuard', () => {
  it('runs one submission and ignores a repeat until the form is reopened', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const run = vi.fn(async () => undefined);
    const onError = vi.fn();

    await act(async () => {
      await Promise.all([
        result.current.submit(run, onError),
        result.current.submit(run, onError),
      ]);
    });
    expect(run).toHaveBeenCalledTimes(1);

    // The lock survives success, so a click during the close animation is dropped.
    await act(async () => {
      await result.current.submit(run, onError);
    });
    expect(run).toHaveBeenCalledTimes(1);

    // Reopening the form allows the next submission.
    act(() => result.current.reset());
    await act(async () => {
      await result.current.submit(run, onError);
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('unlocks after a failure so the user can correct and retry', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const run = vi.fn(async () => {
      throw new Error('request failed');
    });
    const onError = vi.fn();

    await act(async () => {
      await result.current.submit(run, onError);
    });
    expect(onError).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.submit(run, onError);
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('generates a distinct key per form', () => {
    expect(newRequestId()).not.toBe(newRequestId());
    expect(newRequestId().length).toBeGreaterThan(8);
  });
});
