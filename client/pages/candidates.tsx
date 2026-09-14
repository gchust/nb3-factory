import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import {
  EmptyState,
  EnumBadge,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  PageSection,
  Panel,
} from '@/components/recruiting/ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createCandidate,
  listCandidates,
  requisitionOptions,
  updateCandidate,
  uploadResume,
  type Candidate,
} from '@/lib/recruiting-api';
import { errorText, useAsyncData } from '@/lib/recruiting-hooks';

const SOURCES = ['referral', 'job_board', 'headhunter', 'campus'];
const STAGES = [
  'screening',
  'invited',
  'interviewing',
  'pending',
  'hired',
  'rejected',
];

interface FormState {
  name: string;
  phone: string;
  email: string;
  requisitionId: string;
  source: string;
  stage: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  phone: '',
  email: '',
  requisitionId: '',
  source: 'referral',
  stage: 'screening',
};

export default function CandidatesPage(): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const [stageFilter, setStageFilter] = useState('all');
  const [requisitionFilter, setRequisitionFilter] = useState('all');
  const [editing, setEditing] = useState<Candidate | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [resume, setResume] = useState<File | null>(null);
  const [existingResume, setExistingResume] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const requisitions = useAsyncData(() => requisitionOptions(client), []);
  const candidates = useAsyncData(
    () =>
      listCandidates(client, {
        ...(stageFilter === 'all' ? {} : { stage: stageFilter }),
        ...(requisitionFilter === 'all'
          ? {}
          : { requisitionId: Number(requisitionFilter) }),
      }),
    [stageFilter, requisitionFilter],
  );

  function openCreate(): void {
    setForm(EMPTY_FORM);
    setResume(null);
    setExistingResume(null);
    setNotice('');
    setEditing('new');
  }

  function openEdit(candidate: Candidate): void {
    setForm({
      name: candidate.name,
      phone: candidate.phone ?? '',
      email: candidate.email ?? '',
      requisitionId:
        candidate.requisitionId === null ? '' : String(candidate.requisitionId),
      source: candidate.source,
      stage: candidate.stage,
    });
    setResume(null);
    setExistingResume(candidate.resumeFilename);
    setNotice('');
    setEditing(candidate);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setNotice('');
    try {
      let resumeFileId: string | null | undefined = undefined;
      let resumeFilename: string | null | undefined = undefined;
      if (resume) {
        const uploaded = await uploadResume(client, resume);
        resumeFileId = uploaded.fileId;
        resumeFilename = uploaded.filename;
      }
      const payload = {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        requisitionId: form.requisitionId ? Number(form.requisitionId) : null,
        source: form.source,
        stage: form.stage,
        ...(resumeFileId !== undefined ? { resumeFileId, resumeFilename } : {}),
      };
      if (editing === 'new') {
        await createCandidate(client, payload);
      } else if (editing) {
        await updateCandidate(client, editing.id, payload);
      }
      setEditing(null);
      setNotice(t('recruiting.candidates.saved'));
      candidates.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection>
      <PageHeader
        title={t('recruiting.candidates.title')}
        description={t('recruiting.candidates.description')}
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            {t('recruiting.candidates.new')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-end gap-4'>
        <label
          className='grid gap-1.5 text-sm'
          htmlFor='candidate-stage-filter'
        >
          <span className='text-muted-foreground'>
            {t('recruiting.filters.stage')}
          </span>
          <Select
            value={stageFilter}
            onValueChange={(value) => setStageFilter(value ?? '')}
          >
            <SelectTrigger id='candidate-stage-filter' className='w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('recruiting.filters.all')}</SelectItem>
              {STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {t(`recruiting.enums.stage.${stage}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label
          className='grid gap-1.5 text-sm'
          htmlFor='candidate-requisition-filter'
        >
          <span className='text-muted-foreground'>
            {t('recruiting.filters.requisition')}
          </span>
          <Select
            value={requisitionFilter}
            onValueChange={(value) => setRequisitionFilter(value ?? '')}
          >
            <SelectTrigger id='candidate-requisition-filter' className='w-56'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('recruiting.filters.all')}</SelectItem>
              {(requisitions.data ?? []).map((requisition) => (
                <SelectItem key={requisition.id} value={String(requisition.id)}>
                  {requisition.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {notice ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {notice}
        </p>
      ) : null}

      <Panel>
        {candidates.status === 'loading' ? (
          <LoadingState label={t('recruiting.state.loading')} />
        ) : null}
        {candidates.status === 'error' ? (
          <ErrorState
            message={candidates.message ?? t('recruiting.state.error')}
            onRetry={candidates.reload}
          />
        ) : null}
        {candidates.status === 'ready' &&
        (candidates.data?.length ?? 0) === 0 ? (
          <EmptyState label={t('recruiting.candidates.empty')} />
        ) : null}
        {candidates.status === 'ready' && (candidates.data?.length ?? 0) > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recruiting.fields.name')}</TableHead>
                <TableHead>{t('recruiting.fields.requisition')}</TableHead>
                <TableHead>{t('recruiting.fields.source')}</TableHead>
                <TableHead>{t('recruiting.fields.stage')}</TableHead>
                <TableHead>{t('recruiting.fields.overallScore')}</TableHead>
                <TableHead>{t('recruiting.fields.resume')}</TableHead>
                <TableHead className='text-right'>
                  {t('recruiting.fields.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.data?.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell className='font-medium'>
                    <Link
                      className='text-primary underline-offset-4 hover:underline'
                      to={`/candidates/${candidate.id}`}
                    >
                      {candidate.name}
                    </Link>
                  </TableCell>
                  <TableCell>{candidate.requisitionTitle ?? '—'}</TableCell>
                  <TableCell>
                    <EnumBadge kind='source' value={candidate.source} />
                  </TableCell>
                  <TableCell>
                    <EnumBadge kind='stage' value={candidate.stage} />
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {candidate.overallScore === null
                      ? '—'
                      : candidate.overallScore}
                  </TableCell>
                  <TableCell>
                    {candidate.resumeFilename ? (
                      <span className='text-sm'>
                        {candidate.resumeFilename}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => openEdit(candidate)}
                      >
                        {t('recruiting.actions.edit')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Panel>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new'
                ? t('recruiting.candidates.new')
                : t('recruiting.candidates.edit')}
            </DialogTitle>
          </DialogHeader>
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field label={t('recruiting.fields.name')}>
              <Input
                value={form.name}
                required
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.phone')}>
              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.email')}>
              <Input
                type='email'
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.requisition')}>
              <Select
                value={form.requisitionId}
                onValueChange={(value) =>
                  setForm({ ...form, requisitionId: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.requisition')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(requisitions.data ?? []).map((requisition) => (
                    <SelectItem
                      key={requisition.id}
                      value={String(requisition.id)}
                    >
                      {requisition.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.source')}>
              <Select
                value={form.source}
                onValueChange={(value) =>
                  setForm({ ...form, source: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.source')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {t(`recruiting.enums.source.${source}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.stage')}>
              <Select
                value={form.stage}
                onValueChange={(value) =>
                  setForm({ ...form, stage: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.stage')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {t(`recruiting.enums.stage.${stage}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.resume')}>
              <Input
                type='file'
                accept='.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg'
                onChange={(event) => setResume(event.target.files?.[0] ?? null)}
              />
            </Field>
            {existingResume && !resume ? (
              <p className='text-sm text-muted-foreground'>
                {t('recruiting.candidates.currentResume', {
                  filename: existingResume,
                })}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditing(null)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {busy ? t('recruiting.state.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
