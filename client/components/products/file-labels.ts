import type { FileUiLabels } from '@/extensions/nocobase-file-component-ui/types';

/**
 * Fully localized UI labels for the File controls, built from the application
 * locale files. Every label key maps to `products.files.*`.
 */
export function productFileLabels(t: (key: string) => string): FileUiLabels {
  return {
    choose: t('products.form.chooseImages'),
    empty: t('products.files.empty'),
    preview: t('products.files.preview'),
    download: t('products.files.download'),
    remove: t('products.files.remove'),
    retry: t('products.files.retry'),
    done: t('products.files.done'),
    uploading: t('products.files.uploading'),
    pending: t('products.files.pending'),
    failed: t('products.files.failed'),
    cancel: t('products.files.cancel'),
    previous: t('products.files.previous'),
    next: t('products.files.next'),
    tooMany: t('products.files.tooMany'),
    tooLarge: t('products.errors.PRODUCT_FILE_TOO_LARGE'),
    typeNotAllowed: t('products.files.typeNotAllowed'),
    urlNotAllowed: t('products.files.urlNotAllowed'),
    removeFailed: t('products.files.removeFailed'),
    uploadFailed: t('products.files.uploadFailed'),
    loading: t('products.files.loading'),
    loadFailed: t('products.files.loadFailed'),
    downloadFile: t('products.files.downloadFile'),
    previewUnavailable: t('products.files.previewUnavailable'),
    officeFailed: t('products.files.officeFailed'),
    officeRequiresUrl: t('products.files.officeRequiresUrl'),
  };
}
