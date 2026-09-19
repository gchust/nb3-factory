import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

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
  completeInterview,
  createInterview,
  errorMessageKey,
  fetchCandidates,
  fetchInterviews,
  fetchStaff,
  updateInterview,
  type Interview,
} from './api.js';
import { DateTimeField } from './date-time-field.js';
import {
  addMonths,
  dateKeyOf,
  formatDateTime,
  isSameMonth,
  monthGrid,
  monthRange,
  startOfMonth,
  toDateKey,
  toDateTimeInput,
} from './format.js';
import { useAsyncData, useRecruitmentMe } from './hooks.js';
import {
  ErrorBanner,
  Field,
  InterviewStatusPill,
  NativeSelect,
  Panel,
  StateNotice,
  inputClassName,
} from './shared.js';

export default function RecruitmentInterviewsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const { me } = useRecruitmentMe(api);
  const isHr = me?.role === 'hr';
  const canSchedule = me?.role === 'hr' || me?.role === 'recruiter';

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [interviewerFilter, setInterviewerFilter] = useState('all');
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => monthRange(month), [month]);
  const interviews = useAsyncData(
    () =>
      fetchInterviews(api, {
        from: range.from,
        to: range.to,
        interviewerUsername:
          isHr && interviewerFilter !== 'all' ? interviewerFilter : undefined,
      }),
    `${range.from}|${range.to}|${isHr ? interviewerFilter : 'all'}`,
  );
  const staff = useAsyncData(
    () => (canSchedule ? fetchStaff(api) : Promise.resolve([])),
    `staff:${canSchedule}`,
  );
  const candidates = useAsyncData(
    () => (canSchedule ? fetchCandidates(api) : Promise.resolve([])),
    `candidates:${canSchedule}`,
  );

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleCandidate, setScheduleCandidate] = useState('');
  const [scheduleInterviewer, setScheduleInterviewer] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleMethod, setScheduleMethod] = useState('onsite');

  const [active, setActive] = useState<Interview>();
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [rescheduleMethod, setRescheduleMethod] = useState('onsite');
  const [evalScore, setEvalScore] = useState('80');
  const [evalResult, setEvalResult] = useState('pass');
  const [evalText, setEvalText] = useState('');
  const [evalOpen, setEvalOpen] = useState(false);

  const interviewers = (staff.data ?? []).filter(
    (option) => option.role === 'interviewer' || option.role === 'hr',
  );

  const days = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const interview of interviews.data ?? []) {
      const key = dateKeyOf(interview.scheduledAt);
      const list = map.get(key) ?? [];
      list.push(interview);
      map.set(key, list);
    }
    return map;
  }, [interviews.data]);

  const selectedKey = toDateKey(selectedDay);
  const selectedInterviews = byDay.get(selectedKey) ?? [];
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(
          new Date(2024, 0, 1 + index),
        ),
      ),
    [i18n.language],
  );

  function changeMonth(amount: number): void {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelectedDay(next);
  }

  async function onSchedule(): Promise<void> {
    if (!scheduleCandidate || !scheduleInterviewer || !scheduleAt) return;
    setBusy(true);
    setError(undefined);
    try {
      await createInterview(api, {
        candidateId: scheduleCandidate,
        interviewerUsername: scheduleInterviewer,
        scheduledAt: new Date(scheduleAt).toISOString(),
        method: scheduleMethod,
      });
      setNotice(t('recruitment.notices.interviewCreated'));
      setScheduleOpen(false);
      setScheduleCandidate('');
      setScheduleAt('');
      interviews.reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onReschedule(): Promise<void> {
    if (!active || !rescheduleAt) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await updateInterview(api, active.id, {
        scheduledAt: new Date(rescheduleAt).toISOString(),
        method: rescheduleMethod,
      });
      setActive(updated);
      setNotice(t('recruitment.notices.interviewCreated'));
      interviews.reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onEvaluate(): Promise<void> {
    if (!active) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await completeInterview(api, active.id, {
        score: evalScore === '' ? undefined : Number(evalScore),
        result: evalResult,
        evaluation: evalText,
      });
      setActive(updated);
      setEvalOpen(false);
      setNotice(t('recruitment.notices.interviewCompleted'));
      interviews.reload();
    } catch (cause: unknown) {
      setError(errorMessageKey(cause));
    } finally {
      setBusy(false);
    }
  }

  function openInterview(interview: Interview): void {
    setActive(interview);
    setRescheduleAt(toDateTimeInput(interview.scheduledAt));
    setRescheduleMethod(interview.method);
    setEvalScore(interview.score === null ? '80' : String(interview.score));
    setEvalResult(interview.result === 'fail' ? 'fail' : 'pass');
    setEvalText(interview.evaluation ?? '');
    setEvalOpen(false);
    setError(undefined);
  }

  const canEvaluateActive =
    active &&
    active.status === 'scheduled' &&
    (isHr || active.interviewerUsername === me?.username);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('recruitment.interviews.title')}
        description={t('recruitment.interviews.description')}
        actions={
          canSchedule ? (
            <Button
              onClick={() => {
                setScheduleOpen(true);
                setError(undefined);
              }}
              type='button'
            >
              <Plus className='size-4' />
              {t('recruitment.interviews.create')}
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

      <Panel className='flex flex-wrap items-center gap-2'>
        <Button onClick={() => changeMonth(-1)} type='button' variant='outline'>
          <ChevronLeft className='size-4' />
          {t('recruitment.interviews.previousMonth')}
        </Button>
        <Button onClick={() => changeMonth(1)} type='button' variant='outline'>
          {t('recruitment.interviews.nextMonth')}
          <ChevronRight className='size-4' />
        </Button>
        <Button
          onClick={() => {
            const today = new Date();
            setMonth(startOfMonth(today));
            setSelectedDay(today);
          }}
          type='button'
          variant='outline'
        >
          {t('recruitment.interviews.today')}
        </Button>
        <span className='text-sm font-medium'>
          {new Intl.DateTimeFormat(i18n.language, {
            year: 'numeric',
            month: 'long',
          }).format(month)}
        </span>
        {isHr ? (
          <div className='w-full max-w-[14rem]'>
            <NativeSelect
              ariaLabel={t('recruitment.interviews.interviewerFilter')}
              onChange={setInterviewerFilter}
              value={interviewerFilter}
            >
              <option value='all'>{t('recruitment.common.all')}</option>
              {interviewers.map((option) => (
                <option key={option.username} value={option.username}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <Button onClick={interviews.reload} type='button' variant='outline'>
          {t('recruitment.common.refresh')}
        </Button>
      </Panel>

      <StateNotice
        error={interviews.error}
        loading={interviews.loading}
        onRetry={interviews.reload}
      />

      <div className='grid gap-4 lg:grid-cols-[2fr_1fr]'>
        <div className='overflow-hidden rounded-xl border border-border'>
          <div className='grid grid-cols-7 border-b border-border bg-muted/50 text-center text-xs font-medium text-muted-foreground'>
            {weekdayLabels.map((label) => (
              <div className='px-1 py-2' key={label}>
                {label}
              </div>
            ))}
          </div>
          <div className='grid grid-cols-7'>
            {days.map((day) => {
              const key = toDateKey(day);
              const items = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const isSelected = key === selectedKey;
              return (
                <button
                  aria-label={key}
                  className={[
                    'min-h-20 border-b border-r border-border p-1.5 text-left align-top transition-colors',
                    inMonth
                      ? 'bg-background'
                      : 'bg-muted/30 text-muted-foreground',
                    isSelected
                      ? 'ring-2 ring-ring ring-inset'
                      : 'hover:bg-muted/40',
                  ].join(' ')}
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  type='button'
                >
                  <span className='text-xs font-medium'>{day.getDate()}</span>
                  <span className='mt-1 flex flex-col gap-0.5'>
                    {items.slice(0, 2).map((item) => (
                      <span
                        className='truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary'
                        key={item.id}
                      >
                        {item.candidateName}
                      </span>
                    ))}
                    {items.length > 2 ? (
                      <span className='text-[10px] text-muted-foreground'>
                        {`+${items.length - 2}`}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Panel className='space-y-3'>
          <h2 className='text-sm font-medium'>
            {`${t('recruitment.interviews.list')} · ${selectedKey}`}
          </h2>
          {selectedInterviews.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('recruitment.interviews.noInterviewsForDay')}
            </p>
          ) : (
            <ul className='space-y-2'>
              {selectedInterviews.map((interview) => (
                <li key={interview.id}>
                  <button
                    className='w-full rounded-lg border border-border p-3 text-left text-sm hover:bg-muted/40'
                    onClick={() => openInterview(interview)}
                    type='button'
                  >
                    <span className='flex items-center justify-between gap-2'>
                      <span className='font-medium'>
                        {interview.candidateName}
                      </span>
                      <InterviewStatusPill status={interview.status} />
                    </span>
                    <span className='mt-1 block text-muted-foreground'>
                      {`${formatDateTime(interview.scheduledAt, i18n.language)} · ${
                        interview.interviewerName ??
                        interview.interviewerUsername
                      }`}
                    </span>
                    <span className='mt-1 block text-xs text-muted-foreground'>
                      {interview.positionTitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Schedule a new interview */}
      <Dialog onOpenChange={setScheduleOpen} open={scheduleOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('recruitment.interviews.create')}</DialogTitle>
            <DialogDescription>
              {t('recruitment.interviews.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={t('recruitment.interviews.candidate')}>
              <NativeSelect
                onChange={setScheduleCandidate}
                value={scheduleCandidate}
              >
                <option value=''>
                  {t('recruitment.interviews.selectCandidate')}
                </option>
                {(candidates.data ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {`${candidate.name}（${candidate.positionTitle}）`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
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
              <NativeSelect onChange={setScheduleMethod} value={scheduleMethod}>
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
          </div>
          <ErrorBanner messageKey={error} />
          <DialogFooter>
            <Button
              onClick={() => setScheduleOpen(false)}
              type='button'
              variant='outline'
            >
              {t('recruitment.common.cancel')}
            </Button>
            <Button
              disabled={
                busy ||
                !scheduleCandidate ||
                !scheduleInterviewer ||
                !scheduleAt
              }
              onClick={() => void onSchedule()}
              type='button'
            >
              {t('recruitment.interviews.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interview detail and actions */}
      <Dialog
        onOpenChange={(open) => (open ? undefined : setActive(undefined))}
        open={Boolean(active)}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {active
                ? active.candidateName
                : t('recruitment.interviews.title')}
            </DialogTitle>
            <DialogDescription>
              {active
                ? `${active.positionTitle} · ${formatDateTime(active.scheduledAt, i18n.language)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {active ? (
            <div className='space-y-4'>
              <dl className='grid grid-cols-2 gap-3 text-sm'>
                <Info label={t('recruitment.interviews.interviewer')}>
                  {active.interviewerName ?? active.interviewerUsername}
                </Info>
                <Info label={t('recruitment.interviews.method')}>
                  {t(`recruitment.interviews.methods.${active.method}`, {
                    defaultValue: active.method,
                  })}
                </Info>
                <Info label={t('recruitment.interviews.score')}>
                  {active.score ?? '—'}
                </Info>
                <Info label={t('recruitment.interviews.result')}>
                  {active.result
                    ? t(`recruitment.interviews.results.${active.result}`)
                    : '—'}
                </Info>
                <Info label={t('recruitment.interviews.evaluation')}>
                  {active.evaluation ?? '—'}
                </Info>
              </dl>

              {canEvaluateActive ? (
                <section className='space-y-2 rounded-lg border border-border p-3'>
                  <h3 className='text-sm font-medium'>
                    {t('recruitment.interviews.completeTitle')}
                  </h3>
                  {evalOpen ? (
                    <div className='grid gap-2 sm:grid-cols-2'>
                      <Field label={t('recruitment.interviews.score')}>
                        <Input
                          max={100}
                          min={0}
                          onChange={(event) => setEvalScore(event.target.value)}
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
                      <div className='sm:col-span-2'>
                        <Field label={t('recruitment.interviews.evaluation')}>
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
                      <div className='sm:col-span-2'>
                        <Button
                          disabled={busy}
                          onClick={() => void onEvaluate()}
                          type='button'
                        >
                          {t('recruitment.interviews.save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setEvalOpen(true)}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      {t('recruitment.interviews.complete')}
                    </Button>
                  )}
                </section>
              ) : null}

              {canSchedule ? (
                <section className='space-y-2 rounded-lg border border-border p-3'>
                  <h3 className='text-sm font-medium'>
                    {t('recruitment.interviews.edit')}
                  </h3>
                  <div className='grid gap-2 sm:grid-cols-2'>
                    <div className='sm:col-span-2'>
                      <DateTimeField
                        label={t('recruitment.interviews.scheduledAt')}
                        onChange={setRescheduleAt}
                        value={rescheduleAt}
                      />
                    </div>
                    <Field label={t('recruitment.interviews.method')}>
                      <NativeSelect
                        onChange={setRescheduleMethod}
                        value={rescheduleMethod}
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
                    <div className='sm:col-span-2'>
                      <Button
                        disabled={busy || !rescheduleAt}
                        onClick={() => void onReschedule()}
                        type='button'
                        variant='outline'
                      >
                        {t('recruitment.common.save')}
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}

              <ErrorBanner messageKey={error} />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => setActive(undefined)}
              type='button'
              variant='outline'
            >
              {t('recruitment.common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
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
