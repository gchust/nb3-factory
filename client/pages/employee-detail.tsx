import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Plus } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { CertificateForm } from '@/components/employee-records/certificate-form.js';
import { CertificateList } from '@/components/employee-records/certificate-list.js';
import { employeeErrorMessage } from '@/components/employee-records/error-message.js';
import {
  deleteCertificate,
  getEmployeeDetail,
  type EmployeeDetail,
} from '@/components/employee-records/api.js';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

export default function EmployeeDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const { employeeId } = useParams();
  const id = Number(employeeId);
  const [detail, setDetail] = useState<EmployeeDetail | undefined>();
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | undefined>();

  const reload = useCallback(() => {
    setError('');
    setDetail(undefined);
    getEmployeeDetail(api, id).then(
      (data) => setDetail(data),
      (cause) => setError(employeeErrorMessage(t, cause)),
    );
  }, [api, id, t]);

  useEffect(() => {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    let active = true;
    getEmployeeDetail(api, id).then(
      (data) => {
        if (active) setDetail(data);
      },
      (cause) => {
        if (active) setError(employeeErrorMessage(t, cause));
      },
    );
    return () => {
      active = false;
    };
  }, [api, id, t]);

  const displayError =
    Number.isSafeInteger(id) && id > 0 ? error : t('employees.errors.notFound');

  const handleDelete = async (certificateId: number) => {
    setDeletingId(certificateId);
    setError('');
    try {
      await deleteCertificate(api, certificateId);
      setDetail((current) =>
        current
          ? {
              ...current,
              certificates: current.certificates.filter(
                (certificate) => certificate.id !== certificateId,
              ),
            }
          : current,
      );
    } catch (cause) {
      setError(employeeErrorMessage(t, cause));
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 p-6'>
      <Link
        className='inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'
        to='/employees'
      >
        <ArrowLeft className='size-4' />
        {t('employeeDetail.back')}
      </Link>

      {displayError ? (
        <div className='space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4'>
          <p className='text-sm text-destructive' role='alert'>
            {displayError}
          </p>
          {error ? (
            <Button size='sm' variant='outline' onClick={reload}>
              {t('employeeDetail.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!displayError && detail === undefined ? (
        <Loading label={t('employeeDetail.loading')} />
      ) : null}

      {!displayError && detail ? (
        <>
          <header className='space-y-1 rounded-lg border border-border bg-card p-4'>
            <h1 className='font-heading text-2xl font-semibold'>
              {detail.employee.name}
            </h1>
            <p className='text-sm text-muted-foreground'>
              {t('employeeDetail.meta', {
                employeeNo: detail.employee.employeeNo,
                department: detail.employee.department,
              })}
            </p>
          </header>

          <section className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <h2 className='font-heading text-lg font-semibold'>
                {t('certificates.title')}
              </h2>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setShowForm((value) => !value)}
              >
                <Plus />
                {t('certificates.add')}
              </Button>
            </div>

            {showForm ? (
              <CertificateForm
                employeeId={detail.employee.id}
                onCancel={() => setShowForm(false)}
                onCreated={(certificate) => {
                  setDetail((current) =>
                    current
                      ? {
                          ...current,
                          certificates: [...current.certificates, certificate],
                        }
                      : current,
                  );
                  setShowForm(false);
                }}
              />
            ) : null}

            <CertificateList
              certificates={detail.certificates}
              deletingId={deletingId}
              onDelete={(certificateId) => void handleDelete(certificateId)}
            />
          </section>
        </>
      ) : null}
    </section>
  );
}
