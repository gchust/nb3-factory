import type { FileUiLabels } from '@/extensions/nocobase-file-component-ui/types';

/**
 * Fully localized UI labels for the File controls, built from the application
 * locale files. Every label key maps to `contracts.files.*`.
 */
export function fileUiLabels(t: (key: string) => string): FileUiLabels {
  return {
    choose: t('contracts.files.choose'),
    empty: t('contracts.files.empty'),
    preview: t('contracts.files.preview'),
    download: t('contracts.files.download'),
    remove: t('contracts.files.remove'),
    retry: t('contracts.files.retry'),
    done: t('contracts.files.done'),
    uploading: t('contracts.files.uploading'),
    pending: t('contracts.files.pending'),
    failed: t('contracts.files.failed'),
    cancel: t('contracts.files.cancel'),
    previous: t('contracts.files.previous'),
    next: t('contracts.files.next'),
    tooMany: t('contracts.files.tooMany'),
    tooLarge: t('contracts.errors.CONTRACT_FILE_TOO_LARGE'),
    typeNotAllowed: t('contracts.files.typeNotAllowed'),
    urlNotAllowed: t('contracts.files.urlNotAllowed'),
    removeFailed: t('contracts.files.removeFailed'),
    uploadFailed: t('contracts.files.uploadFailed'),
    loading: t('contracts.files.loading'),
    loadFailed: t('contracts.files.loadFailed'),
    downloadFile: t('contracts.files.downloadFile'),
    previewUnavailable: t('contracts.files.previewUnavailable'),
    officeFailed: t('contracts.files.officeFailed'),
    officeRequiresUrl: t('contracts.files.officeRequiresUrl'),
  };
}
