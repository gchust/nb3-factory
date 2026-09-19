import { ApiClientError } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';

import {
  deliveryErrorMessage,
  shouldRetryDeliveryRequest,
} from '../../client/lib/delivery';

function apiError(status: number): ApiClientError {
  return new ApiClientError('request failed', {
    status,
    method: 'GET',
    url: '/api/delivery/projects/1',
    payload: { code: 'FORBIDDEN', message: '无权访问该项目。' },
  });
}

describe('shouldRetryDeliveryRequest', () => {
  it('never retries a 4xx answer so the reason reaches the page at once', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetryDeliveryRequest(0, apiError(status))).toBe(false);
    }
  });

  it('retries transient failures up to a small budget', () => {
    expect(shouldRetryDeliveryRequest(0, apiError(500))).toBe(true);
    expect(shouldRetryDeliveryRequest(1, apiError(503))).toBe(true);
    expect(shouldRetryDeliveryRequest(2, apiError(500))).toBe(false);
    expect(shouldRetryDeliveryRequest(0, new Error('network down'))).toBe(true);
  });
});

describe('deliveryErrorMessage', () => {
  it('names a dropped connection in the application language instead of the browser wording', () => {
    // `fetch` rejects with exactly this text when an upload is interrupted, and
    // an English "Failed to fetch" tells the user nothing about the cause.
    expect(deliveryErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '网络连接失败，请检查网络后重试。',
    );
    expect(deliveryErrorMessage(new Error('Load failed'))).toBe(
      '网络连接失败，请检查网络后重试。',
    );
  });

  it('uses the server reason when the response carries one', () => {
    expect(deliveryErrorMessage(apiError(403))).toBe('无权访问该项目。');
  });

  it('translates a server response without a usable message', () => {
    const error = new ApiClientError('Internal Server Error', {
      status: 500,
      method: 'POST',
      url: '/api/deliveryFiles:uploadOne',
    });
    expect(deliveryErrorMessage(error)).toBe('服务暂时不可用，请稍后重试。');
  });

  it('falls back to a generic reason for an unknown failure', () => {
    expect(deliveryErrorMessage(undefined)).toBe('操作失败，请稍后重试。');
  });
});
