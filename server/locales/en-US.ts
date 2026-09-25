import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording: text the server produces outside a
// request, such as the in-app message the acceptance workflow sends. Use
// `overrides` to reword a plugin's.
const enUS = {
  serviceRequest: {
    notification: {
      title: 'Service request accepted',
      bodyUrgent:
        'Urgent request "{{title}}" was accepted and assigned to you.',
      bodyNormal: 'Request "{{title}}" was accepted and assigned to you.',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
