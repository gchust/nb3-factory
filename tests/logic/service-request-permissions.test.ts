// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  serviceRequestDefaultAccess,
  serviceRequestUser,
} from '../../database/seed-data/service-request-permissions.js';
import {
  SERVICE_REQUEST_ASSIGNEE_ID,
  SERVICE_REQUEST_RECORDS,
  SERVICE_REQUEST_TEST_USERS,
} from '../../database/seed-data/service-request-fixtures.js';
import {
  SERVICE_REQUEST_COLLECTION,
  SERVICE_REQUEST_PAGES,
  SERVICE_REQUEST_PERMISSION_SET_KEY,
} from '../../server/service-request-model.js';

/**
 * The permission-set seed is written once and then edited by administrators in
 * the Authorization settings, so nothing at runtime keeps it in step with the
 * routes and the model. These assertions fail when the feature and its starting
 * grant drift apart — a new page the set does not cover, an action added
 * without a matching grant, or a collection renamed on one side only.
 */
describe('service request permission set', () => {
  it('uses the model key', () => {
    expect(serviceRequestUser.key).toBe(SERVICE_REQUEST_PERMISSION_SET_KEY);
  });

  it('grants access to every page the feature declares', () => {
    const pageIds = new Set(
      serviceRequestUser.grants
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id),
    );
    expect(pageIds).toEqual(new Set(SERVICE_REQUEST_PAGES));
  });

  it('grants read, create and update on the collection, and not delete', () => {
    const databaseGrants = serviceRequestUser.grants.filter(
      (grant) => grant.resource.type === 'database.collection',
    );
    expect(databaseGrants.map((grant) => grant.resource.id)).toEqual([
      SERVICE_REQUEST_COLLECTION,
    ]);
    const actions = databaseGrants
      .flatMap((grant) => grant.actions)
      .map((action) => action.action)
      .sort();
    expect(actions).toEqual(['create', 'read', 'update']);
  });
});

describe('service request default access', () => {
  it('covers read and update on the collection with an all-rows scope', () => {
    expect(serviceRequestDefaultAccess.resource).toEqual({
      type: 'database.collection',
      id: SERVICE_REQUEST_COLLECTION,
    });
    expect(
      serviceRequestDefaultAccess.actions.map((action) => action.action).sort(),
    ).toEqual(['read', 'update']);
    for (const action of serviceRequestDefaultAccess.actions) {
      expect(action.scope).toEqual({ type: 'all' });
    }
  });
});

describe('service request fixtures', () => {
  it('provides two distinct accounts', () => {
    expect(SERVICE_REQUEST_TEST_USERS).toHaveLength(2);
    expect(
      new Set(SERVICE_REQUEST_TEST_USERS.map((user) => user.id)).size,
    ).toBe(2);
    expect(
      new Set(SERVICE_REQUEST_TEST_USERS.map((user) => user.username)).size,
    ).toBe(2);
  });

  it('provides one urgent and one normal request, both assigned', () => {
    expect(SERVICE_REQUEST_RECORDS).toHaveLength(2);
    expect(
      SERVICE_REQUEST_RECORDS.map((record) => record.urgent).sort(),
    ).toEqual([false, true]);
    for (const record of SERVICE_REQUEST_RECORDS) {
      expect(record.assigneeId).toBe(SERVICE_REQUEST_ASSIGNEE_ID);
    }
  });

  it('assigns to the second test account', () => {
    expect(SERVICE_REQUEST_ASSIGNEE_ID).toBe(SERVICE_REQUEST_TEST_USERS[1].id);
  });
});
