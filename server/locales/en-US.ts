import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. Keys mirror the client's `devices` group so the same phrase is not
// written twice in different words; the template's own server text belongs to plugins and stays empty here.
const enUS = {
  devices: {
    errors: {
      codeTaken: 'A device with this code already exists.',
      notFound: 'The device does not exist.',
      requestFailed: 'The request could not be completed.',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
