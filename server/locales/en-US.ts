import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording: validation and business errors the browser receives.
const enUS = {
  devices: {
    errors: {
      codeTaken: 'A device with code "{{code}}" already exists.',
      notFound: 'This device no longer exists.',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
