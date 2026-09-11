import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
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
    remove: 'Remove',
    retry: 'Retry',
    preview: 'Preview',
    download: 'Download',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    equipment: 'Equipment',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  equipment: {
    status: {
      running: 'Running',
      maintenance: 'Maintenance',
      stopped: 'Stopped',
      scrapped: 'Scrapped',
    },
    conclusion: {
      normal: 'Normal',
      issue: 'Issue found',
      major: 'Major fault',
    },
    fields: {
      deviceNo: 'Device number',
      name: 'Name',
      location: 'Location',
      status: 'Status',
      owner: 'Owner',
      remark: 'Remark',
    },
    deleting: 'Deleting…',
    files: {
      chooseImage: 'Choose main image',
      chooseDocuments: 'Choose documents',
      choosePhotos: 'Choose photos',
    },
    form: {
      createTitle: 'New equipment',
      editTitle: 'Edit equipment',
      description:
        'Keep the archive complete: device number, status and files.',
      mainImage: 'Main image (one)',
      documents: 'Documents (many)',
      required: 'Device number, name and location are required.',
      deviceNoTaken: 'This device number is already in use.',
      saveFailed: 'Saving failed. Please try again.',
      saving: 'Saving…',
    },
    inspectionForm: {
      createTitle: 'New inspection',
      editTitle: 'Edit inspection',
      description: 'Record the inspection result and attach site photos.',
      inspectedAt: 'Inspection time',
      inspector: 'Inspector',
      conclusion: 'Conclusion',
      photos: 'Site photos (many)',
      required: 'Inspection time and inspector are required.',
      saveFailed: 'Saving failed. Please try again.',
    },
    list: {
      title: 'Equipment archive',
      subtitle: 'Browse, create and maintain the equipment archive.',
      new: 'New equipment',
      searchPlaceholder: 'Search device number, name or location',
      allStatuses: 'All statuses',
      loading: 'Loading equipment…',
      empty: 'No equipment matches. Create the first record.',
      counts: 'Files / inspections',
      actions: 'Actions',
      view: 'View detail',
      edit: 'Edit',
      delete: 'Delete',
      loadFailed: 'Unable to load the equipment list.',
      deleteFailed: 'Unable to delete the equipment record.',
      documentsCount: '{{count}} docs',
      inspectionsCount: '{{count}} inspections',
    },
    detail: {
      title: 'Equipment detail',
      invalidId: 'The equipment id is invalid.',
      loadFailed: 'Unable to load the equipment record.',
      notFound: 'The equipment record does not exist or was deleted.',
      loading: 'Loading equipment…',
      back: 'Back to archive',
      edit: 'Edit',
      delete: 'Delete',
      overview: 'Overview',
      documents: 'Documents',
      noDocuments: 'No documents attached yet — edit the record to add them.',
      inspections: 'Inspection records',
      newInspection: 'New inspection',
      noInspections: 'No inspections recorded yet.',
      noPhotos: 'No site photos.',
      editInspection: 'Edit inspection',
      deleteInspection: 'Delete inspection',
      fileDeleteFailed: 'Unable to delete the file.',
      deleteInspectionFailed: 'Unable to delete the inspection record.',
    },
    deleteDialog: {
      title: 'Delete equipment?',
      description:
        'Delete {{deviceNo}}? Its inspections and attached files are removed as well.',
      confirm: 'Delete',
    },
    deleteInspectionDialog: {
      title: 'Delete inspection?',
      description:
        'Delete the inspection from {{date}}? Its photos are removed as well.',
      confirm: 'Delete',
    },
    deleteEquipmentDialog: {
      title: 'Delete equipment?',
      description:
        'Delete {{deviceNo}}? Its inspections and attached files are removed as well.',
      confirm: 'Delete',
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
