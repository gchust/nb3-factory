// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  buildTestRequest,
  CONTROLLED_FAILURE_EMAIL,
  isControlledFailure,
  isTestChannel,
  testRecipient,
  type NotificationTestTarget,
} from '../../client/pages/notification-test/test-target.ts';

const inAppTarget: NotificationTestTarget = {
  channel: { name: 'test-inbox', type: 'in-app', label: 'In-app' },
  provider: { type: 'in-app', label: 'In-app' },
  fields: [
    {
      name: 'recipient',
      label: 'Recipient',
      type: 'text',
      required: true,
      defaultValue: 'Application user ID',
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      defaultValue: 'NocoBase notification test',
    },
    {
      name: 'body',
      label: 'Body',
      type: 'textarea',
      defaultValue: 'This is a test notification from NocoBase.',
    },
  ],
};

const emailTarget: NotificationTestTarget = {
  channel: { name: 'test-failure', type: 'email', label: 'Email' },
  provider: { type: 'smtp', label: 'SMTP' },
  fields: [
    {
      name: 'recipient',
      label: 'Recipient',
      type: 'email',
      required: true,
      defaultValue: 'name@example.com',
    },
    {
      name: 'subject',
      label: 'Subject',
      type: 'text',
      defaultValue: 'NocoBase notification test',
    },
  ],
};

const productionTarget: NotificationTestTarget = {
  channel: { name: 'system-email', type: 'email', label: 'Email' },
  provider: { type: 'smtp', label: 'SMTP' },
  fields: [
    { name: 'recipient', label: 'Recipient', type: 'email', required: true },
  ],
};

describe('notification test destination rules', () => {
  it('offers only channels carrying the test prefix', () => {
    expect(isTestChannel(inAppTarget)).toBe(true);
    expect(isTestChannel(emailTarget)).toBe(true);
    expect(isTestChannel(productionTarget)).toBe(false);
  });

  it('pins the signed-in user inbox for an in-app channel', () => {
    expect(testRecipient(inAppTarget, 'user-123')).toBe('user-123');
  });

  it('pins a reserved address for an email channel', () => {
    expect(testRecipient(emailTarget, 'user-123')).toBe(
      CONTROLLED_FAILURE_EMAIL,
    );
  });

  it('marks only the controlled-failure channel', () => {
    expect(isControlledFailure(emailTarget)).toBe(true);
    expect(isControlledFailure(inAppTarget)).toBe(false);
  });

  it('keeps field defaults and replaces only the recipient', () => {
    expect(buildTestRequest(inAppTarget, 'user-123')).toEqual({
      channel: 'test-inbox',
      values: {
        recipient: 'user-123',
        title: 'NocoBase notification test',
        body: 'This is a test notification from NocoBase.',
      },
    });
  });

  it('does not send the placeholder as the email recipient', () => {
    expect(buildTestRequest(emailTarget, 'user-123')).toEqual({
      channel: 'test-failure',
      values: {
        recipient: CONTROLLED_FAILURE_EMAIL,
        subject: 'NocoBase notification test',
      },
    });
  });
});
