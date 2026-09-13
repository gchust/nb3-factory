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
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    products: 'Product gallery',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  products: {
    title: 'Product gallery',
    description: 'Manage products, their descriptions and product images.',
    newProduct: 'New product',
    empty: 'No products yet. Create the first one.',
    edit: 'Edit',
    save: 'Save product',
    backToList: 'Back to gallery',
    pages: {
      newTitle: 'New product',
      editTitle: 'Edit product',
    },
    fields: {
      name: 'Product name',
      description: 'Description',
      images: 'Product images',
    },
    form: {
      chooseImages: 'Choose images',
      imagesHint:
        'Select one or more images; the first one becomes the list thumbnail. Up to 5 MiB each.',
    },
    files: {
      choose: 'Choose files',
      empty: 'No images yet.',
      preview: 'View',
      download: 'Download',
      remove: 'Remove',
      retry: 'Retry',
      done: 'Uploaded',
      uploading: 'Uploading…',
      pending: 'Pending',
      failed: 'Failed',
      cancel: 'Cancel upload',
      previous: 'Previous image',
      next: 'Next image',
      tooMany: 'The maximum number of images has been reached.',
      typeNotAllowed: 'This file type is not allowed.',
      urlNotAllowed: 'The image URL is not allowed.',
      removeFailed: 'Removing the image failed.',
      uploadFailed: 'Uploading the image failed.',
      loading: 'Loading preview…',
      loadFailed: 'The image failed to load.',
      downloadFile: 'Download image',
      previewUnavailable: 'Preview is unavailable for this file.',
      officeFailed: 'Could not preview this office document.',
      officeRequiresUrl:
        'Office document preview requires an internet-accessible URL.',
    },
    errors: {
      INTERNAL_ERROR: 'Something went wrong. Please try again later.',
      PRODUCT_NOT_FOUND: 'Product not found.',
      PRODUCT_NAME_REQUIRED: 'Product name is required.',
      PRODUCT_ID_INVALID: 'The product parameter is invalid.',
      PRODUCT_VALUES_REQUIRED: 'Product data cannot be empty.',
      PRODUCT_BODY_INVALID: 'Request data is not well-formed.',
      PRODUCT_IMAGE_NOT_FOUND:
        'A selected image no longer exists and cannot be saved.',
      PRODUCT_IMAGE_IN_USE:
        'One or more images already belong to another product.',
      PRODUCT_FILE_TOO_LARGE: 'A single file may not exceed 5 MiB.',
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
