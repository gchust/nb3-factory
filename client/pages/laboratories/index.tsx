import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, RefreshCw, UsersIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { laboratoryFields } from '@/lib/lab-fields';
import { ROLE_LABEL_KEYS } from '@/lib/lab-options';
import { canWriteIn, hasStaffRole } from '@/lib/lab-permissions';
import { statusTone } from '@/lib/lab-status';
import { type LaboratoryView } from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

export default function LaboratoriesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const access = useAsync('access', () => api.access());
  const list = useAsync('laboratories', () => api.laboratories());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LaboratoryView | null>(null);
  const [membersOf, setMembersOf] = useState<LaboratoryView | null>(null);
  const message = useLabErrorMessage(list.error);

  const mayCreate = hasStaffRole(access.data, ['lab_admin']);
  const canManage = (laboratory: LaboratoryView): boolean =>
    canWriteIn(access.data, laboratory.id, ['lab_admin']);

  const columns: DataTableColumn<LaboratoryView>[] = [
    {
      key: 'code',
      headerKey: 'lab.code',
      text: (row) => row.code,
      className: 'font-medium',
    },
    { key: 'name', headerKey: 'lab.name', text: (row) => row.name },
    {
      key: 'location',
      headerKey: 'lab.location',
      text: (row) => [row.building, row.room].filter(Boolean).join(' '),
      render: (row) =>
        [row.building, row.room].filter(Boolean).join(' · ') || (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      key: 'status',
      headerKey: 'lab.status',
      text: (row) => row.status,
      render: (row) => (
        <Badge variant={statusTone(row.status)}>
          {t(`lab.labStatus.${row.status}`)}
        </Badge>
      ),
    },
    {
      key: 'role',
      headerKey: 'lab.myRole',
      render: (row) =>
        row.role ? (
          <Badge variant={row.role === 'student' ? 'outline' : 'secondary'}>
            {t(ROLE_LABEL_KEYS[row.role])}
          </Badge>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      key: 'equipmentCount',
      headerKey: 'lab.equipmentCount',
      className: 'text-right tabular-nums',
      text: (row) => String(row.equipmentCount),
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-56',
      render: (row) => (
        <div className='flex justify-end gap-1'>
          <Button size='sm' variant='ghost' onClick={() => setMembersOf(row)}>
            <UsersIcon />
            {t('lab.members')}
          </Button>
          {canManage(row) ? (
            <Button size='sm' variant='outline' onClick={() => setEditing(row)}>
              {t('lab.edit')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <>
            <Button
              variant='outline'
              onClick={list.reload}
              disabled={list.loading}
            >
              <RefreshCw />
              {t('lab.refresh')}
            </Button>
            {mayCreate ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon />
                {t('lab.createLaboratory')}
              </Button>
            ) : null}
          </>
        }
        description={t('laboratories.description')}
        title={t('laboratories.title')}
      />

      {message ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        emptyKey='laboratories.empty'
        loading={list.loading}
        rowKey={(row) => row.id}
        rows={list.data ?? []}
      />

      {membersOf ? (
        <MembersPanel
          laboratory={membersOf}
          onClose={() => setMembersOf(null)}
        />
      ) : null}

      {creating ? (
        <FormDialog
          descriptionKey='lab.createLaboratoryHint'
          fields={laboratoryFields(t, true)}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createLaboratory(values);
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createLaboratory'
        />
      ) : null}

      {editing ? (
        <FormDialog
          descriptionKey='lab.codeImmutable'
          fields={laboratoryFields(t, false)}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.updateLaboratory(editing.id, values);
            setEditing(null);
            list.reload();
          }}
          titleKey='lab.editLaboratory'
        />
      ) : null}
    </PageContainer>
  );
}

/** The roster of one laboratory, opened from the table. */
function MembersPanel({
  laboratory,
  onClose,
}: {
  readonly laboratory: LaboratoryView;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const members = useAsync(`members:${laboratory.id}`, () =>
    api.labMembers(laboratory.id),
  );
  const message = useLabErrorMessage(members.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between gap-2 text-base'>
          <span>{t('lab.membersOf', { name: laboratory.name })}</span>
          <Button size='sm' variant='ghost' onClick={onClose}>
            {t('lab.close')}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        <Separator />
        {message ? <p className='text-destructive text-sm'>{message}</p> : null}
        {members.loading ? <Skeleton className='h-6 w-56' /> : null}
        {(members.data ?? []).map((member) => (
          <div
            key={member.userId}
            className='flex items-center justify-between gap-3 text-sm'
          >
            <span className='truncate'>
              {member.name ?? member.userId}
              {member.email ? (
                <span className='text-muted-foreground'> · {member.email}</span>
              ) : null}
            </span>
            <Badge variant='secondary'>{t(ROLE_LABEL_KEYS[member.role])}</Badge>
          </div>
        ))}
        {!members.loading && (members.data ?? []).length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('lab.empty')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
