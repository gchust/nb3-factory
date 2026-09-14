import { describe, expect, it } from 'vitest';

import {
  createBuildInfoService,
  resolveApplicationName,
  resolveProcessStartedAt,
} from '../../server/providers/build-info.js';

describe('resolveApplicationName', () => {
  it('uses the configured client application title', () => {
    expect(
      resolveApplicationName({ app: { title: '  Smoke App  ' } }, 'fallback'),
    ).toBe('Smoke App');
  });

  it('falls back when the title is missing or blank', () => {
    expect(resolveApplicationName({}, 'fallback')).toBe('fallback');
    expect(resolveApplicationName({ app: {} }, 'fallback')).toBe('fallback');
    expect(resolveApplicationName({ app: { title: '   ' } }, 'fallback')).toBe(
      'fallback',
    );
    expect(resolveApplicationName(undefined, 'fallback')).toBe('fallback');
    expect(resolveApplicationName(null, 'fallback')).toBe('fallback');
  });
});

describe('resolveProcessStartedAt', () => {
  it('derives the process start from the current clock and uptime', () => {
    expect(resolveProcessStartedAt(1_000_000, 60).toISOString()).toBe(
      new Date(1_000_000 - 60_000).toISOString(),
    );
  });
});

describe('build info service', () => {
  it('returns the application name, start time and node version', () => {
    const service = createBuildInfoService({
      name: 'Smoke App',
      startedAt: new Date('2026-09-14T08:30:00.000Z'),
      nodeVersion: 'v24.20.0',
    });

    expect(service.get()).toEqual({
      name: 'Smoke App',
      startedAt: '2026-09-14T08:30:00.000Z',
      nodeVersion: 'v24.20.0',
    });
  });
});
