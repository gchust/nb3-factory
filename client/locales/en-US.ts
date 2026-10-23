import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  materials: {
    pageTitle: 'Materials',
    pageDescription:
      'Published material is open to every colleague; drafts are visible only to their owner until an administrator opens one of them, and confidential material stays with its owner.',
    title: 'Title',
    body: 'Body',
    owner: 'Owner',
    status: 'Status',
    actions: 'Actions',
    published: 'Published',
    draft: 'Draft',
    confidential: 'Confidential',
    view: 'View',
    edit: 'Edit',
    create: 'New material',
    createTitle: 'New material',
    editTitle: 'Edit material',
    formDescription:
      'The owner is recorded automatically. Mark a draft published to open it to colleagues, or confidential to keep it with its owner.',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    deleteTitle: 'Delete this material?',
    deleteDescription: '“{{title}}” will be removed. This cannot be undone.',
    deleted: 'Material deleted',
    saved: 'Saved',
    loading: 'Loading…',
    emptyTitle: 'No materials yet',
    emptyDescription:
      'Nothing here is readable with the current grants, or the library is still empty.',
    noBody: 'This material has no body yet.',
    shares: 'Share access',
    shareHint:
      'A shared reader can read this material until the share is revoked.',
    confidentialShareHint:
      'Confidential material never opens to a shared reader; only its owner keeps access.',
    noShares: 'Nobody else may read this material yet.',
    shareTarget: 'Reader',
    noTargets: 'No enabled account is left to share with.',
    grant: 'Grant access',
    revoke: 'Revoke',
    shareGranted: 'Access granted',
    shareRevoked: 'Access revoked',
    denied: 'You do not have permission for that.',
    failed: 'The request failed.',
    sharing: {
      ruleTitle: 'Open one material to one reader',
    },
    // Authorization titles, resolved from the server's `{ key, ns }` references.
    resourceTitle: 'Materials',
    permission: {
      view: 'View materials',
      create: 'Create materials',
      edit: 'Edit materials',
      delete: 'Delete materials',
    },
    action: {
      view: 'View',
      create: 'Create',
      edit: 'Edit',
      delete: 'Delete',
    },
    recordAccess: {
      public: 'Published, non-confidential materials',
      publicHint:
        'Every signed-in colleague may read published material that is not confidential.',
      nonConfidential: 'Non-confidential materials',
      nonConfidentialHint:
        'Confidential material is excluded even when a share names it.',
    },
    rules: {
      confidential: 'Confidential material stays with its owner',
    },
    permissionSets: {
      contributor: 'Materials contributor',
      reader: 'Materials reader',
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
