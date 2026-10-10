import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording: the titles the authorization
// administration surfaces show for this application's Collection, composite
// resource, record-access rule, workspace section and permission sets.
const enUS = {
  recordAccess: {
    viewable: 'Viewable materials',
    viewableDescription: 'May read the materials filed as non-confidential.',
  },
  composite: {
    title: 'Internal materials',
    view: 'Read materials',
    edit: 'Manage materials',
  },
  collection: {
    title: 'Materials',
  },
  ui: {
    section: 'Internal materials',
  },
  permissionSets: {
    colleague: 'Materials reader',
    supervisor: 'Materials supervisor',
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
