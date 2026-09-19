import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

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
  changeStage,
  completeInterview,
  createInterview,
  errorMessageKey,
  fetchCandidate,
  setOnboardingStatus,
  type CandidateDetail as CandidateDetailData,
  type Interview,
  type RecruitmentRole,
  type StaffOption,
} from './api.js';
import { DateTimeField } from './date-time-field.js';
import { CandidateFilesSection } from './candidate-files.js';
import { formatDateTime } from './format.js';
import {
  ErrorBanner,
  Field,
  InterviewStatusPill,
  NativeSelect,
  Pill,
  StagePill,
  inputClassName,
} from './shared.js';

const TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ['interviewed', 'rejected'],
  interviewed: ['pending_offer', 'rejected'],
  pending_offer: ['offered', 'rejected'],
  offered: ['onboarded'],
  onboarded: [],
  rejected: ['pending'],
};

const HIRE_TARGETS = new Set(['offered', 'onboarded', 'pending']);

export interface CandidateDetailProps {
  readonly candidateId: string | undefined;
  readonly role: RecruitmentRole;
  readonly username: string;
  readonly staff: readonly StaffOption[];
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

export function CandidateDetailDialog({
  candidateId,
  role,
  username,
  staff,
  onClose,
  onChanged,
}: CandidateDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [detail, setDetail] = useState<CandidateDetailData>();
  const [loadedId, setLoadedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleInterviewer, setScheduleInterviewer] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleMethod, setScheduleMethod] = useState('onsite');

  const [evaluating, setEvaluating] = useState<string>();
  const [evalScore, setEvalScore] = useState('80');
  const [evalResult, setEvalResult] = useState('pass');
  const [evalText, setEvalText] = useState('');

  const canEdit = role === 'hr' || role === 'recruiter';
  const interviewers = staff.filter(
    (option) => option.role === 'interviewer' || option.role === 'hr',
  );

  useEffect(() => {
    if (!candidateId) return;
    let active = true;
    fetchCandidate(api, candidateId).then(
      (result) => {
        if (active) {
          setDetail(result);
          setLoadedId(candidateId);
          setError(undefined);
          setNotice(undefined);
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(errorMessageKey(cause));
          setLoadedId(candidateId);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, candidateId]);

  const loading = Boolean(candidateId) && loadedId !== candidateId;

  function reload(): void {
    if (!candidateId) return;
    setBusy(true);
    fetchCandidate(api, candidateId)
      .then((result) => {
        setDetail(result);
        onChanged();
      })
      .catch((cause: unknown) => setError(errorMessageKey(cause)))
      .finally(() => setBusy(false));
  }

  async function onStage(target: string): Promise<void> {
    if (!detail || !candidateId) return;
    setBusy(true);
    setError(undefined);
    try {
      await changeStage(
        api,
        candidateId,
        target,
        target === 'rejected' ? rejectReason : undefined,
      );
      setNotice(
        target === 'offered'
          ? t('recruitment.notices.hired')
          : target === 'rejected'
            ? t('recruitment.notices.rejected')
            : t('recruitment.notices.stageChanged'),
      );
      setRejectOpen(false);
      setRejectReason('');
      reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onSchedule(): Promise<void> {
    if (!detail || !scheduleInterviewer || !scheduleAt) return;
    setBusy(true);
    setError(undefined);
    try {
      await createInterview(api, {
        candidateId: detail.candidate.id,
        interviewerUsername: scheduleInterviewer,
        scheduledAt: new Date(scheduleAt).toISOString(),
        method: scheduleMethod,
      });
      setNotice(t('recruitment.notices.interviewCreated'));
      setScheduleOpen(false);
      setScheduleAt('');
      reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(interview: Interview): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await completeInterview(api, interview.id, {
        score: evalScore === '' ? undefined : Number(evalScore),
        result: evalResult,
        evaluation: evalText,
      });
      setNotice(t('recruitment.notices.interviewCompleted'));
      setEvaluating(undefined);
      setEvalText('');
      reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleTodo(
    id: string,
    status: 'pending' | 'done',
  ): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await setOnboardingStatus(api, id, status);
      setNotice(t('recruitment.notices.onboardingUpdated'));
      reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  const candidate = detail?.candidate;
  const allowed = candidate ? (TRANSITIONS[candidate.stage] ?? []) : [];
  const visibleTargets = allowed.filter(
    (target) => !HIRE_TARGETS.has(target) || role === 'hr',
  );

  return (
    <Dialog
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(candidateId)}
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('recruitment.candidates.detailTitle')}
            {candidate ? ` · ${candidate.name}` : ''}
          </DialogTitle>
          <DialogDescription>
            {candidate
              ? `${candidate.positionTitle} · ${candidate.department}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className='text-sm text-muted-foreground'>
            {t('recruitment.common.loading')}
          </p>
        ) : null}
        <ErrorBanner messageKey={error} />
        {notice ? (
          <div
            className='rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary'
            role='status'
          >
            {notice}
          </div>
        ) : null}

        {candidate ? (
          <div className='max-h-[65vh] space-y-4 overflow-y-auto pr-1'>
            {role === 'interviewer' ? (
              <div className='rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
                {t('recruitment.candidates.limitedNotice')}
              </div>
            ) : null}

            <dl className='grid grid-cols-2 gap-3 text-sm'>
              <Info label={t('recruitment.candidates.stage')}>
                <StagePill stage={candidate.stage} />
              </Info>
              <Info label={t('recruitment.candidates.recruiter')}>
                {(candidate.recruiterName ?? candidate.recruiterUsername) ||
                  '—'}
              </Info>
              <Info label={t('recruitment.candidates.phone')}>
                {candidate.phone ?? '—'}
              </Info>
              <Info label={t('recruitment.candidates.email')}>
                {candidate.email ?? '—'}
              </Info>
              <Info label={t('recruitment.candidates.source')}>
                {candidate.source ?? '—'}
              </Info>
              <Info label={t('recruitment.candidates.updatedAt')}>
                {formatDateTime(candidate.updatedAt, i18n.language)}
              </Info>
              {candidate.note ? (
                <Info label={t('recruitment.candidates.note')}>
                  {candidate.note}
                </Info>
              ) : null}
            </dl>

            {candidate.hireConfirmedBy || candidate.rejectionReason ? (
              <section className='space-y-2 rounded-lg border border-border p-3'>
                <h3 className='text-sm font-medium'>
                  {t('recruitment.candidates.hireInfo')}
                </h3>
                <dl className='grid grid-cols-2 gap-3 text-sm'>
                  <Info label={t('recruitment.candidates.hireConfirmedBy')}>
                    {candidate.hireConfirmedBy ?? '—'}
                  </Info>
                  <Info label={t('recruitment.candidates.offeredAt')}>
                    {formatDateTime(candidate.offeredAt, i18n.language)}
                  </Info>
                  <Info label={t('recruitment.candidates.onboardedAt')}>
                    {formatDateTime(candidate.onboardedAt, i18n.language)}
                  </Info>
                  <Info label={t('recruitment.candidates.rejectionReason')}>
                    {candidate.rejectionReason ?? '—'}
                  </Info>
                </dl>
              </section>
            ) : null}

            {canEdit &&
            (visibleTargets.length > 0 || candidate.stage !== 'onboarded') ? (
              <section className='space-y-2 rounded-lg border border-border p-3'>
                <h3 className='text-sm font-medium'>
                  {t('recruitment.candidates.stageActions')}
                </h3>
                <div className='flex flex-wrap gap-2'>
                  {visibleTargets
                    .filter((target) => target !== 'rejected')
                    .map((target) => (
                      <Button
                        disabled={busy}
                        key={target}
                        onClick={() => void onStage(target)}
                        size='sm'
                        type='button'
                        variant={target === 'offered' ? 'default' : 'outline'}
                      >
                        {target === 'offered'
                          ? t('recruitment.candidates.hire')
                          : target === 'pending'
                            ? t('recruitment.candidates.reopen')
                            : t(`recruitment.stages.${target}`)}
                      </Button>
                    ))}
                  {allowed.includes('rejected') ? (
                    <Button
                      disabled={busy}
                      onClick={() => setRejectOpen((value) => !value)}
                      size='sm'
                      type='button'
                      variant='destructive'
                    >
                      {t('recruitment.candidates.reject')}
                    </Button>
                  ) : null}
                </div>
                {rejectOpen ? (
                  <div className='space-y-2'>
                    <Field label={t('recruitment.candidates.reason')}>
                      <Input
                        onChange={(event) =>
                          setRejectReason(event.target.value)
                        }
                        placeholder={t(
                          'recruitment.candidates.reasonPlaceholder',
                        )}
                        value={rejectReason}
                      />
                    </Field>
                    <Button
                      disabled={busy}
                      onClick={() => void onStage('rejected')}
                      size='sm'
                      type='button'
                      variant='destructive'
                    >
                      {t('recruitment.common.confirm')}
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className='space-y-3 rounded-lg border border-border p-3'>
              <div>
                <h3 className='text-sm font-medium'>
                  {t('recruitment.files.title')}
                </h3>
                <p className='text-xs text-muted-foreground'>
                  {t('recruitment.files.description')}
                </p>
              </div>
              <CandidateFilesSection
                candidateId={candidate.id}
                files={detail?.files ?? []}
                onChanged={reload}
                onError={(key) => {
                  setNotice(undefined);
                  setError(key);
                }}
                onNotice={(key) => {
                  setError(undefined);
                  setNotice(t(key));
                }}
                role={role}
              />
            </section>

            <section className='space-y-2 rounded-lg border border-border p-3'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-medium'>
                  {t('recruitment.candidates.interviews')}
                </h3>
                {canEdit ? (
                  <Button
                    onClick={() => setScheduleOpen((value) => !value)}
                    size='sm'
                    type='button'
                    variant='outline'
                  >
                    {t('recruitment.candidates.addInterview')}
                  </Button>
                ) : null}
              </div>

              {scheduleOpen ? (
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field label={t('recruitment.interviews.interviewer')}>
                    <NativeSelect
                      onChange={setScheduleInterviewer}
                      value={scheduleInterviewer}
                    >
                      <option value=''>
                        {t('recruitment.interviews.selectInterviewer')}
                      </option>
                      {interviewers.map((option) => (
                        <option key={option.username} value={option.username}>
                          {`${option.name}（${t(`recruitment.roles.${option.role}`)}）`}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <div className='sm:col-span-2'>
                    <DateTimeField
                      label={t('recruitment.interviews.scheduledAt')}
                      onChange={setScheduleAt}
                      value={scheduleAt}
                    />
                  </div>
                  <Field label={t('recruitment.interviews.method')}>
                    <NativeSelect
                      onChange={setScheduleMethod}
                      value={scheduleMethod}
                    >
                      <option value='onsite'>
                        {t('recruitment.interviews.methods.onsite')}
                      </option>
                      <option value='video'>
                        {t('recruitment.interviews.methods.video')}
                      </option>
                      <option value='phone'>
                        {t('recruitment.interviews.methods.phone')}
                      </option>
                    </NativeSelect>
                  </Field>
                  <div className='flex items-end'>
                    <Button
                      disabled={busy || !scheduleInterviewer || !scheduleAt}
                      onClick={() => void onSchedule()}
                      type='button'
                    >
                      {t('recruitment.interviews.save')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {(detail?.interviews ?? []).length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('recruitment.candidates.noInterviews')}
                </p>
              ) : (
                <ul className='space-y-2'>
                  {(detail?.interviews ?? []).map((interview) => {
                    const canEvaluate =
                      interview.status === 'scheduled' &&
                      (role === 'hr' ||
                        interview.interviewerUsername === username);
                    return (
                      <li
                        className='rounded-lg border border-border p-3 text-sm'
                        key={interview.id}
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <span className='font-medium'>
                            {formatDateTime(
                              interview.scheduledAt,
                              i18n.language,
                            )}
                          </span>
                          <InterviewStatusPill status={interview.status} />
                        </div>
                        <p className='mt-1 text-muted-foreground'>
                          {`${interview.interviewerName ?? interview.interviewerUsername} · ${t(`recruitment.interviews.methods.${interview.method}`, { defaultValue: interview.method })}`}
                        </p>
                        {interview.resumeVersion !== null ? (
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {t('recruitment.interviews.resumeVersion', {
                              version: interview.resumeVersion,
                            })}
                          </p>
                        ) : null}
                        {interview.status === 'completed' ? (
                          <p className='mt-1'>
                            {`${t('recruitment.interviews.score')}: ${interview.score ?? '—'} · ${t('recruitment.interviews.result')}: ${interview.result === 'pass' ? t('recruitment.interviews.results.pass') : t('recruitment.interviews.results.fail')}`}
                          </p>
                        ) : null}
                        {interview.evaluation ? (
                          <p className='mt-1 text-muted-foreground'>
                            {interview.evaluation}
                          </p>
                        ) : null}
                        {canEvaluate ? (
                          evaluating === interview.id ? (
                            <div className='mt-2 grid gap-2 sm:grid-cols-3'>
                              <Field label={t('recruitment.interviews.score')}>
                                <Input
                                  max={100}
                                  min={0}
                                  onChange={(event) =>
                                    setEvalScore(event.target.value)
                                  }
                                  placeholder={t(
                                    'recruitment.interviews.scorePlaceholder',
                                  )}
                                  type='number'
                                  value={evalScore}
                                />
                              </Field>
                              <Field label={t('recruitment.interviews.result')}>
                                <NativeSelect
                                  onChange={setEvalResult}
                                  value={evalResult}
                                >
                                  <option value='pass'>
                                    {t('recruitment.interviews.results.pass')}
                                  </option>
                                  <option value='fail'>
                                    {t('recruitment.interviews.results.fail')}
                                  </option>
                                </NativeSelect>
                              </Field>
                              <div className='sm:col-span-3'>
                                <Field
                                  label={t('recruitment.interviews.evaluation')}
                                >
                                  <textarea
                                    className={`${inputClassName} min-h-16 py-2`}
                                    onChange={(event) =>
                                      setEvalText(event.target.value)
                                    }
                                    placeholder={t(
                                      'recruitment.interviews.evaluationPlaceholder',
                                    )}
                                    value={evalText}
                                  />
                                </Field>
                              </div>
                              <div className='sm:col-span-3'>
                                <Button
                                  disabled={busy}
                                  onClick={() => void onComplete(interview)}
                                  size='sm'
                                  type='button'
                                >
                                  {t('recruitment.interviews.save')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              className='mt-2'
                              onClick={() => setEvaluating(interview.id)}
                              size='sm'
                              type='button'
                              variant='outline'
                            >
                              {t('recruitment.interviews.complete')}
                            </Button>
                          )
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {canEdit ? (
              <section className='space-y-2 rounded-lg border border-border p-3'>
                <h3 className='text-sm font-medium'>
                  {t('recruitment.candidates.onboarding')}
                </h3>
                {(detail?.onboarding ?? []).length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('recruitment.candidates.noOnboarding')}
                  </p>
                ) : (
                  <ul className='space-y-2'>
                    {(detail?.onboarding ?? []).map((todo) => (
                      <li
                        className='flex items-center justify-between gap-2 text-sm'
                        key={todo.id}
                      >
                        <span>{todo.title}</span>
                        <span className='flex items-center gap-2'>
                          <Pill
                            tone={todo.status === 'done' ? 'primary' : 'muted'}
                          >
                            {todo.status === 'done'
                              ? t('recruitment.onboarding.done')
                              : t('recruitment.onboarding.pending')}
                          </Pill>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void onToggleTodo(
                                todo.id,
                                todo.status === 'done' ? 'pending' : 'done',
                              )
                            }
                            size='sm'
                            type='button'
                            variant='outline'
                          >
                            {todo.status === 'done'
                              ? t('recruitment.onboarding.markPending')
                              : t('recruitment.onboarding.markDone')}
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('recruitment.common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='min-w-0'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5 break-words'>{children}</dd>
    </div>
  );
}
