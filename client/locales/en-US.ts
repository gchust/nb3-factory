import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  //
  // The template writes part of its own copy as flat dotted keys (`'status.loading'`) and part as nested groups
  // (`actions: { close }`). The application follows the same convention and uses flat dotted keys, which means a key
  // named here never replaces a system group by accident.

  // Shared wording the system copy does not already define.
  'actions.create': 'Create',
  'actions.saving': 'Saving…',
  'actions.signInAgain': 'Sign in again',
  'status.sessionExpired':
    'Your session has expired. Sign in again to continue.',
  'navigation.materials': 'Materials',
  'navigation.staff': 'Staff',
  'navigation.settings': 'Settings',

  // Internal materials and temporary sharing.
  'materials.title': 'Materials',
  'materials.description':
    'Internal documents and drafts. What you can open follows your work permissions and the sharing a colleague grants you.',
  'materials.search.label': 'Search materials',
  'materials.search.placeholder': 'Search by title or body',
  'materials.fields.title': 'Title',
  'materials.fields.body': 'Body',
  'materials.fields.ownerName': 'Owner',
  'materials.fields.published': 'Published',
  'materials.fields.confidential': 'Confidential',
  'materials.fields.updatedAt': 'Updated',
  'materials.publish.published': 'Published',
  'materials.publish.draft': 'Draft',
  'materials.confidentiality.confidential': 'Confidential',
  'materials.confidentiality.public': 'Internal',
  'materials.filters.published': 'Publication',
  'materials.filters.allPublished': 'Any publication state',
  'materials.filters.confidential': 'Confidentiality',
  'materials.filters.allConfidential': 'Any confidentiality',
  'materials.filters.clear': 'Clear filters',
  'materials.actions.label': 'Actions',
  'materials.actions.more': 'Actions for {{name}}',
  'materials.actions.edit': 'Edit',
  'materials.actions.delete': 'Delete',
  'materials.actions.share': 'Sharing',
  'materials.create.action': 'New material',
  'materials.create.title': 'New material',
  'materials.create.description': 'Write and save a new internal material.',
  'materials.create.success': 'Material created.',
  'materials.edit.title': 'Edit material',
  'materials.edit.success': 'Material saved.',
  'materials.delete.title': 'Delete material',
  'materials.delete.description': 'Delete “{{title}}”? This cannot be undone.',
  'materials.delete.deleting': 'Deleting…',
  'materials.delete.success': 'Material deleted.',
  'materials.detail.title': 'Material',
  'materials.detail.noBody': 'This material has no body yet.',
  'materials.capNotice_one':
    'Showing {{count}} material; refine the search to find the rest.',
  'materials.capNotice_other':
    'Showing {{count}} materials; refine the search to find the rest.',
  'materials.empty.title': 'No materials yet',
  'materials.empty.description': 'Materials published to you appear here.',
  'materials.empty.noResults': 'No materials match the current search.',
  'materials.error.title': 'Unable to load materials',
  'materials.error.forbidden':
    'You do not have permission to view these materials.',
  'materials.error.notFound':
    'This material does not exist or is not available to you.',
  'materials.error.requestFailed': 'Something went wrong. Please try again.',
  'materials.form.description': 'Write and save this material.',
  'materials.form.titleRequired': 'A title is required.',
  'materials.form.titleTooLong': 'Use at most {{max}} characters.',
  'materials.form.bodyTooLong': 'Use at most {{max}} characters.',
  'materials.form.publishedHint':
    'Published materials are readable by colleagues with reading permission. Unpublished drafts stay visible only to you.',
  'materials.form.confidentialHint':
    'Confidential materials are never shown to readers, even when a colleague shares one with them.',
  'materials.shares.title': 'Temporary sharing',
  'materials.shares.description':
    'Open this material to one colleague beyond its usual audience. Revoking it takes the material away on their next refresh.',
  'materials.shares.hint':
    'Sharing grants reading only. It never grants editing.',
  'materials.shares.selectUser': 'Select a colleague',
  'materials.shares.selectUserPlaceholder': 'Choose a colleague',
  'materials.shares.add.action': 'Open access',
  'materials.shares.add.adding': 'Opening…',
  'materials.shares.add.success': 'The material is now open to that colleague.',
  'materials.shares.noCandidates':
    'Everyone who can be given access already has it.',
  'materials.shares.current': 'Currently open to',
  'materials.shares.empty':
    'This material is not open to anyone beyond its usual audience.',
  'materials.shares.remove.label': 'Close access for {{name}}',
  'materials.shares.remove.success': 'Access revoked.',

  // Staff and work permissions.
  'staff.title': 'Staff',
  'staff.description':
    'The people in this application, their work permissions and their account state.',
  'staff.search.label': 'Search staff',
  'staff.search.placeholder': 'Search by name, username or email',
  'staff.filters.clear': 'Clear search',
  'staff.fields.name': 'Name',
  'staff.fields.email': 'Email',
  'staff.fields.permissionSets': 'Work permissions',
  'staff.fields.status': 'Account',
  'staff.status.enabled': 'Active',
  'staff.status.disabled': 'Left',
  'staff.status.saving': 'Saving…',
  'staff.status.disable.title': 'Disable this account',
  'staff.status.disable.description':
    'Disable {{name}}? They lose access immediately, including any session already signed in.',
  'staff.status.disable.action': 'Disable',
  'staff.status.disable.success': 'Account disabled.',
  'staff.status.enable.title': 'Enable this account',
  'staff.status.enable.description':
    'Enable {{name}} so they can sign in again?',
  'staff.status.enable.action': 'Enable',
  'staff.status.enable.success': 'Account enabled.',
  'staff.actions.label': 'Actions',
  'staff.actions.more': 'Actions for {{name}}',
  'staff.actions.roles': 'Work permissions',
  'staff.empty.title': 'No staff',
  'staff.empty.description': 'People appear here once they have an account.',
  'staff.empty.noResults': 'No one matches the current search.',
  'staff.error.title': 'Unable to load staff',
  'staff.error.forbidden': 'You do not have permission to manage staff.',
  'staff.error.requestFailed': 'Something went wrong. Please try again.',
  'staff.roles.title': 'Work permissions',
  'staff.roles.description':
    'Choose the materials permissions {{name}} works with.',
  'staff.roles.locked':
    'This account has a protected built-in permission that cannot be changed here.',
  'staff.roles.notFound':
    'This person is no longer available. Close this dialog and refresh the list.',
  'staff.roles.success': 'Work permissions saved.',
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
