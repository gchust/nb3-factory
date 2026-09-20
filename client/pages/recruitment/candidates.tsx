import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Eye, Pencil, Plus } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

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
  createCandidate,
  errorMessageKey,
  fetchCandidates,
  fetchPositions,
  fetchStaff,
  updateCandidate,
  type Candidate,
} from './api.js';
import { CandidateDetailDialog } from './candidate-detail.js';
import { formatDateTime } from './format.js';
import {
  useAsyncData,
  useRecruitmentMe,
  useSubmitGuard,
  newRequestId,
} from './hooks.js';
import {
  ErrorBanner,
  Field,
  NativeSelect,
  Panel,
  StagePill,
  StateNotice,
  inputClassName,
} from './shared.js';

interface CandidateForm {
  name: string;
  phone: string;
  email: string;
  positionId: string;
  recruiterUsername: string;
  source: string;
  note: string;
}

const EMPTY_FORM: CandidateForm = {
  name: '',
  phone: '',
  email: '',
  positionId: '',
  recruiterUsername: '',
  source: '',
  note: '',
};

export default function RecruitmentCandidatesPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const { me } = useRecruitmentMe(api);
  const isHr = me?.role === 'hr';
  const canEdit = me?.role === 'hr' || me?.role === 'recruiter';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [recruiterFilter, setRecruiterFilter] = useState('all');

  const candidates = useAsyncData(
    () =>
      fetchCandidates(api, {
        search: search || undefined,
        stage: stageFilter === 'all' ? undefined : stageFilter,
        positionId: positionFilter === 'all' ? undefined : positionFilter,
        recruiterUsername:
          isHr && recruiterFilter !== 'all' ? recruiterFilter : undefined,
      }),
    `${search}|${stageFilter}|${positionFilter}|${isHr ? recruiterFilter : 'all'}`,
  );
  const positions = useAsyncData(() => fetchPositions(api), 'positions');
  const staff = useAsyncData(() => fetchStaff(api), 'staff');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | undefined>();
  const [form, setForm] = useState<CandidateForm>(EMPTY_FORM);
  const { saving, submit: runSubmit, reset: resetSubmit } = useSubmitGuard();
  const requestIdRef = useRef('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [detailId, setDetailId] = useState<string>();

  const recruiters = (staff.data ?? []).filter(
    (option) => option.role === 'recruiter' || option.role === 'hr',
  );

  function openCreate(): void {
    setEditing(undefined);
    setForm({
      ...EMPTY_FORM,
      recruiterUsername: isHr ? '' : (me?.username ?? ''),
    });
    // A fresh key: this is a new candidate, not a retry of a previous form.
    requestIdRef.current = newRequestId();
    resetSubmit();
    setError(undefined);
    setDialogOpen(true);
  }

  function openEdit(candidate: Candidate): void {
    setEditing(candidate);
    setForm({
      name: candidate.name,
      phone: candidate.phone ?? '',
      email: candidate.email ?? '',
      positionId: candidate.positionId,
      recruiterUsername: candidate.recruiterUsername,
      source: candidate.source ?? '',
      note: candidate.note ?? '',
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
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          positionId: form.positionId,
          source: form.source.trim(),
          note: form.note.trim(),
          ...(isHr ? { recruiterUsername: form.recruiterUsername } : {}),
        };
        if (editing) {
          await updateCandidate(api, editing.id, payload);
          setNotice(t('recruitment.notices.candidateUpdated'));
        } else {
          // The key travels with the payload so a resend is recognized as the
          // same submission rather than a second candidate.
          await createCandidate(api, {
            ...payload,
            requestId: requestIdRef.current,
          });
          setNotice(t('recruitment.notices.candidateCreated'));
        }
        setDialogOpen(false);
        candidates.reload();
      },
      (cause: unknown) => setError(errorMessageKey(cause)),
    );
  }

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('recruitment.candidates.title')}
        description={t('recruitment.candidates.description')}
        actions={
          canEdit ? (
            <Button onClick={openCreate} type='button'>
              <Plus className='size-4' />
              {t('recruitment.candidates.create')}
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

      <Panel className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='flex gap-2 sm:col-span-2'>
          <Input
            aria-label={t('recruitment.common.search')}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setSearch(searchInput.trim());
            }}
            placeholder={t('recruitment.candidates.searchPlaceholder')}
            value={searchInput}
          />
          <Button
            onClick={() => setSearch(searchInput.trim())}
            type='button'
            variant='outline'
          >
            {t('recruitment.common.search')}
          </Button>
        </div>
        <NativeSelect
          ariaLabel={t('recruitment.candidates.stageFilter')}
          onChange={setStageFilter}
          value={stageFilter}
        >
          <option value='all'>{t('recruitment.common.all')}</option>
          {[
            'pending',
            'interviewed',
            'pending_offer',
            'offered',
            'onboarded',
            'rejected',
          ].map((stage) => (
            <option key={stage} value={stage}>
              {t(`recruitment.stages.${stage}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          ariaLabel={t('recruitment.candidates.positionFilter')}
          onChange={setPositionFilter}
          value={positionFilter}
        >
          <option value='all'>{t('recruitment.common.all')}</option>
          {(positions.data ?? []).map((position) => (
            <option key={position.id} value={position.id}>
              {position.title}
            </option>
          ))}
        </NativeSelect>
        {isHr ? (
          <NativeSelect
            ariaLabel={t('recruitment.candidates.recruiterFilter')}
            onChange={setRecruiterFilter}
            value={recruiterFilter}
          >
            <option value='all'>{t('recruitment.common.all')}</option>
            {recruiters.map((option) => (
              <option key={option.username} value={option.username}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <Button onClick={candidates.reload} type='button' variant='outline'>
          {t('recruitment.common.refresh')}
        </Button>
      </Panel>

      <StateNotice
        emptyKey='recruitment.candidates.empty'
        error={candidates.error}
        isEmpty={(candidates.data ?? []).length === 0}
        loading={candidates.loading}
        onRetry={candidates.reload}
      />

      {!candidates.loading &&
      !candidates.error &&
      (candidates.data ?? []).length > 0 ? (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.candidates.name')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.candidates.position')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.candidates.stage')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.candidates.recruiter')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.candidates.phone')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.candidates.updatedAt')}
                </th>
                <th className='px-4 py-2 font-medium'>
                  {t('recruitment.common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {(candidates.data ?? []).map((candidate) => (
                <tr className='hover:bg-muted/40' key={candidate.id}>
                  <td className='px-4 py-2 font-medium'>{candidate.name}</td>
                  <td className='px-4 py-2'>{candidate.positionTitle}</td>
                  <td className='px-4 py-2'>
                    <StagePill stage={candidate.stage} />
                  </td>
                  <td className='px-4 py-2'>
                    {(candidate.recruiterName ?? candidate.recruiterUsername) ||
                      '—'}
                  </td>
                  <td className='px-4 py-2'>{candidate.phone ?? '—'}</td>
                  <td className='px-4 py-2'>
                    {formatDateTime(candidate.updatedAt, i18n.language)}
                  </td>
                  <td className='px-4 py-2'>
                    <div className='flex gap-2'>
                      <Button
                        onClick={() => setDetailId(candidate.id)}
                        size='sm'
                        type='button'
                        variant='outline'
                      >
                        <Eye className='size-3.5' />
                        {t('recruitment.common.detail')}
                      </Button>
                      {canEdit ? (
                        <Button
                          onClick={() => openEdit(candidate)}
                          size='sm'
                          type='button'
                          variant='outline'
                        >
                          <Pencil className='size-3.5' />
                          {t('recruitment.common.edit')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
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
                ? t('recruitment.candidates.edit')
                : t('recruitment.candidates.create')}
            </DialogTitle>
            <DialogDescription>
              {t('recruitment.candidates.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={t('recruitment.candidates.name')}>
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                value={form.name}
              />
            </Field>
            <Field label={t('recruitment.candidates.phone')}>
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                value={form.phone}
              />
            </Field>
            <Field label={t('recruitment.candidates.email')}>
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                value={form.email}
              />
            </Field>
            <Field label={t('recruitment.candidates.position')}>
              <NativeSelect
                onChange={(value) =>
                  setForm((current) => ({ ...current, positionId: value }))
                }
                value={form.positionId}
              >
                <option value=''>
                  {t('recruitment.candidates.selectPosition')}
                </option>
                {(positions.data ?? []).map((position) => (
                  <option key={position.id} value={position.id}>
                    {`${position.title}（${position.department}）`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {isHr ? (
              <Field label={t('recruitment.candidates.recruiter')}>
                <NativeSelect
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      recruiterUsername: value,
                    }))
                  }
                  value={form.recruiterUsername}
                >
                  <option value=''>
                    {t('recruitment.candidates.recruiterPlaceholder')}
                  </option>
                  {recruiters.map((option) => (
                    <option key={option.username} value={option.username}>
                      {`${option.name}（${t(`recruitment.roles.${option.role}`)}）`}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label={t('recruitment.candidates.source')}>
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    source: event.target.value,
                  }))
                }
                value={form.source}
              />
            </Field>
            <div className='sm:col-span-2'>
              <Field label={t('recruitment.candidates.note')}>
                <textarea
                  className={`${inputClassName} min-h-16 py-2`}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  value={form.note}
                />
              </Field>
            </div>
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

      <CandidateDetailDialog
        candidateId={detailId}
        onChanged={candidates.reload}
        onClose={() => setDetailId(undefined)}
        role={me?.role ?? 'none'}
        staff={staff.data ?? []}
        username={me?.username ?? ''}
      />
    </PageContainer>
  );
}
