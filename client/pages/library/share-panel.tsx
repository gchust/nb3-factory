import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Trash2Icon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

import {
  createShare,
  deleteShare,
  fetchRecipients,
  fetchShares,
} from './api.js';
import { libraryErrorKey } from './errors.js';
import type {
  LibraryDocument,
  LibraryRecipient,
  LibraryShare,
} from './types.js';

export interface SharePanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Every document the administrator can choose from. */
  readonly documents: readonly LibraryDocument[];
}

const NO_RECIPIENT = '__none__';

/**
 * Temporary sharing for administrators.
 *
 * Opening a document to one colleague creates a sharing rule that names that
 * account alone — never all of an author's drafts — and revoking deletes it.
 * The list is read back from the server, which is the single source of truth
 * for who can currently see what.
 */
export function SharePanel({
  open,
  onOpenChange,
  documents,
}: SharePanelProps): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const [shares, setShares] = useState<LibraryShare[]>([]);
  const [recipients, setRecipients] = useState<LibraryRecipient[]>([]);
  const [documentId, setDocumentId] = useState<string>('');
  const [recipientId, setRecipientId] = useState<string>(NO_RECIPIENT);
  const [busy, setBusy] = useState(false);

  // The first document is the default selection. Deriving it instead of
  // writing it back into state keeps the choice in one place and avoids
  // resetting it from an effect.
  const effectiveDocumentId =
    documentId || (documents.length > 0 ? String(documents[0].id) : '');

  const reload = useCallback(
    (): Promise<void> =>
      Promise.all([fetchShares(api), fetchRecipients(api)]).then(
        ([nextShares, nextRecipients]) => {
          setShares(nextShares);
          setRecipients(nextRecipients);
        },
        (error: unknown) => {
          toaster.show({
            type: 'error',
            title: t(libraryErrorKey(error, 'library.actionFailed')),
          });
        },
      ),
    [api, toaster, t],
  );

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const grant = async (): Promise<void> => {
    if (!effectiveDocumentId || recipientId === NO_RECIPIENT) {
      toaster.show({ type: 'error', title: t('library.share.chooseBoth') });
      return;
    }
    setBusy(true);
    try {
      await createShare(api, Number(effectiveDocumentId), recipientId);
      setRecipientId(NO_RECIPIENT);
      await reload();
      toaster.show({ type: 'success', title: t('library.share.granted') });
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t(libraryErrorKey(error, 'library.actionFailed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: string): Promise<void> => {
    try {
      await deleteShare(api, key);
      await reload();
      toaster.show({ type: 'success', title: t('library.share.revoked') });
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t(libraryErrorKey(error, 'library.actionFailed')),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('library.share.title')}</DialogTitle>
          <DialogDescription>
            {t('library.share.description')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='library-share-document'>
                {t('library.share.document')}
              </FieldLabel>
              <Select
                value={effectiveDocumentId}
                onValueChange={(value) => setDocumentId(value ?? '')}
              >
                <SelectTrigger id='library-share-document' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((document) => (
                    <SelectItem key={document.id} value={String(document.id)}>
                      {document.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='library-share-recipient'>
                {t('library.share.recipient')}
              </FieldLabel>
              <Select
                value={recipientId}
                onValueChange={(value) => setRecipientId(value ?? NO_RECIPIENT)}
              >
                <SelectTrigger id='library-share-recipient' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RECIPIENT}>
                    {t('library.share.chooseRecipient')}
                  </SelectItem>
                  {recipients.map((recipient) => (
                    <SelectItem key={recipient.id} value={recipient.id}>
                      {recipient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Button
            type='button'
            onClick={() => void grant()}
            disabled={busy || documents.length === 0}
          >
            {t('library.share.grant')}
          </Button>
        </FieldGroup>
        <Separator />
        <div className='space-y-2'>
          <h3 className='text-sm font-medium'>{t('library.share.current')}</h3>
          {shares.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('library.share.empty')}
            </p>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {shares.map((share) => (
                <li
                  key={share.key}
                  className='flex items-center justify-between gap-4 px-3 py-2 text-sm'
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>
                      {share.documentTitle ?? `#${share.documentId}`}
                    </p>
                    <p className='truncate text-muted-foreground'>
                      {share.recipientName ?? share.recipientId}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => void revoke(share.key)}
                  >
                    <Trash2Icon data-icon='inline-start' />
                    {t('library.share.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
