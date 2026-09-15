import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  media: {
    types: {
      image: 'Image',
      audio: 'Audio',
      video: 'Video',
      document: 'Document',
    },
    status: {
      available: 'Available',
      disabled: 'Disabled',
    },
    fields: {
      file: 'File',
      name: 'Name',
      type: 'Type',
      tags: 'Tags',
      size: 'Size',
      status: 'Status',
      filename: 'File name',
      mimeType: 'Content type',
      uploader: 'Uploaded by',
      uploadedAt: 'Uploaded at',
    },
    list: {
      title: 'Media library',
      description:
        'Upload images, audio, video, PDF, text and Markdown files, tag them, and find them by type or tag.',
      new: 'New asset',
      filterName: 'Name',
      filterNamePlaceholder: 'Search by name',
      filterTag: 'Tag',
      filterTagPlaceholder: 'Tag',
      filterType: 'Type',
      allTypes: 'All types',
      apply: 'Search',
      reset: 'Reset',
      preview: 'Preview',
      noTags: 'No tags',
      loading: 'Loading media assets…',
      empty: 'No media assets match your filters.',
      pageOf: 'Page {{page}} of {{total}}',
      previous: 'Previous',
      next: 'Next',
      loadFailed: 'Unable to load the media library.',
    },
    form: {
      back: 'Back to library',
      title: 'Upload a media asset',
      description:
        'Choose a local file, give it a name, and add tags so the team can find it.',
      chooseFile: 'Choose file',
      removeFile: 'Remove',
      retryFile: 'Retry',
      allowedHint:
        'Allowed types: {{extensions}}. Maximum size: {{maxMb}} MB. HTML, SVG, XML and other types are refused.',
      detectedType: 'Detected type:',
      unknownType: 'This file type is not supported.',
      namePlaceholder: 'Display name',
      tagsPlaceholder: 'marketing, launch',
      tagsHint: 'Separate tags with commas.',
      chooseFileFirst: 'Choose a file to upload.',
      save: 'Save asset',
      saving: 'Saving…',
      saveFailed: 'Unable to save the media asset.',
    },
    detail: {
      back: 'Back to library',
      loading: 'Loading media asset…',
      loadFailed: 'Unable to load the media asset.',
      edit: 'Edit',
      editTitle: 'Edit media asset',
      preview: 'Preview',
      openPreview: 'Open preview',
      previewHint:
        'Images open enlarged, PDF, text and Markdown render in the page, and audio and video play directly.',
      noPreview: 'No preview is available for this file.',
      information: 'Information',
      noTags: 'No tags',
      unknownUploader: 'Unknown',
      disabledHint:
        'This asset is disabled. Only administrators and media managers can see it or open its file address.',
      download: 'Download',
    },
    stats: {
      title: 'Media statistics',
      description: 'Asset count and total volume grouped by media type.',
      loading: 'Loading statistics…',
      loadFailed: 'Unable to load the statistics.',
      totalAssets: 'Total assets',
      totalSize: 'Total volume',
      count: 'Assets',
      volume: 'Volume',
      total: 'Total',
    },
    error: {
      typeNotAllowed:
        'This file type is not allowed. Upload an image, audio, video, PDF, text or Markdown file.',
      mimeNotAllowed: 'This file type is not allowed for security reasons.',
      tooLarge: 'The file is larger than the {{maxMb}} MB limit.',
      fileNotFound: 'The uploaded file could not be found.',
      fileAlreadyLinked: 'This file is already in the media library.',
      invalidName: 'A name is required.',
      invalidStatus: 'That status is not supported.',
      notFound: 'The media asset was not found.',
      forbidden: 'You do not have permission to perform this action.',
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
    mediaAssets: 'Media library',
    mediaStats: 'Media statistics',
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
