import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. Add keys here as the application starts producing its
// own messages; use `overrides` to reword a plugin's.
const enUS = {
  media: {
    error: {
      typeNotAllowed:
        'This file type is not allowed. Upload an image, audio, video, PDF, text or Markdown file.',
      mimeNotAllowed: 'This file type is not allowed for security reasons.',
      tooLarge: 'The file is larger than the {{maxMb}} MB limit.',
      invalidFile: 'Select a file to upload.',
      notFound: 'The media asset was not found.',
      forbidden: 'You do not have permission to perform this action.',
      fileNotFound: 'The uploaded file could not be found.',
      fileAlreadyLinked: 'This file is already in the media library.',
      invalidName: 'A name is required.',
      invalidStatus: 'That status is not supported.',
      uploadFailed: 'The upload failed. Please try again.',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
