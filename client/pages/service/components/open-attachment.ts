import type { Toaster } from '@nocobase/app-client';

import { errorMessage, type ServiceApi } from '../service-api.js';
import type { ServiceAttachment } from '../types.js';

/**
 * Reads an attachment's bytes through the authenticated client before opening
 * it. A plain link would leave the session cookie out of the request and the
 * server would refuse the read, so preview and download both start here.
 */
export async function openAttachment(
  api: ServiceApi,
  attachment: ServiceAttachment,
  mode: 'preview' | 'download',
  toaster: Toaster,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<void> {
  let url: string | undefined;
  try {
    url = await api.openAttachment(attachment.id);
    if (mode === 'preview') {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attachment.filename;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    toaster.show({
      type: 'error',
      title: t('service.attachments.openFailed'),
      description: errorMessage(error),
    });
  } finally {
    const objectUrl = url;
    if (objectUrl && mode === 'download') {
      // Give the browser a moment to start the download before revoking.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    }
  }
}
