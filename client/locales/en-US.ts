import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  announcements: {
    title: 'Announcements',
    description:
      'Share updates with the team. New announcements appear at the top.',
    form: {
      heading: 'New announcement',
      titleLabel: 'Title',
      titlePlaceholder: 'A short summary',
      bodyLabel: 'Body',
      bodyPlaceholder: 'Write the announcement…',
      submit: 'Publish',
      submitting: 'Publishing…',
    },
    list: {
      heading: 'Published announcements',
      empty: 'No announcements yet. Publish the first one.',
      loading: 'Loading announcements',
      created: 'Created {{date}}',
    },
    error: {
      load: 'Unable to load announcements.',
      create: 'Unable to publish the announcement.',
      titleRequired: 'Enter a title.',
      titleTooLong: 'Keep the title under 200 characters.',
      bodyRequired: 'Enter a body.',
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
    announcements: 'Announcements',
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
