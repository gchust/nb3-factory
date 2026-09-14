import {
  apiClientToken,
  resolveAppUrl,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Download } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import {
  EnumBadge,
  ErrorState,
  LoadingState,
  PageHeader,
  PageSection,
  Panel,
} from '@/components/recruiting/ui';
import { Button } from '@/components/ui/button';
import { getCandidate } from '@/lib/recruiting-api';
import { useAsyncData } from '@/lib/recruiting-hooks';

export default function CandidateDetailPage(): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const { id } = useParams();
  const candidateId = Number(id);
  const candidate = useAsyncData(
    () => getCandidate(client, candidateId),
    [candidateId],
  );

  return (
    <PageSection>
      <div>
        <Button variant='ghost' size='sm' render={<Link to='/candidates' />}>
          <ArrowLeft aria-hidden />
          {t('recruiting.candidates.back')}
        </Button>
      </div>

      {candidate.status === 'loading' ? (
        <LoadingState label={t('recruiting.state.loading')} />
      ) : null}
      {candidate.status === 'error' ? (
        <ErrorState
          message={candidate.message ?? t('recruiting.state.error')}
          onRetry={candidate.reload}
        />
      ) : null}

      {candidate.status === 'ready' && candidate.data ? (
        <>
          <PageHeader
            title={candidate.data.name}
            description={candidate.data.email ?? undefined}
          />
          <Panel>
            <dl className='grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2'>
              <Detail label={t('recruiting.fields.phone')}>
                {candidate.data.phone ?? '—'}
              </Detail>
              <Detail label={t('recruiting.fields.email')}>
                {candidate.data.email ?? '—'}
              </Detail>
              <Detail label={t('recruiting.fields.requisition')}>
                {candidate.data.requisitionTitle ?? '—'}
              </Detail>
              <Detail label={t('recruiting.fields.department')}>
                {candidate.data.requisitionDepartment ?? '—'}
              </Detail>
              <Detail label={t('recruiting.fields.source')}>
                <EnumBadge kind='source' value={candidate.data.source} />
              </Detail>
              <Detail label={t('recruiting.fields.stage')}>
                <EnumBadge kind='stage' value={candidate.data.stage} />
              </Detail>
              <Detail label={t('recruiting.fields.overallScore')}>
                {candidate.data.overallScore === null
                  ? t('recruiting.candidates.scorePending')
                  : String(candidate.data.overallScore)}
              </Detail>
              <Detail label={t('recruiting.fields.resume')}>
                {candidate.data.resumeFileId ? (
                  <a
                    className='inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline'
                    href={resolveAppUrl(
                      `/api/recruiting/resumes/${candidate.data.resumeFileId}/download`,
                    )}
                  >
                    <Download className='size-4' aria-hidden />
                    {candidate.data.resumeFilename ??
                      t('recruiting.candidates.downloadResume')}
                  </a>
                ) : (
                  t('recruiting.candidates.noResume')
                )}
              </Detail>
            </dl>
          </Panel>
        </>
      ) : null}
    </PageSection>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='text-sm text-foreground'>{children}</dd>
    </div>
  );
}
