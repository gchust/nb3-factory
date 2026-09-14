import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Preview smoke',
    description:
      'Confirms this preview environment can sign in and read and write data. The card shows build information provided by the server; the counter grows in the database.',
    retry: 'Retry',
    buildInfo: {
      title: 'Build information',
      name: 'Application name',
      startedAt: 'Server started at',
      nodeVersion: 'Node version',
      loading: 'Loading build information…',
      error: 'Could not load build information.',
    },
    visits: {
      title: 'Visit count',
      label: 'Total visits',
      loading: 'Loading the visit count…',
      error: 'Could not load the visit count.',
    },
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
