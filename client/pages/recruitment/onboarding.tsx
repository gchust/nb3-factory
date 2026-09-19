import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

import {
  changeStage,
  errorMessageKey,
  fetchCandidates,
  fetchOnboarding,
  setOnboardingStatus,
} from './api.js';
import { formatDateTime } from './format.js';
import { useAsyncData, useRecruitmentMe } from './hooks.js';
import { ErrorBanner, Pill, StagePill, StateNotice } from './shared.js';

export default function RecruitmentOnboardingPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const { me } = useRecruitmentMe(api);
  const isHr = me?.role === 'hr';

  const offered = useAsyncData(
    () => fetchCandidates(api, { stage: 'offered' }),
    'offered',
  );
  const todos = useAsyncData(() => fetchOnboarding(api), 'todos');

  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onConfirm(candidateId: string, name: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await changeStage(api, candidateId, 'onboarded');
      setNotice(`${t('recruitment.notices.stageChanged')} · ${name}`);
      offered.reload();
      todos.reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(
    id: string,
    status: 'pending' | 'done',
  ): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await setOnboardingStatus(api, id, status);
      setNotice(t('recruitment.notices.onboardingUpdated'));
      todos.reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('recruitment.onboarding.title')}
        description={t('recruitment.onboarding.description')}
      />

      <ErrorBanner messageKey={error} />
      {notice ? (
        <div
          className='rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary'
          role='status'
        >
          {notice}
        </div>
      ) : null}

      <section className='space-y-3'>
        <h2 className='text-sm font-semibold'>
          {t('recruitment.onboarding.offered')}
        </h2>
        <StateNotice
          emptyKey='recruitment.onboarding.noOffered'
          error={offered.error}
          isEmpty={(offered.data ?? []).length === 0}
          loading={offered.loading}
          onRetry={offered.reload}
        />
        {!offered.loading &&
        !offered.error &&
        (offered.data ?? []).length > 0 ? (
          <div className='overflow-x-auto rounded-xl border border-border'>
            <table className='w-full text-left text-sm'>
              <thead className='bg-muted/50 text-xs text-muted-foreground'>
                <tr>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.onboarding.candidate')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.candidates.position')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.candidates.recruiter')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.candidates.offeredAt')}
                  </th>
                  {isHr ? (
                    <th className='px-4 py-2 font-medium'>
                      {t('recruitment.common.actions')}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {(offered.data ?? []).map((candidate) => (
                  <tr className='hover:bg-muted/40' key={candidate.id}>
                    <td className='px-4 py-2 font-medium'>{candidate.name}</td>
                    <td className='px-4 py-2'>{candidate.positionTitle}</td>
                    <td className='px-4 py-2'>
                      {candidate.recruiterName ?? candidate.recruiterUsername}
                    </td>
                    <td className='px-4 py-2'>
                      {formatDateTime(candidate.offeredAt, i18n.language)}
                    </td>
                    {isHr ? (
                      <td className='px-4 py-2'>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void onConfirm(candidate.id, candidate.name)
                          }
                          size='sm'
                          type='button'
                        >
                          {t('recruitment.onboarding.confirmOnboard')}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className='space-y-3'>
        <h2 className='text-sm font-semibold'>
          {t('recruitment.candidates.onboarding')}
        </h2>
        <StateNotice
          emptyKey='recruitment.onboarding.empty'
          error={todos.error}
          isEmpty={(todos.data ?? []).length === 0}
          loading={todos.loading}
          onRetry={todos.reload}
        />
        {!todos.loading && !todos.error && (todos.data ?? []).length > 0 ? (
          <div className='overflow-x-auto rounded-xl border border-border'>
            <table className='w-full text-left text-sm'>
              <thead className='bg-muted/50 text-xs text-muted-foreground'>
                <tr>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.onboarding.candidate')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.onboarding.stage')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.onboarding.task')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.onboarding.status')}
                  </th>
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {(todos.data ?? []).map((todo) => (
                  <tr className='hover:bg-muted/40' key={todo.id}>
                    <td className='px-4 py-2 font-medium'>
                      {todo.candidateName}
                    </td>
                    <td className='px-4 py-2'>
                      <StagePill stage={todo.stage} />
                    </td>
                    <td className='px-4 py-2'>{todo.title}</td>
                    <td className='px-4 py-2'>
                      <Pill tone={todo.status === 'done' ? 'primary' : 'muted'}>
                        {todo.status === 'done'
                          ? t('recruitment.onboarding.done')
                          : t('recruitment.onboarding.pending')}
                      </Pill>
                    </td>
                    <td className='px-4 py-2'>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void onToggle(
                            todo.id,
                            todo.status === 'done' ? 'pending' : 'done',
                          )
                        }
                        size='sm'
                        type='button'
                        variant='outline'
                      >
                        {todo.status === 'done'
                          ? t('recruitment.onboarding.markPending')
                          : t('recruitment.onboarding.markDone')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </PageContainer>
  );
}
