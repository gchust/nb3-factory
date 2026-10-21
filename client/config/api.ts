import {
  defineAppConfig,
  resolveAppUrl,
  type AppConfigFactory,
} from '@nocobase/app-client';

const api: AppConfigFactory<{ baseURL: string; realtimeURL: string }> =
  defineAppConfig((_runtime) => ({
    baseURL: resolveAppUrl('/api'),
    // The realtime endpoint sits beside the application mount path, not beside
    // the API path: state it instead of letting the client derive it from the
    // API base URL, where a differently shaped or absolute API base (a proxy,
    // a CDN, a mount path without `/api`) silently points the socket elsewhere.
    realtimeURL: resolveAppUrl('/ws'),
  }));

export default api;
