import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: {
    ...systemEnUS.navigation,
    materials: 'Materials',
    libraryAdmin: 'Library administration',
  },
  library: {
    title: 'Materials',
    description:
      'Documents you can read. Published materials are open to your colleagues; drafts stay with their owner.',
    create: 'New material',
    owner: 'Owner',
    list: {
      emptyTitle: 'Nothing to read yet',
      emptyDescription: 'No material is published or shared with you.',
    },
    error: {
      title: 'Could not load the materials',
      description: 'The library could not be read. Try again.',
    },
    status: {
      published: 'Published',
      draft: 'Draft',
      confidential: 'Confidential',
      shared: 'Shared with you',
    },
    actions: {
      menu: 'Material actions',
      edit: 'Edit',
      share: 'Manage sharing',
      delete: 'Delete',
    },
    form: {
      createTitle: 'New material',
      editTitle: 'Edit material',
      description:
        'A material is a title and a body. Visibility and confidentiality decide who can read it.',
      title: 'Title',
      titlePlaceholder: 'A short title',
      body: 'Body',
      bodyPlaceholder: 'Write the material…',
      visibility: 'Visibility',
      published: 'Published',
      draft: 'Draft',
      confidentiality: 'Confidentiality',
      confidential: 'Confidential',
      normal: 'Normal',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      titleRequired: 'A title is required.',
    },
    saveFailed: 'Could not save the material.',
    delete: {
      title: 'Delete this material?',
      description: 'The material and every share of it will be removed.',
      confirm: 'Delete',
      cancel: 'Cancel',
    },
    detail: {
      back: 'Back to materials',
      bodyEmpty: 'This material has no body yet.',
      notFoundTitle: 'Material not available',
      notFoundDescription:
        'This material does not exist, or it is not shared with you.',
    },
    share: {
      title: 'Temporary sharing',
      description:
        'Sharing lets one person read a draft. A confidential material stays hidden even when it is shared.',
      empty: 'There is nobody else to share with.',
      grant: 'Share',
      revoke: 'Revoke',
      close: 'Close',
      failed: 'Could not change the sharing.',
    },
    admin: {
      title: 'Library administration',
      description:
        'Who may keep materials, who may only read, and whose account is disabled.',
      members: 'People',
      role: {
        editor: 'Editor',
        reader: 'Reader',
      },
      active: 'Active',
      disabled: 'Disabled',
      disable: 'Disable',
      enable: 'Enable',
      you: 'Administrator',
      actionFailed: 'The change was not applied.',
      roleFailed: 'Could not change the work role.',
      disableFailed: 'Could not disable the account.',
      enableFailed: 'Could not enable the account.',
    },
    forbidden: {
      title: 'Not allowed',
      description: 'Only an administrator can open this page.',
    },
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
