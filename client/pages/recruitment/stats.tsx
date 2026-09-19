import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import { fetchStats, RECRUITMENT_STAGES } from './api.js';
import { useAsyncData, useRecruitmentMe } from './hooks.js';
import { Bar, Panel, Pill, StateNotice, SummaryCard } from './shared.js';

export default function RecruitmentStatsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { me } = useRecruitmentMe(api);
  const stats = useAsyncData(() => fetchStats(api), 'stats');
  const data = stats.data;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('recruitment.stats.title')}
        description={t('recruitment.stats.description')}
        actions={
          me ? (
            <Pill tone='secondary'>{t(`recruitment.roles.${me.role}`)}</Pill>
          ) : null
        }
      />

      <StateNotice
        error={stats.error}
        loading={stats.loading}
        onRetry={stats.reload}
      />

      {data ? (
        <>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <SummaryCard
              label={t('recruitment.stats.positions')}
              value={data.positions.total}
            />
            <SummaryCard
              label={t('recruitment.stats.openPositions')}
              value={data.positions.open}
            />
            <SummaryCard
              label={t('recruitment.stats.headcount')}
              value={data.positions.headcount}
            />
            <SummaryCard
              label={t('recruitment.stats.applied')}
              value={data.positions.applied}
            />
            <SummaryCard
              label={t('recruitment.stats.candidates')}
              value={data.candidates.total}
            />
            <SummaryCard
              label={t('recruitment.stats.activeCandidates')}
              value={data.candidates.active}
            />
            <SummaryCard
              label={t('recruitment.stats.interviews')}
              value={data.interviews.total}
            />
            <SummaryCard
              label={t('recruitment.stats.upcoming')}
              value={data.interviews.upcoming}
            />
            <SummaryCard
              label={t('recruitment.stats.pendingOffers')}
              value={data.offers.pending}
            />
            <SummaryCard
              label={t('recruitment.stats.offered')}
              value={data.offers.offered}
            />
            <SummaryCard
              label={t('recruitment.stats.onboarded')}
              value={data.offers.onboarded}
            />
            <SummaryCard
              label={t('recruitment.stats.completed')}
              value={data.interviews.completed}
            />
          </div>

          <Panel className='space-y-3'>
            <h2 className='text-sm font-semibold'>
              {t('recruitment.stats.byStage')}
            </h2>
            {(() => {
              const max = Math.max(
                1,
                ...RECRUITMENT_STAGES.map(
                  (stage) => data.candidates.byStage[stage] ?? 0,
                ),
              );
              const tones: Record<string, string> = {
                pending: 'bg-muted-foreground/40',
                interviewed: 'bg-secondary-foreground/40',
                pending_offer: 'bg-accent-foreground/50',
                offered: 'bg-primary/60',
                onboarded: 'bg-primary',
                rejected: 'bg-destructive/60',
              };
              return RECRUITMENT_STAGES.map((stage) => (
                <Bar
                  key={stage}
                  label={t(`recruitment.stages.${stage}`)}
                  max={max}
                  tone={tones[stage]}
                  value={data.candidates.byStage[stage] ?? 0}
                />
              ));
            })()}
          </Panel>

          <Panel className='space-y-3'>
            <h2 className='text-sm font-semibold'>
              {t('recruitment.stats.byPosition')}
            </h2>
            {data.byPosition.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('recruitment.stats.noData')}
              </p>
            ) : (
              <div className='overflow-x-auto rounded-xl border border-border'>
                <table className='w-full text-left text-sm'>
                  <thead className='bg-muted/50 text-xs text-muted-foreground'>
                    <tr>
                      <th className='px-4 py-2 font-medium'>
                        {t('recruitment.stats.position')}
                      </th>
                      <th className='px-4 py-2 font-medium'>
                        {t('recruitment.stats.department')}
                      </th>
                      <th className='px-4 py-2 font-medium'>
                        {t('recruitment.stats.headcount')}
                      </th>
                      <th className='px-4 py-2 font-medium'>
                        {t('recruitment.stats.candidateCount')}
                      </th>
                      <th className='px-4 py-2 font-medium'>
                        {t('recruitment.stats.onboardedCount')}
                      </th>
                      <th className='px-4 py-2 font-medium'>
                        {t('recruitment.positions.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border'>
                    {data.byPosition.map((position) => (
                      <tr
                        className='hover:bg-muted/40'
                        key={position.positionId}
                      >
                        <td className='px-4 py-2 font-medium'>
                          {position.title}
                        </td>
                        <td className='px-4 py-2'>{position.department}</td>
                        <td className='px-4 py-2'>{position.headcount}</td>
                        <td className='px-4 py-2'>{position.candidates}</td>
                        <td className='px-4 py-2'>{position.onboarded}</td>
                        <td className='px-4 py-2'>
                          <Pill
                            tone={
                              position.status === 'open' ? 'primary' : 'muted'
                            }
                          >
                            {t(`recruitment.positions.${position.status}`, {
                              defaultValue: position.status,
                            })}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </PageContainer>
  );
}
