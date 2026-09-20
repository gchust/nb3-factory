import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import {
  createPosition,
  errorMessageKey,
  fetchPositions,
  fetchStaff,
  updatePosition,
  type Position,
  type StaffOption,
} from './api.js';
import { useAsyncData, useRecruitmentMe, useSubmitGuard } from './hooks.js';
import {
  ErrorBanner,
  Field,
  NativeSelect,
  Panel,
  Pill,
  StateNotice,
  inputClassName,
} from './shared.js';

interface PositionForm {
  title: string;
  department: string;
  headcount: string;
  ownerUsername: string;
  status: string;
  description: string;
}

const EMPTY_FORM: PositionForm = {
  title: '',
  department: '',
  headcount: '1',
  ownerUsername: '',
  status: 'open',
  description: '',
};

export default function RecruitmentPositionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { me } = useRecruitmentMe(api);
  const isHr = me?.role === 'hr';

  const positions = useAsyncData(() => fetchPositions(api), 'positions');
  const staff = useAsyncData(
    () => (isHr ? fetchStaff(api) : Promise.resolve<StaffOption[]>([])),
    `staff:${isHr}`,
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Position | undefined>();
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const { saving, submit: runSubmit, reset: resetSubmit } = useSubmitGuard();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const filtered = useMemo(() => {
    const rows = positions.data ?? [];
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.department.toLowerCase().includes(needle)
      );
    });
  }, [positions.data, search, statusFilter]);

  const owners = (staff.data ?? []).filter(
    (option) => option.role === 'hr' || option.role === 'recruiter',
  );

  function openCreate(): void {
    setEditing(undefined);
    setForm({
      ...EMPTY_FORM,
      ownerUsername: me?.username ?? '',
      headcount: '1',
    });
    resetSubmit();
    setError(undefined);
    setDialogOpen(true);
  }

  function openEdit(position: Position): void {
    setEditing(position);
    setForm({
      title: position.title,
      department: position.department,
      headcount: String(position.headcount),
      ownerUsername: position.ownerUsername,
      status: position.status,
      description: position.description ?? '',
    });
    resetSubmit();
    setError(undefined);
    setDialogOpen(true);
  }

  async function submit(): Promise<void> {
    setError(undefined);
    await runSubmit(
      async () => {
        const payload = {
          title: form.title.trim(),
          department: form.department.trim(),
          headcount: Number(form.headcount),
          ownerUsername: form.ownerUsername,
          status: form.status,
          description: form.description.trim(),
        };
        if (editing) {
          await updatePosition(api, editing.id, payload);
          setNotice(t('recruitment.notices.positionUpdated'));
        } else {
          await createPosition(api, payload);
          setNotice(t('recruitment.notices.positionCreated'));
        }
        setDialogOpen(false);
        positions.reload();
      },
      (cause: unknown) => setError(errorMessageKey(cause)),
    );
  }

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('recruitment.positions.title')}
        description={t('recruitment.positions.description')}
        actions={
          isHr ? (
            <Button onClick={openCreate} type='button'>
              <Plus className='size-4' />
              {t('recruitment.positions.create')}
            </Button>
          ) : null
        }
      />

      {notice ? (
        <div
          className='rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary'
          role='status'
        >
          {notice}
        </div>
      ) : null}

      <Panel className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <Input
          aria-label={t('recruitment.common.search')}
          className='max-w-sm'
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('recruitment.positions.searchPlaceholder')}
          value={search}
        />
        <div className='w-full max-w-[12rem]'>
          <NativeSelect
            ariaLabel={t('recruitment.positions.statusFilter')}
            onChange={setStatusFilter}
            value={statusFilter}
          >
            <option value='all'>{t('recruitment.common.all')}</option>
            <option value='open'>{t('recruitment.positions.open')}</option>
            <option value='closed'>{t('recruitment.positions.closed')}</option>
          </NativeSelect>
        </div>
        <Button onClick={positions.reload} type='button' variant='outline'>
          {t('recruitment.common.refresh')}
        </Button>
      </Panel>

      <StateNotice
        emptyKey='recruitment.positions.empty'
        error={positions.error}
        isEmpty={(positions.data ?? []).length === 0}
        loading={positions.loading}
        onRetry={positions.reload}
      />

      {!positions.loading && !positions.error && filtered.length > 0 ? (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.positions.name')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.positions.department')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.positions.headcount')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.positions.owner')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.positions.candidateCount')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.positions.status')}
                </th>
                {isHr ? (
                  <th className='px-4 py-2 font-medium'>
                    {t('recruitment.common.actions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {filtered.map((position) => (
                <tr className='hover:bg-muted/40' key={position.id}>
                  <td className='px-4 py-2 font-medium'>{position.title}</td>
                  <td className='px-4 py-2'>{position.department}</td>
                  <td className='px-4 py-2'>{position.headcount}</td>
                  <td className='px-4 py-2'>
                    {position.ownerName ?? position.ownerUsername}
                  </td>
                  <td className='px-4 py-2'>{position.candidateCount}</td>
                  <td className='px-4 py-2'>
                    <Pill
                      tone={position.status === 'open' ? 'primary' : 'muted'}
                    >
                      {t(`recruitment.positions.${position.status}`, {
                        defaultValue: position.status,
                      })}
                    </Pill>
                  </td>
                  {isHr ? (
                    <td className='px-4 py-2'>
                      <Button
                        onClick={() => openEdit(position)}
                        size='sm'
                        type='button'
                        variant='outline'
                      >
                        <Pencil className='size-3.5' />
                        {t('recruitment.common.edit')}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('recruitment.positions.edit')
                : t('recruitment.positions.create')}
            </DialogTitle>
            <DialogDescription>
              {t('recruitment.positions.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={t('recruitment.positions.name')}>
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                value={form.title}
              />
            </Field>
            <Field label={t('recruitment.positions.department')}>
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    department: event.target.value,
                  }))
                }
                value={form.department}
              />
            </Field>
            <Field label={t('recruitment.positions.headcount')}>
              <Input
                min={1}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    headcount: event.target.value,
                  }))
                }
                type='number'
                value={form.headcount}
              />
            </Field>
            <Field label={t('recruitment.positions.owner')}>
              <NativeSelect
                onChange={(value) =>
                  setForm((current) => ({ ...current, ownerUsername: value }))
                }
                value={form.ownerUsername}
              >
                <option value=''>
                  {t('recruitment.positions.ownerPlaceholder')}
                </option>
                {owners.map((option) => (
                  <option key={option.username} value={option.username}>
                    {`${option.name}（${t(`recruitment.roles.${option.role}`)}）`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t('recruitment.positions.status')}>
              <NativeSelect
                onChange={(value) =>
                  setForm((current) => ({ ...current, status: value }))
                }
                value={form.status}
              >
                <option value='open'>{t('recruitment.positions.open')}</option>
                <option value='closed'>
                  {t('recruitment.positions.closed')}
                </option>
              </NativeSelect>
            </Field>
            <Field label={t('recruitment.positions.descriptionLabel')}>
              <textarea
                className={`${inputClassName} min-h-20 py-2`}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                value={form.description}
              />
            </Field>
          </div>
          <ErrorBanner messageKey={error} />
          <DialogFooter>
            <Button
              onClick={() => setDialogOpen(false)}
              type='button'
              variant='outline'
            >
              {t('recruitment.common.cancel')}
            </Button>
            <Button
              disabled={saving}
              onClick={() => void submit()}
              type='button'
            >
              {saving
                ? t('recruitment.common.saving')
                : t('recruitment.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
