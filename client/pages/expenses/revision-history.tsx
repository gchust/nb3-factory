import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import type { ExpenseRevisionView } from './api.js';
import { formatAmount, formatDate, formatDateTime } from './constants.js';
import { ExpenseAttachments } from './files/file-attachments.js';
import { Notice, Panel, StatusBadge } from './shared.jsx';

const noop = async (): Promise<void> => undefined;

/**
 * Read-only record of every submission.
 *
 * Each block is fed from the frozen revision snapshot on the server, never from
 * the live draft, so a receipt the employee replaced after a return still shows
 * exactly what the manager decided on — together with that decision's comment.
 */
export function ExpenseRevisionHistory({
  revisions,
}: {
  readonly revisions: readonly ExpenseRevisionView[];
}): ReactElement | null {
  const { t } = useTranslation();
  if (revisions.length === 0) return null;
  return (
    <Panel title={t('expenses.detail.submissions')}>
      <p className='mb-3 text-sm text-muted-foreground'>
        {t('expenses.detail.submissionsHint')}
      </p>
      <ol className='space-y-4' data-slot='expense-revisions'>
        {revisions.map((revision) => (
          <li
            className='space-y-3 rounded-lg border border-border p-3'
            key={revision.id}
            value={revision.revision}
          >
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-sm font-medium'>
                  {t('expenses.detail.revisionLabel', {
                    revision: revision.revision,
                  })}
                </span>
                <StatusBadge status={revision.status} />
                <span className='text-xs text-muted-foreground'>
                  {formatDateTime(revision.submittedAt)}
                </span>
              </div>
              <span className='text-xs text-muted-foreground'>
                {t('expenses.files.count', { count: revision.fileCount })}
              </span>
            </div>

            {revision.decision ? (
              <Notice
                tone={revision.decision === 'rejected' ? 'warning' : 'success'}
              >
                <span className='font-medium'>
                  {t(
                    revision.decision === 'rejected'
                      ? 'expenses.detail.returnedBy'
                      : 'expenses.detail.approvedBy',
                    { name: revision.decidedByName ?? '—' },
                  )}
                </span>
                {revision.decidedAt
                  ? ` · ${formatDateTime(revision.decidedAt)}`
                  : ''}
                {revision.comment ? ` — ${revision.comment}` : ''}
              </Notice>
            ) : null}

            {revision.items.map((item) => (
              <div
                className='space-y-2 rounded-md border border-border/60 p-2'
                key={item.id}
              >
                <p className='text-sm font-medium'>
                  {item.categoryName} · {formatDate(item.expenseDate)} ·{' '}
                  {formatAmount(item.amount)}
                  {item.description ? (
                    <span className='ml-2 text-xs font-normal text-muted-foreground'>
                      {item.description}
                    </span>
                  ) : null}
                </p>
                <ExpenseAttachments
                  attach={noop}
                  canManage={false}
                  detach={noop}
                  emptyText={t('expenses.detail.noRevisionFiles')}
                  files={item.files}
                  readOnlyHint={t('expenses.detail.frozenHint')}
                />
              </div>
            ))}

            <div className='space-y-2 rounded-md border border-border/60 p-2'>
              <p className='text-sm font-medium'>
                {t('expenses.files.supplementaryTitle')}
              </p>
              <ExpenseAttachments
                attach={noop}
                canManage={false}
                detach={noop}
                emptyText={t('expenses.detail.noRevisionFiles')}
                files={revision.files}
                readOnlyHint={t('expenses.detail.frozenHint')}
              />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
