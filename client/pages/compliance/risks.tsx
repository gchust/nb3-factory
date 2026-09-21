import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from './access.js';
import {
  complianceRequest,
  formatDate,
  normalizeError,
  type NormalizedError,
  type RiskItem,
  type RisksData,
} from './api.js';
import { StatusBadge } from './components/status-badge.js';
import { EmptyState, ErrorState, LoadingState } from './components/state.js';
import { qualificationTypeKey, riskKindKey, severityTone } from './labels.js';

export default function RisksPage(): ReactElement {
  const { t } = useTranslation();
  const { api, loading: accessLoading, error: accessError } = useAccess();
  const [risks, setRisks] = useState<RisksData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setRisks(await complianceRequest<RisksData>(api, '/risks'));
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

  const sections: readonly {
    readonly key: keyof RisksData;
    readonly titleKey: string;
    readonly fallback: string;
    readonly items: readonly RiskItem[];
  }[] = risks
    ? [
        {
          key: 'eligibility',
          titleKey: 'compliance.risks.eligibility',
          fallback: 'Qualified catalog violations',
          items: risks.eligibility,
        },
        {
          key: 'qualifications',
          titleKey: 'compliance.risks.qualifications',
          fallback: 'Qualification reminders',
          items: risks.qualifications,
        },
        {
          key: 'contracts',
          titleKey: 'compliance.risks.contracts',
          fallback: 'Contract reminders',
          items: risks.contracts,
        },
      ]
    : [];

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.risks.title', { defaultValue: 'Risk reminders' })}
        description={t('compliance.risks.description', {
          defaultValue:
            'Qualifications that expired or are about to expire, and contracts that need attention.',
        })}
      />

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : null}

      {!loading && !error && risks
        ? sections.map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle>
                  {t(section.titleKey, { defaultValue: section.fallback })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {section.items.length === 0 ? (
                  <EmptyState>
                    {t('compliance.risks.emptySection', {
                      defaultValue: 'Nothing to report.',
                    })}
                  </EmptyState>
                ) : (
                  <ul className='space-y-2'>
                    {section.items.map((item) => (
                      <li
                        key={`${section.key}-${item.kind}-${item.type ?? ''}-${item.supplierId ?? ''}-${item.contractId ?? ''}`}
                        className='flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm'
                      >
                        <StatusBadge
                          tone={severityTone(item.severity)}
                          labelKey={riskKindKey(item.kind)}
                          fallback={item.kind}
                        />
                        {item.supplierId ? (
                          <Link
                            to={`/compliance/suppliers/${item.supplierId}`}
                            className='font-medium hover:underline'
                          >
                            {item.supplierName ?? `#${item.supplierId}`}
                          </Link>
                        ) : null}
                        {item.type ? (
                          <span className='text-muted-foreground'>
                            {t(qualificationTypeKey(item.type), {
                              defaultValue: item.type,
                            })}
                          </span>
                        ) : null}
                        {item.contractId ? (
                          <Link
                            to={`/compliance/contracts/${item.contractId}`}
                            className='font-medium hover:underline'
                          >
                            {item.contractNo ?? `#${item.contractId}`}
                          </Link>
                        ) : null}
                        {item.date ? (
                          <span className='text-muted-foreground'>
                            {formatDate(item.date)}
                          </span>
                        ) : null}
                        {item.missing && item.missing.length > 0 ? (
                          <span className='text-destructive'>
                            {t('compliance.compliance.missingList', {
                              defaultValue: 'Missing: {{list}}',
                              list: item.missing
                                .map((type) =>
                                  t(qualificationTypeKey(type), {
                                    defaultValue: type,
                                  }),
                                )
                                .join(', '),
                            })}
                          </span>
                        ) : null}
                        {item.expired && item.expired.length > 0 ? (
                          <span className='text-destructive'>
                            {t('compliance.compliance.expiredList', {
                              defaultValue: 'Expired: {{list}}',
                              list: item.expired
                                .map((type) =>
                                  t(qualificationTypeKey(type), {
                                    defaultValue: type,
                                  }),
                                )
                                .join(', '),
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        : null}
    </PageContainer>
  );
}
