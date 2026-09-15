import { describe, expect, it } from 'vitest';

import { errorMessageKey } from '../../client/components/inspection/error-message.js';
import {
  extensionOf,
  formatBytes,
  formatDateTime,
  toDate,
} from '../../client/components/inspection/format.js';
import {
  canCreateRecord,
  canDeletePhoto,
  canManageCatalog,
  canManageRecord,
} from '../../client/components/inspection/types.js';

describe('errorMessageKey', () => {
  it('maps a server code to a translation key', () => {
    expect(errorMessageKey('PHOTOS_REQUIRED')).toBe(
      'inspection.errors.PHOTOS_REQUIRED',
    );
  });

  it('normalizes an unexpected code shape', () => {
    expect(errorMessageKey('body-too-large')).toBe(
      'inspection.errors.BODY_TOO_LARGE',
    );
  });

  it('falls back to the generic key without a code', () => {
    expect(errorMessageKey(undefined)).toBe('inspection.errors.generic');
  });
});

describe('format helpers', () => {
  it('parses the epoch-millisecond strings the server returns', () => {
    expect(toDate('1789430805678.0').getTime()).toBe(1789430805678);
  });

  it('returns an empty string for an unparsable value', () => {
    expect(formatDateTime('not-a-date')).toBe('');
  });

  it('extracts a lower-case extension', () => {
    expect(extensionOf('Photo.PNG')).toBe('png');
    expect(extensionOf('no-extension')).toBe('');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('role capabilities', () => {
  it('lets inspectors, team leads and administrators create records', () => {
    expect(canCreateRecord('inspector')).toBe(true);
    expect(canCreateRecord('teamLead')).toBe(true);
    expect(canCreateRecord('admin')).toBe(true);
    expect(canCreateRecord('viewer')).toBe(false);
    expect(canCreateRecord('none')).toBe(false);
  });

  it('lets only team leads and administrators manage a record', () => {
    expect(canManageRecord('teamLead')).toBe(true);
    expect(canManageRecord('admin')).toBe(true);
    expect(canManageRecord('inspector')).toBe(false);
    expect(canManageRecord('viewer')).toBe(false);
  });

  it('lets only administrators manage the catalog', () => {
    expect(canManageCatalog('admin')).toBe(true);
    expect(canManageCatalog('teamLead')).toBe(false);
    expect(canManageCatalog('inspector')).toBe(false);
    expect(canManageCatalog('viewer')).toBe(false);
  });

  it('decides who may delete a site photo', () => {
    expect(canDeletePhoto('admin', 'someone', 'me')).toBe(true);
    expect(canDeletePhoto('teamLead', 'someone', 'me')).toBe(true);
    expect(canDeletePhoto('inspector', 'me', 'me')).toBe(true);
    expect(canDeletePhoto('inspector', 'someone', 'me')).toBe(false);
    expect(canDeletePhoto('viewer', 'me', 'me')).toBe(false);
    expect(canDeletePhoto('inspector', 'me', undefined)).toBe(false);
  });
});
