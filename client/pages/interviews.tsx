import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CalendarPlus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import { Textarea } from '@/components/ui/textarea';
import {
  createInterview,
  listCandidates,
  listInterviewers,
  listInterviews,
  submitEvaluation,
  updateInterview,
  type Interview,
  type InterviewerOption,
} from '@/lib/recruiting-api';
import { errorText, useAsyncData } from '@/lib/recruiting-hooks';

const ROUNDS = ['initial', 'second', 'final'];
const SCORES = ['1', '2', '3', '4', '5'];
const CONCLUSIONS = ['pass', 'pending', 'fail'];

interface ScheduleForm {
  candidateId: string;
  round: string;
  scheduledAt: string;
  interviewerId: string;
  locationOrLink: string;
}

interface EvaluationForm {
  technicalScore: string;
  communicationScore: string;
  conclusion: string;
  comments: string;
}

export default function InterviewsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const [notice, setNotice] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>({
    candidateId: '',
    round: 'initial',
    scheduledAt: '',
    interviewerId: '',
    locationOrLink: '',
  });
  const [evaluating, setEvaluating] = useState<Interview | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationForm>({
    technicalScore: '3',
    communicationScore: '3',
    conclusion: 'pending',
    comments: '',
  });
  const [busy, setBusy] = useState(false);

  // The interviewer list is only readable by schedulers; a refused probe hides scheduling controls.
  const capabilities = useAsyncData(async () => {
    try {
      const interviewers = await listInterviewers(client);
      return interviewers;
    } catch {
      return null as InterviewerOption[] | null;
    }
  }, []);
  const canSchedule =
    capabilities.status === 'ready' && capabilities.data !== null;

  const candidates = useAsyncData(
    () => (canSchedule ? listCandidates(client) : Promise.resolve([])),
    [canSchedule],
  );
  const interviews = useAsyncData(() => listInterviews(client), []);

  function openSchedule(): void {
    setForm({
      candidateId: '',
      round: 'initial',
      scheduledAt: '',
      interviewerId: '',
      locationOrLink: '',
    });
    setNotice('');
    setScheduleOpen(true);
  }

  async function saveSchedule(): Promise<void> {
    setBusy(true);
    setNotice('');
    try {
      await createInterview(client, {
        candidateId: Number(form.candidateId),
        round: form.round,
        scheduledAt: form.scheduledAt,
        interviewerId: form.interviewerId || null,
        locationOrLink: form.locationOrLink || null,
      });
      setScheduleOpen(false);
      setNotice(t('recruiting.interviews.scheduled'));
      interviews.reload();
      candidates.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    } finally {
      setBusy(false);
    }
  }

  function openEvaluation(interview: Interview): void {
    const existing = interview.evaluation;
    setEvaluation({
      technicalScore: existing ? String(existing.technicalScore) : '3',
      communicationScore: existing ? String(existing.communicationScore) : '3',
      conclusion: existing ? existing.conclusion : 'pending',
      comments: existing?.comments ?? '',
    });
    setNotice('');
    setEvaluating(interview);
  }

  async function saveEvaluation(): Promise<void> {
    if (!evaluating) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await submitEvaluation(client, evaluating.id, {
        technicalScore: Number(evaluation.technicalScore),
        communicationScore: Number(evaluation.communicationScore),
        conclusion: evaluation.conclusion,
        comments: evaluation.comments || undefined,
      });
      setEvaluating(null);
      setNotice(
        t('recruiting.interviews.evaluationSaved', {
          score: result.overallScore,
        }),
      );
      interviews.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(
    interview: Interview,
    status: string,
  ): Promise<void> {
    setNotice('');
    try {
      await updateInterview(client, interview.id, { status });
      interviews.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    }
  }

  return (
    <PageSection>
      <PageHeader
        title={t('recruiting.interviews.title')}
        description={t('recruiting.interviews.description')}
        actions={
          canSchedule ? (
            <Button onClick={openSchedule}>
              <CalendarPlus aria-hidden />
              {t('recruiting.interviews.new')}
            </Button>
          ) : undefined
        }
      />

      {notice ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {notice}
        </p>
      ) : null}

      <Panel>
        {interviews.status === 'loading' ? (
          <LoadingState label={t('recruiting.state.loading')} />
        ) : null}
        {interviews.status === 'error' ? (
          <ErrorState
            message={interviews.message ?? t('recruiting.state.error')}
            onRetry={interviews.reload}
          />
        ) : null}
        {interviews.status === 'ready' &&
        (interviews.data?.length ?? 0) === 0 ? (
          <EmptyState label={t('recruiting.interviews.empty')} />
        ) : null}
        {interviews.status === 'ready' && (interviews.data?.length ?? 0) > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recruiting.fields.candidate')}</TableHead>
                <TableHead>{t('recruiting.fields.round')}</TableHead>
                <TableHead>{t('recruiting.fields.scheduledAt')}</TableHead>
                <TableHead>{t('recruiting.fields.interviewer')}</TableHead>
                <TableHead>{t('recruiting.fields.status')}</TableHead>
                <TableHead>{t('recruiting.fields.evaluation')}</TableHead>
                <TableHead className='text-right'>
                  {t('recruiting.fields.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interviews.data?.map((interview) => (
                <TableRow key={interview.id}>
                  <TableCell className='font-medium'>
                    {interview.candidateName ?? `#${interview.candidateId}`}
                    {interview.requisitionTitle ? (
                      <span className='block text-xs text-muted-foreground'>
                        {interview.requisitionTitle}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <EnumBadge kind='round' value={interview.round} />
                  </TableCell>
                  <TableCell>{formatDateTime(interview.scheduledAt)}</TableCell>
                  <TableCell>
                    {interview.interviewerName ??
                      interview.interviewerId ??
                      '—'}
                  </TableCell>
                  <TableCell>
                    <EnumBadge
                      kind='interviewStatus'
                      value={interview.status}
                    />
                  </TableCell>
                  <TableCell>
                    {interview.evaluation ? (
                      <span className='text-sm tabular-nums'>
                        {interview.evaluation.technicalScore}/
                        {interview.evaluation.communicationScore}{' '}
                        <EnumBadge
                          kind='conclusion'
                          value={interview.evaluation.conclusion}
                        />
                      </span>
                    ) : (
                      <span className='text-sm text-muted-foreground'>
                        {t('recruiting.interviews.notEvaluated')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => openEvaluation(interview)}
                      >
                        {interview.evaluation
                          ? t('recruiting.interviews.editEvaluation')
                          : t('recruiting.interviews.evaluate')}
                      </Button>
                      {canSchedule && interview.status === 'scheduled' ? (
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            void changeStatus(interview, 'cancelled')
                          }
                        >
                          {t('recruiting.actions.cancel')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Panel>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recruiting.interviews.new')}</DialogTitle>
          </DialogHeader>
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void saveSchedule();
            }}
          >
            <Field label={t('recruiting.fields.candidate')}>
              <Select
                value={form.candidateId}
                onValueChange={(value) =>
                  setForm({ ...form, candidateId: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.candidate')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(candidates.data ?? []).map((candidate) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.round')}>
              <Select
                value={form.round}
                onValueChange={(value) =>
                  setForm({ ...form, round: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.round')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUNDS.map((round) => (
                    <SelectItem key={round} value={round}>
                      {t(`recruiting.enums.round.${round}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.scheduledAt')}>
              <Input
                type='datetime-local'
                required
                value={form.scheduledAt}
                onChange={(event) =>
                  setForm({ ...form, scheduledAt: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.interviewer')}>
              <Select
                value={form.interviewerId}
                onValueChange={(value) =>
                  setForm({ ...form, interviewerId: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.interviewer')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(capabilities.data ?? []).map((interviewer) => (
                    <SelectItem key={interviewer.id} value={interviewer.id}>
                      {interviewer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.locationOrLink')}>
              <Input
                value={form.locationOrLink}
                onChange={(event) =>
                  setForm({ ...form, locationOrLink: event.target.value })
                }
              />
            </Field>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setScheduleOpen(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type='submit'
                disabled={busy || !form.candidateId || !form.scheduledAt}
              >
                {busy ? t('recruiting.state.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={evaluating !== null}
        onOpenChange={(open) => {
          if (!open) setEvaluating(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recruiting.interviews.evaluate')}</DialogTitle>
          </DialogHeader>
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void saveEvaluation();
            }}
          >
            <Field label={t('recruiting.fields.technicalScore')}>
              <Select
                value={evaluation.technicalScore}
                onValueChange={(value) =>
                  setEvaluation({ ...evaluation, technicalScore: value ?? '' })
                }
              >
                <SelectTrigger
                  aria-label={t('recruiting.fields.technicalScore')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORES.map((score) => (
                    <SelectItem key={score} value={score}>
                      {score}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.communicationScore')}>
              <Select
                value={evaluation.communicationScore}
                onValueChange={(value) =>
                  setEvaluation({
                    ...evaluation,
                    communicationScore: value ?? '',
                  })
                }
              >
                <SelectTrigger
                  aria-label={t('recruiting.fields.communicationScore')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORES.map((score) => (
                    <SelectItem key={score} value={score}>
                      {score}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.conclusion')}>
              <Select
                value={evaluation.conclusion}
                onValueChange={(value) =>
                  setEvaluation({ ...evaluation, conclusion: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.conclusion')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCLUSIONS.map((conclusion) => (
                    <SelectItem key={conclusion} value={conclusion}>
                      {t(`recruiting.enums.conclusion.${conclusion}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.comments')}>
              <Textarea
                rows={3}
                value={evaluation.comments}
                onChange={(event) =>
                  setEvaluation({ ...evaluation, comments: event.target.value })
                }
              />
            </Field>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEvaluating(null)}
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
