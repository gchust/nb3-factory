import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import type { FileRecord } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Upload } from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

import {
  attachmentContentUrl,
  listOrderAttachments,
  removeOrderAttachment,
  uploadOrderAttachment,
} from '@/api/service';
import { FILE_CATEGORIES, type ServiceOrderFile } from '@/api/service-types';
import { FileList } from '@/extensions/nocobase-file-component-ui';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useServiceResource } from '@/hooks/use-service-resource';

import type { OrderSectionProps } from './types.js';

/**
 * The order's photos and reports.
 *
 * The bytes are served by this application's own authenticated route rather
 * than by the file plugin's public one, so the URL the preview component is
 * given carries the order and the file and every read is authorized again.
 */
export function OrderAttachments({ order }: OrderSectionProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>('photo');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      listOrderAttachments(client, order.id, signal),
    [order.id],
  );
  const files = useServiceResource(`service-order-files:${order.id}`, load);

  async function refresh(): Promise<void> {
    files.reload();
  }

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOrderAttachment(api, order.id, file, category);
      toaster.show({
        type: 'success',
        title: t('service.orders.attachmentUploaded'),
      });
      await refresh();
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: FileRecord): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await removeOrderAttachment(api, order.id, file.id);
      await refresh();
    } catch (removeError) {
      setError(removeError);
    } finally {
      setBusy(false);
    }
  }

  const records: readonly FileRecord[] = (files.data ?? []).map(
    (row: ServiceOrderFile) => ({
      id: row.id,
      disk: row.disk,
      key: row.key,
      filename: row.filename,
      ext: row.ext,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      contentUrl: attachmentContentUrl(order.id, row.id),
    }),
  );

  return (
    <div className='space-y-3'>
      {files.error ? (
        <ServiceErrorNotice error={files.error} onRetry={files.reload} />
      ) : null}
      {error ? <ServiceErrorNotice error={error} /> : null}

      <div className='flex flex-wrap items-end gap-3'>
        <FormField
          htmlFor='attachment-category'
          label={t('service.orders.attachmentCategory')}
        >
          <SelectControl
            id='attachment-category'
            onChange={setCategory}
            options={FILE_CATEGORIES.map((value) => ({
              value,
              label: t(`service.fileCategory.${value}`),
            }))}
            value={category}
          />
        </FormField>
        <input
          accept='.png,.docx'
          className='hidden'
          onChange={(event) => {
            void upload(event);
          }}
          ref={inputRef}
          type='file'
        />
        <Button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          size='sm'
          variant='outline'
        >
          {busy ? (
            <Spinner aria-hidden='true' />
          ) : (
            <Upload aria-hidden='true' />
          )}
          {t('service.orders.attachmentUpload')}
        </Button>
      </div>

      <FileList
        emptyState={t('service.orders.attachmentEmpty')}
        files={records}
        labels={{ empty: t('service.common.empty') }}
        onError={(fileError) => setError(fileError)}
        onRemove={(file) => {
          void remove(file);
        }}
      />
    </div>
  );
}
