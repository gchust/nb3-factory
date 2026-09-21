import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  formatDate,
  normalizeError,
  QUALIFICATION_TYPES,
  type NormalizedError,
  type Qualification,
} from './api.js';
import { SimpleSelect } from './components/simple-select.js';
import { StatusBadge } from './components/status-badge.js';
import { EmptyState, ErrorState, LoadingState } from './components/state.js';
import {
  qualificationStatusKey,
  qualificationStatusTone,
  qualificationTypeKey,
} from './labels.js';

export default function QualificationsPage(): ReactElement {
  const { t } = useTranslation();
  const { api, loading: accessLoading, error: accessError } = useAccess();
  const [qualifications, setQualifications] = useState<
    readonly Qualification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await complianceRequest<Qualification[]>(
        api,
        '/qualifications',
        {
          query: { type: type || undefined },
        },
      );
      setQualifications(data);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api, type]);

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

  const term = search.trim().toLowerCase();
  const visible = term
    ? qualifications.filter((qualification) =>
        `${qualification.supplierName ?? ''} ${qualification.certificateNo ?? ''} ${qualification.issuer ?? ''}`
          .toLowerCase()
          .includes(term),
      )
    : qualifications;

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.qualifications.title', {
          defaultValue: 'Qualification list',
        })}
        description={t('compliance.qualifications.description', {
          defaultValue:
            'Every qualification record across your procurement organizations, evaluated against today.',
        })}
      />

      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <div className='flex-1'>
          <Label htmlFor='qualification-search'>
            {t('compliance.qualifications.search', { defaultValue: 'Search' })}
          </Label>
          <Input
            id='qualification-search'
            className='mt-1'
            value={search}
            placeholder={t('compliance.qualifications.searchPlaceholder', {
              defaultValue: 'Supplier, certificate no. or issuer',
            })}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className='w-full sm:w-56'>
          <Label>
            {t('compliance.qualifications.type', { defaultValue: 'Type' })}
          </Label>
          <SimpleSelect
            value={type}
            onChange={setType}
            className='mt-1'
            placeholder={t('compliance.filters.all', { defaultValue: 'All' })}
            options={QUALIFICATION_TYPES.map((value) => ({
              value,
              label: t(qualificationTypeKey(value), { defaultValue: value }),
            }))}
          />
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <EmptyState>
          {t('compliance.qualifications.empty', {
            defaultValue: 'No qualification records.',
          })}
        </EmptyState>
      ) : null}

      {!loading && !error && visible.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('compliance.qualifications.supplier', {
                  defaultValue: 'Supplier',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.qualifications.type', { defaultValue: 'Type' })}
              </TableHead>
              <TableHead>
                {t('compliance.qualifications.certificateNo', {
                  defaultValue: 'Certificate no.',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.qualifications.issuer', {
                  defaultValue: 'Issuer',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.qualifications.expiresAt', {
                  defaultValue: 'Expires',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.qualifications.status', {
                  defaultValue: 'Status',
                })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((qualification) => (
              <TableRow key={qualification.id}>
                <TableCell>
                  <Link
                    to={`/compliance/suppliers/${qualification.supplierId}`}
                    className='font-medium hover:underline'
                  >
                    {qualification.supplierName ??
                      `#${qualification.supplierId}`}
                  </Link>
                </TableCell>
                <TableCell>
                  {t(qualificationTypeKey(qualification.type), {
                    defaultValue: qualification.type,
                  })}
                </TableCell>
                <TableCell>{qualification.certificateNo ?? '—'}</TableCell>
                <TableCell>{qualification.issuer ?? '—'}</TableCell>
                <TableCell>{formatDate(qualification.expiresAt)}</TableCell>
                <TableCell>
                  <StatusBadge
                    tone={qualificationStatusTone(
                      qualification.effectiveStatus ?? 'active',
                    )}
                    labelKey={qualificationStatusKey(
                      qualification.effectiveStatus ?? 'active',
                    )}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </PageContainer>
  );
}
