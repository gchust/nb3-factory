import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchIcon, UsersIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';

import {
  getDocument,
  listDocumentShares,
  listShareCandidates,
  setDocumentShares,
} from '../api.js';
import { libraryKeys } from '../queries.js';

export default function ShareLibraryDocumentDialog(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { documentId = '' } = useParams();
  const [editedSelection, setEditedSelection] = useState<
    readonly string[] | null
  >(null);
  const [search, setSearch] = useState('');

  const documentQuery = useQuery({
    queryKey: libraryKeys.document(documentId),
    queryFn: ({ signal }) => getDocument(api, documentId, signal),
    enabled: Boolean(documentId),
  });
  const candidatesQuery = useQuery({
    queryKey: libraryKeys.shareCandidates(),
    queryFn: ({ signal }) => listShareCandidates(api, signal),
  });
  const sharesQuery = useQuery({
    queryKey: libraryKeys.shares(documentId),
    queryFn: ({ signal }) => listDocumentShares(api, documentId, signal),
    enabled: Boolean(documentId),
  });

  const save = useMutation({
    mutationFn: () => setDocumentShares(api, documentId, selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void navigate('/library/manage', { replace: true });
    },
  });

  const loading =
    documentQuery.isPending ||
    candidatesQuery.isPending ||
    sharesQuery.isPending;
  const error =
    documentQuery.error ?? candidatesQuery.error ?? sharesQuery.error;
  const document = documentQuery.data;
  const confidential = Boolean(document?.confidential);
  const selected =
    editedSelection ?? sharesQuery.data?.map((person) => person.userId) ?? [];
  const allCandidates = candidatesQuery.data ?? [];
  const normalized = search.trim().toLocaleLowerCase();
  const candidates = allCandidates.filter((person) =>
    normalized
      ? `${person.name} ${person.email}`
          .toLocaleLowerCase()
          .includes(normalized)
      : true,
  );
  // Confidential documents can never gain a share. An existing entry from an older rule may still be removed, so an
  // owner can clear it, but no candidate can be added.
  const selectedCandidates = allCandidates.filter((person) =>
    selected.includes(person.userId),
  );

  return (
    <RouteDialog
      title={t('library.share.title')}
      description={t('library.share.description')}
      footer={
        <>
          <Button
            disabled={save.isPending}
            variant='outline'
            onClick={() => void navigate('/library/manage', { replace: true })}
          >
            {t('library.actions.cancel')}
          </Button>
          <Button
            disabled={save.isPending || loading || Boolean(error)}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? t('library.share.saving')
              : t('library.share.save')}
          </Button>
        </>
      }
    >
      {loading ? (
        <Loading className='min-h-48' />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.errors.load')}</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : null}
          </AlertDescription>
        </Alert>
      ) : (
        <div className='flex flex-col gap-5'>
          {confidential ? (
            <Alert>
              <AlertTitle>
                {t('library.share.confidentialTitle', {
                  defaultValue: 'Confidential documents cannot be shared',
                })}
              </AlertTitle>
              <AlertDescription>
                {t('library.share.confidentialHint')}
              </AlertDescription>
            </Alert>
          ) : null}

          <section className='flex flex-col gap-2'>
            <h2 className='text-sm font-medium'>
              {t('library.share.selected')}
            </h2>
            {selected.length ? (
              <ul className='flex flex-wrap gap-2'>
                {allCandidates
                  .filter((person) => selected.includes(person.userId))
                  .map((person) => (
                    <li
                      key={person.userId}
                      className='rounded-full border bg-muted/40 px-3 py-1 text-sm'
                    >
                      {person.name || person.email}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('library.share.empty')}
              </p>
            )}
          </section>

          {confidential ? (
            selectedCandidates.length ? (
              <section className='flex flex-col gap-3'>
                <h2 className='text-sm font-medium'>
                  {t('library.share.removeExisting')}
                </h2>
                <ul className='flex flex-col divide-y overflow-hidden rounded-lg border'>
                  {selectedCandidates.map((person) => (
                    <li key={person.userId}>
                      <label className='flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40'>
                        <Checkbox
                          checked={selected.includes(person.userId)}
                          onCheckedChange={() =>
                            setEditedSelection((current) =>
                              (current ?? selected).filter(
                                (id) => id !== person.userId,
                              ),
                            )
                          }
                        />
                        <span className='flex min-w-0 flex-col'>
                          <span className='truncate text-sm font-medium'>
                            {person.name || person.email}
                          </span>
                          <span className='truncate text-xs text-muted-foreground'>
                            {person.email}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null
          ) : (
            <section className='flex flex-col gap-3'>
              <h2 className='text-sm font-medium'>
                {t('library.share.candidates')}
              </h2>
              <div className='relative'>
                <SearchIcon
                  className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                  aria-hidden
                />
                <Input
                  aria-label={t('library.share.searchLabel')}
                  className='pl-9'
                  placeholder={t('library.share.searchPlaceholder')}
                  type='search'
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              {candidates.length ? (
                <ul className='flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border'>
                  {candidates.map((person) => {
                    const checked = selected.includes(person.userId);
                    return (
                      <li key={person.userId}>
                        <label className='flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40'>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              setEditedSelection((current) => {
                                const base = current ?? selected;
                                return next
                                  ? [...base, person.userId]
                                  : base.filter((id) => id !== person.userId);
                              })
                            }
                          />
                          <span className='flex min-w-0 flex-col'>
                            <span className='truncate text-sm font-medium'>
                              {person.name || person.email}
                            </span>
                            <span className='truncate text-xs text-muted-foreground'>
                              {person.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className='flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
                  <UsersIcon className='size-4' />
                  {t('library.share.noCandidates')}
                </p>
              )}
            </section>
          )}

          {save.isError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {save.error instanceof Error
                  ? save.error.message
                  : t('library.share.error')}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </RouteDialog>
  );
}
