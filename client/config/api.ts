import {
  defineAppConfig,
  resolveAppUrl,
  type AppConfigFactory,
} from '@nocobase/app-client';

const api: AppConfigFactory<{ baseURL: string; realtimeURL: string }> =
  defineAppConfig((_runtime) => ({
    baseURL: resolveAppUrl('/api'),
    // Same-origin regardless of how `api.baseURL` is configured. The realtime server refuses a handshake whose
    // Origin differs from its own, so deriving the socket from an absolute API URL can make every connection fail.
    realtimeURL: resolveAppUrl('/ws'),
  }));

export default api;
