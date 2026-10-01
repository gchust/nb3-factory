import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. It carries the text the server
// produces without a browser to read a client locale: the notifications the
// scheduled maintenance tasks send, which must follow the application language
// rather than a plugin's namespace. Use `overrides` to reword a plugin's text.
const enUS = {
  service: {
    notification: {
      overdue: {
        title: 'Work order {{code}} is overdue',
        body: 'Please handle the overdue work order as soon as possible.',
      },
      inspectionAssigned: {
        title: 'New inspection task',
        body: 'Device {{device}} is due for inspection on {{date}}.',
      },
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
