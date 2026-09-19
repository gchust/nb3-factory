import { useTranslation } from '@nocobase/i18n/client';
import { Check, Undo2 } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { DeliveryFileList } from '@/components/delivery/file-list';
import { DeliveryQueryState } from '@/components/delivery/query-state';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { deliveryApi, formatDateTime } from '@/lib/delivery';
import { useDeliveryAction, useDeliveryQuery } from '@/lib/use-delivery-query';

export default function SubmissionDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const submissionId = Number(params.submissionId);
  const query = useDeliveryQuery(
    'submission',
    (api) => deliveryApi.submission(api, submissionId),
    [submissionId],
  );
  const action = useDeliveryAction();
  const [comment, setComment] = useState('');

  const submission = query.data;

  async function decide(decision: 'approve' | 'return'): Promise<void> {
    const ok = await action.run((api) =>
      deliveryApi.decide(api, submissionId, { decision, comment }),
    );
    if (ok) {
      setComment('');
      query.reload();
    }
  }

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <DeliveryQueryState
        error={query.error}
        loading={query.loading}
        onRetry={query.reload}
      >
        {submission ? (
          <div className='space-y-6'>
            <PageHeader
              description={[
                submission.projectName,
                t('delivery.submissions.round', { round: submission.round }),
                formatDateTime(submission.createdAt),
              ].join(' · ')}
              title={submission.milestoneName}
            />

            {action.error ? (
              <Alert variant='destructive'>
                <AlertDescription>{action.error}</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardContent className='grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3'>
                <Info label={t('delivery.field.status')}>
                  <DeliveryStatusBadge
                    kind='submission'
                    value={submission.status}
                  />
                </Info>
                <Info label={t('delivery.field.applicant')}>
                  {submission.applicantName}
                </Info>
                <Info label={t('delivery.field.reviewer')}>
                  {submission.reviewerName}
                </Info>
                <Info label={t('delivery.field.createdAt')}>
                  {formatDateTime(submission.createdAt)}
                </Info>
                <Info label={t('delivery.field.decidedAt')}>
                  {submission.decidedAt
                    ? formatDateTime(submission.decidedAt)
                    : t('delivery.submissions.pendingDecision')}
                </Info>
                <Info label={t('delivery.field.note')}>
                  {submission.note ?? '-'}
                </Info>
              </CardContent>
            </Card>

            {submission.canDecide ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('delivery.review.decisionTitle')}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='decision-comment'>
                      {t('delivery.review.comment')}
                    </Label>
                    <Textarea
                      id='decision-comment'
                      onChange={(event) => setComment(event.target.value)}
                      placeholder={t('delivery.review.commentPlaceholder')}
                      value={comment}
                    />
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      disabled={action.pending}
                      onClick={() => void decide('approve')}
                    >
                      <Check />
                      {t('delivery.review.approve')}
                    </Button>
                    <Button
                      disabled={action.pending || !comment.trim()}
                      onClick={() => void decide('return')}
                      variant='outline'
                    >
                      <Undo2 />
                      {t('delivery.review.return')}
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {t('delivery.review.returnHint')}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.submissions.itemsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {submission.items.length ? (
                  submission.items.map((item) => (
                    <div
                      className='space-y-2 rounded-lg border border-border p-3'
                      key={item.id}
                    >
                      <div className='flex flex-wrap items-baseline gap-2'>
                        <Link
                          className='text-sm font-medium text-primary underline-offset-4 hover:underline'
                          to={`/tasks/${item.taskId}`}
                        >
                          {item.taskTitle}
                        </Link>
                        <span className='text-xs text-muted-foreground'>
                          {item.resultTitle} ·{' '}
                          {t('delivery.field.versionNo', {
                            no: item.versionNo,
                          })}
                          {item.note ? ` · ${item.note}` : ''} ·{' '}
                          {item.uploaderName}
                        </span>
                      </div>
                      <DeliveryFileList files={item.files} showActions />
                    </div>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.submissions.noItems')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.submissions.historyTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className='space-y-2'>
                  {submission.history.map((round) => (
                    <li
                      className='flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2'
                      key={round.id}
                    >
                      <span className='text-sm'>
                        {t('delivery.submissions.round', {
                          round: round.round,
                        })}
                      </span>
                      <DeliveryStatusBadge
                        kind='submission'
                        value={round.status}
                      />
                      <span className='text-xs text-muted-foreground'>
                        {round.applicantName} → {round.reviewerName} ·{' '}
                        {formatDateTime(round.createdAt)}
                      </span>
                      {round.id === submission.id ? (
                        <span className='text-xs text-muted-foreground'>
                          ({t('delivery.submissions.current')})
                        </span>
                      ) : (
                        <Link
                          className='ml-auto text-sm text-primary underline-offset-4 hover:underline'
                          to={`/submissions/${round.id}`}
                        >
                          {t('delivery.actions.viewDetail')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.submissions.commentsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {submission.comments.length ? (
                  <ol className='space-y-3'>
                    {submission.comments.map((entry) => (
                      <li
                        className='rounded-lg border border-border px-3 py-2'
                        key={entry.id}
                      >
                        <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                          <span className='font-medium text-foreground'>
                            {entry.authorName}
                          </span>
                          <span>
                            {t(`delivery.comment.${entry.action}`, {
                              defaultValue: entry.action,
                            })}
                          </span>
                          <span>{formatDateTime(entry.createdAt)}</span>
                        </div>
                        {entry.content ? (
                          <p className='mt-1 text-sm whitespace-pre-wrap'>
                            {entry.content}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.submissions.noComments')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DeliveryQueryState>
    </PageContainer>
  );
}

function Info({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <div className='text-sm'>{children}</div>
    </div>
  );
}
