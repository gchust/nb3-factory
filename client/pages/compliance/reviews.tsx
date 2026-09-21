import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from './access.js';
import {
  complianceRequest,
  formatDateTime,
  normalizeError,
  type NormalizedError,
  type Review,
} from './api.js';
import { StatusBadge } from './components/status-badge.js';
import { EmptyState, ErrorState, LoadingState } from './components/state.js';
import { decisionKey, decisionTone } from './labels.js';

export default function ReviewsPage(): ReactElement {
  const { t } = useTranslation();
  const { api, loading: accessLoading, error: accessError } = useAccess();
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setReviews(await complianceRequest<Review[]>(api, '/reviews'));
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (accessLoading || accessError) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, reload]);

  if (accessLoading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (accessError) {
    return (
      <PageContainer>
        <ErrorState error={accessError} onRetry={() => void reload()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.reviews.title', {
          defaultValue: 'Annual reviews',
        })}
        description={t('compliance.reviews.description', {
          defaultValue:
            'Qualification review decisions recorded by the quality lead.',
        })}
      />

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : null}

      {!loading && !error && reviews.length === 0 ? (
        <EmptyState>
          {t('compliance.reviews.empty', {
            defaultValue: 'No review records.',
          })}
        </EmptyState>
      ) : null}

      {!loading && !error && reviews.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('compliance.reviews.supplier', { defaultValue: 'Supplier' })}
              </TableHead>
              <TableHead>
                {t('compliance.reviews.year', { defaultValue: 'Year' })}
              </TableHead>
              <TableHead>
                {t('compliance.reviews.decision', { defaultValue: 'Decision' })}
              </TableHead>
              <TableHead>
                {t('compliance.reviews.reason', { defaultValue: 'Reason' })}
              </TableHead>
              <TableHead>
                {t('compliance.reviews.reviewer', { defaultValue: 'Reviewer' })}
              </TableHead>
              <TableHead>
                {t('compliance.reviews.reviewedAt', {
                  defaultValue: 'Reviewed at',
                })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell>
                  <Link
                    to={`/compliance/suppliers/${review.supplierId}`}
                    className='font-medium hover:underline'
                  >
                    {review.supplierName ?? `#${review.supplierId}`}
                  </Link>
                </TableCell>
                <TableCell>{review.reviewYear}</TableCell>
                <TableCell>
                  <StatusBadge
                    tone={decisionTone(review.decision)}
                    labelKey={decisionKey(review.decision)}
                  />
                </TableCell>
                <TableCell className='max-w-72 truncate'>
                  {review.reason ?? '—'}
                </TableCell>
                <TableCell>{review.reviewerName ?? '—'}</TableCell>
                <TableCell>{formatDateTime(review.reviewedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </PageContainer>
  );
}
