import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { UserMinusIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import {
  addDocumentShare,
  getDocument,
  listDocumentShares,
  listShareCandidates,
  removeDocumentShare,
} from './api.js';
import type {
  DocumentDetailOutletContext,
  DocumentsOutletContext,
  DocumentShareCandidate,
  DocumentShareSummary,
  DocumentSummary,
} from './types.js';

/**
 * Temporarily opening one document to one person, and closing that again.
 *
 * Sharing a draft is an administrative action, so the entry is only offered to someone the server treats as
 * unrestricted; the endpoint enforces the same rule. The dialog is its own child route under both the list and the
 * detail drawer, so it stacks on whichever the person is looking at.
 */
export default function ShareDocumentPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const toaster = useToaster();
  const { documentId } = useParams<{ documentId: string }>();
  const context = useOutletContext<
    DocumentDetailOutletContext | DocumentsOutletContext
  >();
  const [document, setDocument] = useState<DocumentSummary>();
  const [shares, setShares] = useState<DocumentShareSummary[]>();
  const [candidates, setCandidates] = useState<DocumentShareCandidate[]>([]);
  const [selected, setSelected] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRef = useRef(false);

  const reloadSources = useCallback((): void => {
    if ('reloadDocument' in context) {
      context.reloadDocument();
      context.reloadList();
    } else {
      context.reload();
    }
  }, [context]);

  const loadShares = useCallback(
    async (id: string): Promise<void> => {
      const [row, current] = await Promise.all([
        getDocument(api, id),
        listDocumentShares(api, id),
      ]);
      setDocument(row);
      setShares(current);
    },
    [api],
  );

  // The first load sets state only from the request's continuation, so nothing updates in the effect body itself.
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    void Promise.all([
      getDocument(api, documentId),
      listDocumentShares(api, documentId),
      listShareCandidates(api),
    ])
      .then(([row, current, users]) => {
        if (cancelled) return;
        setDocument(row);
        setShares(current);
        setCandidates(users);
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(shareError(t, caught));
      });
    return () => {
      cancelled = true;
    };
  }, [api, documentId, t]);

  const handleShare = async (): Promise<void> => {
    if (!documentId || !selected) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await addDocumentShare(api, documentId, selected);
      setSelected(undefined);
      await loadShares(documentId);
      toaster.show({ type: 'success', title: t('library.share.added') });
      reloadSources();
    } catch (caught: unknown) {
      const message = shareError(t, caught);
      setError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const handleRevoke = async (userId: string): Promise<void> => {
    if (!documentId) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await removeDocumentShare(api, documentId, userId);
      await loadShares(documentId);
      toaster.show({ type: 'success', title: t('library.share.revoked') });
      reloadSources();
    } catch (caught: unknown) {
      const message = shareError(t, caught);
      setError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const staleDocument = document !== undefined && document.id !== documentId;
  const loading = (shares === undefined || staleDocument) && !error;
  const alreadyShared = new Set((shares ?? []).map((share) => share.userId));
  const available = candidates.filter(
    (candidate) =>
      candidate.id !== document?.ownerId && !alreadyShared.has(candidate.id),
  );
  const items = available.map((candidate) => ({
    value: candidate.id,
    label: `${candidate.name} (${candidate.email})`,
  }));

  return (
    <RouteDialog
      title={t('library.share.title')}
      description={document ? document.title : t('library.share.description')}
      className='sm:max-w-lg'
      beforeClose={() => !pendingRef.current}
      footer={
        <ShareDocumentFooter
          pending={pending}
          disabled={loading || available.length === 0 || !selected}
          onShare={() => void handleShare()}
        />
      }
    >
      <div className='flex flex-col gap-6'>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription role='alert'>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Loading className='py-10' />
        ) : (
          <>
            <div className='flex flex-col gap-2'>
              <label
                className='text-sm font-medium'
                htmlFor='document-share-user'
              >
                {t('library.share.person')}
              </label>
              {available.length ? (
                <Select
                  items={items}
                  value={selected ?? null}
                  onValueChange={(value) => setSelected(value ?? undefined)}
                >
                  <SelectTrigger
                    id='document-share-user'
                    className='w-full'
                    disabled={pending}
                  >
                    <SelectValue
                      placeholder={t('library.share.personPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('library.share.noCandidates')}
                </p>
              )}
            </div>
            <div className='flex flex-col gap-2'>
              <h3 className='text-sm font-medium'>
                {t('library.share.current')}
              </h3>
              {shares && shares.length ? (
                <ul className='divide-y rounded-lg border'>
                  {shares.map((share) => (
                    <li
                      key={share.userId}
                      className='flex items-center justify-between gap-3 p-3 text-sm'
                    >
                      <span className='min-w-0 truncate'>
                        {share.name ??
                          share.username ??
                          share.email ??
                          share.userId}
                      </span>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={pending}
                        onClick={() => void handleRevoke(share.userId)}
                      >
                        <UserMinusIcon data-icon='inline-start' />
                        {t('library.share.revoke')}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('library.share.none')}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </RouteDialog>
  );
}

function ShareDocumentFooter({
  pending,
  disabled,
  onShare,
}: {
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onShare: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={pending}
        onClick={() => void close()}
      >
        {t('actions.close')}
      </Button>
      <Button type='button' disabled={disabled} onClick={onShare}>
        {pending ? <Spinner data-icon='inline-start' /> : null}
        {pending ? t('library.share.sharing') : t('library.share.share')}
      </Button>
    </>
  );
}

function shareError(t: (key: string) => string, error: unknown): string {
  const apiError = error instanceof ApiClientError ? error : undefined;
  if (apiError?.reason === 'CONFIDENTIAL_DOCUMENT') {
    return t('library.share.confidential');
  }
  if (apiError?.status === 403) return t('library.share.forbidden');
  if (apiError?.status === 401) return t('library.form.forbidden');
  return t('library.share.failed');
}
