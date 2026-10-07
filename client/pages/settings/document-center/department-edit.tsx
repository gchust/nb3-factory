import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  documentCenterErrorKey,
  listDepartments,
  type Department,
} from '@/lib/document-center';

import { DepartmentForm } from './department-form.js';

/** The `:departmentId/edit` child route: edit a department in a dialog over the list. */
export default function DepartmentEditPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { departmentId } = useParams();
  const id = Number(departmentId);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly department?: Department | null;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const controller = new AbortController();
    listDepartments(api, controller.signal).then(
      (departments) => {
        if (!controller.signal.aborted) {
          setResult({
            key: id,
            department:
              departments.find((department) => department.id === id) ?? null,
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: id, error });
      },
    );
    return () => controller.abort();
  }, [api, id]);

  const loading = result?.key !== id;
  const department = loading ? undefined : result?.department;
  const error = loading ? undefined : result?.error;

  return (
    <RouteDialog
      title={department?.title ?? t('documentsAdmin.departments.editTitle')}
      description={t('documentsAdmin.departments.editDescription')}
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : department ? (
        <DepartmentForm department={department} />
      ) : department === null ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('documents.error.notFound')}</AlertTitle>
        </Alert>
      ) : (
        <div
          className='space-y-3'
          role='status'
          aria-label={t('status.loading')}
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      )}
    </RouteDialog>
  );
}
