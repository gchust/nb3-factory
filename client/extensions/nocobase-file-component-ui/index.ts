export { FileList } from './components/file-list';
export { FilePreviewDialog } from './components/file-preview-dialog';
// The dialog's body, exported so a page can render the same real preview inline
// (an image, a locally rendered DOCX) instead of only in a modal.
export { FilePreviewBody } from './components/file-preview-dialog';
export { FilePreviewContent } from './components/previewers/file-preview-content';
export { FilePreviewField } from './components/file-preview-field';
export { FileThumbnail } from './components/file-thumbnail';
export { FileUploadField } from './components/file-upload-field';
export type * from './types';
export { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
export type { ClientFileRepository } from '@nocobase/app-plugin-file/client';
