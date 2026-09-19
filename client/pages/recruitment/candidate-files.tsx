import { ApiClientError, useApiClient, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download, Eye, LoaderCircle, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  FilePreviewDialog,
  FileThumbnail,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';

import {
  attachCandidateFiles,
  errorMessageKey,
  removeCandidateFile,
  type CandidateFile,
  type CandidateFileCategory,
  type RecruitmentRole,
} from './api.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_SELECTION = 5;

/**
 * The upload control reports its own validation errors as plain `Error`s with
 * fixed messages. Map them to the application's own keys so the prompt is
 * localized, and fall back to the shared API error mapping otherwise.
 */
function uploadErrorKey(cause: unknown): string {
  if (cause instanceof ApiClientError) return errorMessageKey(cause);
  if (cause instanceof Error) {
    switch (cause.message) {
      case 'File is empty.':
        return 'recruitment.files.errors.empty';
      case 'File exceeds the maximum size.':
        return 'recruitment.files.errors.tooLarge';
      case 'The maximum number of files has been reached.':
        return 'recruitment.files.errors.tooMany';
      case 'File type is not allowed.':
        return 'recruitment.files.errors.type';
      default:
        break;
    }
  }
  return 'recruitment.errors.unknown';
}

const UPLOAD_TARGETS: readonly {
  readonly category: CandidateFileCategory;
  readonly labelKey: string;
}[] = [
  { category: 'resume', labelKey: 'recruitment.files.uploadResume' },
  { category: 'portfolio', labelKey: 'recruitment.files.uploadPortfolio' },
  { category: 'offer', labelKey: 'recruitment.files.uploadOffer' },
];

export interface CandidateFilesSectionProps {
  readonly candidateId: string;
  readonly role: RecruitmentRole;
  readonly files: readonly CandidateFile[];
  readonly onChanged: () => void;
  readonly onNotice: (messageKey: string) => void;
  readonly onError: (messageKey: string) => void;
}

interface PreviewState {
  readonly files: readonly CandidateFile[];
  readonly index: number;
}

/**
 * Candidate detail attachments.
 *
 * Resume, portfolio and offer materials are shown as three separate groups.
 * The server already drops offer materials for an interviewer, so this only
 * decides which upload or removal controls to render. Preview and download
 * always go through the authorized content URL, never a copied path.
 */
export function CandidateFilesSection({
  candidateId,
  role,
  files,
  onChanged,
  onNotice,
  onError,
}: CandidateFilesSectionProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('recruitmentCandidateFiles'),
    [manager],
  );
  const [preview, setPreview] = useState<PreviewState>();
  const [linking, setLinking] = useState<CandidateFileCategory>();
  const [busyId, setBusyId] = useState<string>();
  const [uploadingCategories, setUploadingCategories] = useState<
    ReadonlySet<CandidateFileCategory>
  >(() => new Set());

  const canEdit = role === 'hr' || role === 'recruiter';
  const resumes = files.filter((file) => file.category === 'resume');
  const activeResume = resumes.find((file) => !file.superseded) ?? resumes[0];
  const resumeHistory = resumes.filter((file) => file.id !== activeResume?.id);
  const portfolio = files.filter((file) => file.category === 'portfolio');
  const offers = files.filter((file) => file.category === 'offer');
  const processing = Boolean(linking) || uploadingCategories.size > 0;

  function setCategoryUploading(
    category: CandidateFileCategory,
    uploading: boolean,
  ): void {
    setUploadingCategories((current) => {
      if (uploading === current.has(category)) return current;
      const next = new Set(current);
      if (uploading) next.add(category);
      else next.delete(category);
      return next;
    });
  }

  async function onUploaded(
    category: CandidateFileCategory,
    records: readonly FileRecord[],
  ): Promise<void> {
    const known = new Set(files.map((file) => file.id));
    const fileIds = records
      .map((record) => record.id)
      .filter((id) => !known.has(id));
    if (!fileIds.length) return;
    setLinking(category);
    try {
      await attachCandidateFiles(api, candidateId, {
        category,
        fileIds,
        replace: category === 'resume',
      });
      onNotice(
        category === 'resume'
          ? 'recruitment.notices.resumeSaved'
          : category === 'portfolio'
            ? 'recruitment.notices.portfolioAdded'
            : 'recruitment.notices.offerAdded',
      );
      setPreview(undefined);
      onChanged();
    } catch (cause: unknown) {
      onError(uploadErrorKey(cause));
    } finally {
      setLinking(undefined);
    }
  }

  async function onRemove(file: CandidateFile): Promise<void> {
    setBusyId(file.id);
    try {
      await removeCandidateFile(api, candidateId, file.id);
      onNotice('recruitment.notices.fileRemoved');
      onChanged();
    } catch (cause: unknown) {
      onError(errorMessageKey(cause));
    } finally {
      setBusyId(undefined);
    }
  }

  function onDownload(file: CandidateFile): void {
    const link = document.createElement('a');
    link.href = file.contentUrl;
    link.download = file.filename;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

  function openPreview(list: readonly CandidateFile[], file: CandidateFile) {
    setPreview({ files: list, index: Math.max(0, list.indexOf(file)) });
  }

  return (
    <div className='space-y-3'>
      <FilePreviewDialog
        files={preview?.files ?? []}
        initialIndex={preview?.index ?? 0}
        open={Boolean(preview)}
        onOpenChange={(open) => (open ? undefined : setPreview(undefined))}
        onError={(cause) => onError(errorMessageKey(cause))}
        labels={{ download: t('recruitment.files.download') }}
      />

      {processing ? (
        <div
          className='flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary'
          role='status'
        >
          <LoaderCircle className='size-4 animate-spin' aria-hidden='true' />
          {linking
            ? t('recruitment.files.linking')
            : t('recruitment.files.processing')}
        </div>
      ) : null}

      <FileGroup
        hint={t('recruitment.files.resumeHint')}
        title={t('recruitment.files.resume')}
      >
        {activeResume ? (
          <FileRow
            badge={t('recruitment.files.version', {
              version: activeResume.version ?? 1,
            })}
            busy={busyId === activeResume.id}
            canRemove={canEdit}
            file={activeResume}
            onDownload={() => onDownload(activeResume)}
            onPreview={() => openPreview(resumes, activeResume)}
            onRemove={() => void onRemove(activeResume)}
          />
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('recruitment.files.emptyResume')}
          </p>
        )}
        {resumeHistory.length ? (
          <div className='space-y-2 pt-2'>
            <p className='text-xs text-muted-foreground'>
              {t('recruitment.files.resumeHistory')}
            </p>
            {resumeHistory.map((file) => (
              <FileRow
                key={file.id}
                badge={t('recruitment.files.version', {
                  version: file.version ?? 1,
                })}
                busy={busyId === file.id}
                canRemove={canEdit}
                file={file}
                muted
                onDownload={() => onDownload(file)}
                onPreview={() => openPreview(resumes, file)}
                onRemove={() => void onRemove(file)}
              />
            ))}
          </div>
        ) : null}
      </FileGroup>

      <FileGroup
        hint={t('recruitment.files.portfolioHint')}
        title={t('recruitment.files.portfolio')}
      >
        {portfolio.length ? (
          <ul className='space-y-2'>
            {portfolio.map((file) => (
              <li key={file.id}>
                <FileRow
                  busy={busyId === file.id}
                  canRemove={canEdit}
                  file={file}
                  onDownload={() => onDownload(file)}
                  onPreview={() => openPreview(portfolio, file)}
                  onRemove={() => void onRemove(file)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('recruitment.files.emptyPortfolio')}
          </p>
        )}
      </FileGroup>

      {canEdit ? (
        <FileGroup
          hint={t('recruitment.files.offerHint')}
          title={t('recruitment.files.offer')}
        >
          {offers.length ? (
            <ul className='space-y-2'>
              {offers.map((file) => (
                <li key={file.id}>
                  <FileRow
                    busy={busyId === file.id}
                    canRemove
                    file={file}
                    onDownload={() => onDownload(file)}
                    onPreview={() => openPreview(offers, file)}
                    onRemove={() => void onRemove(file)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('recruitment.files.emptyOffer')}
            </p>
          )}
        </FileGroup>
      ) : (
        <p className='rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
          {t('recruitment.files.offerRestricted')}
        </p>
      )}

      {canEdit ? (
        <div className='space-y-3 rounded-lg border border-dashed border-border p-3'>
          <p className='text-sm font-medium'>{t('recruitment.files.add')}</p>
          <p className='text-xs text-muted-foreground'>
            {t('recruitment.files.limits', {
              total: MAX_FILES_PER_SELECTION,
              size: 5,
            })}
          </p>
          <div className='grid gap-3 sm:grid-cols-2'>
            {UPLOAD_TARGETS.map(({ category, labelKey }) => (
              <div className='space-y-1' key={category}>
                <p className='text-xs font-medium text-muted-foreground'>
                  {t(labelKey)}
                </p>
                {linking === category ? (
                  <p
                    className='flex items-center gap-2 text-xs text-muted-foreground'
                    role='status'
                  >
                    <LoaderCircle className='animate-spin' aria-hidden='true' />
                    {t('recruitment.files.linking')}
                  </p>
                ) : null}
                <FileUploadField
                  disabled={Boolean(linking)}
                  labels={{
                    choose: t('recruitment.files.choose'),
                    remove: t('recruitment.files.remove'),
                    retry: t('recruitment.files.retry'),
                  }}
                  maxFiles={MAX_FILES_PER_SELECTION}
                  maxSize={MAX_FILE_SIZE}
                  multiple
                  onChange={(records) => void onUploaded(category, records)}
                  onError={(cause) => onError(uploadErrorKey(cause))}
                  onStatusChange={(status) =>
                    setCategoryUploading(category, status === 'uploading')
                  }
                  repository={repository}
                  value={[]}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FileGroup({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='space-y-2 rounded-lg border border-border p-3'>
      <div>
        <h3 className='text-sm font-medium'>{title}</h3>
        <p className='text-xs text-muted-foreground'>{hint}</p>
      </div>
      {children}
    </section>
  );
}

function FileRow({
  file,
  busy,
  canRemove,
  onPreview,
  onDownload,
  onRemove,
  badge,
  muted = false,
}: {
  readonly file: CandidateFile;
  readonly busy: boolean;
  readonly canRemove: boolean;
  readonly onPreview: () => void;
  readonly onDownload: () => void;
  readonly onRemove: () => void;
  readonly badge?: string;
  readonly muted?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className={`flex items-center gap-3 rounded-md border border-border p-2 text-sm ${
        muted ? 'opacity-75' : ''
      }`}
    >
      <div className='h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-muted/30'>
        <FileThumbnail file={file} />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate' title={file.filename}>
          {file.filename}
        </p>
        <p className='text-xs text-muted-foreground'>
          {badge ? `${badge} · ` : ''}
          {formatSize(file.size)}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          aria-label={`${t('recruitment.files.preview')}: ${file.filename}`}
          onClick={onPreview}
          size='icon'
          type='button'
          variant='ghost'
        >
          <Eye aria-hidden='true' />
        </Button>
        <Button
          aria-label={`${t('recruitment.files.download')}: ${file.filename}`}
          onClick={onDownload}
          size='icon'
          type='button'
          variant='ghost'
        >
          <Download aria-hidden='true' />
        </Button>
        {canRemove ? (
          <Button
            aria-label={`${t('recruitment.files.remove')}: ${file.filename}`}
            disabled={busy}
            onClick={onRemove}
            size='icon'
            type='button'
            variant='ghost'
          >
            <Trash2 aria-hidden='true' />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface CandidateAttachmentListProps {
  readonly files: readonly CandidateFile[];
  readonly onError: (messageKey: string) => void;
  /** Optional note shown above the resume, e.g. the version an interview used. */
  readonly resumeNote?: string;
}

/**
 * Read-only resume and portfolio view for an interview.
 *
 * The server already withholds offer materials from an interviewer, and this
 * list deliberately renders only resume and portfolio regardless of role: the
 * interview context needs preparation material, not the hiring paperwork.
 */
export function CandidateAttachmentList({
  files,
  onError,
  resumeNote,
}: CandidateAttachmentListProps): ReactElement {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<PreviewState>();

  function onDownload(file: CandidateFile): void {
    const link = document.createElement('a');
    link.href = file.contentUrl;
    link.download = file.filename;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

  function openPreview(list: readonly CandidateFile[], file: CandidateFile) {
    setPreview({ files: list, index: Math.max(0, list.indexOf(file)) });
  }

  const resumes = files.filter((file) => file.category === 'resume');
  const activeResume = resumes.find((file) => !file.superseded) ?? resumes[0];
  const resumeHistory = resumes.filter((file) => file.id !== activeResume?.id);
  const portfolio = files.filter((file) => file.category === 'portfolio');

  return (
    <div className='space-y-3'>
      <FilePreviewDialog
        files={preview?.files ?? []}
        initialIndex={preview?.index ?? 0}
        open={Boolean(preview)}
        onOpenChange={(open) => (open ? undefined : setPreview(undefined))}
        onError={(cause) => onError(errorMessageKey(cause))}
        labels={{ download: t('recruitment.files.download') }}
      />

      {resumeNote ? (
        <p className='text-xs text-muted-foreground'>{resumeNote}</p>
      ) : null}

      <FileGroup
        hint={t('recruitment.files.resumeHint')}
        title={t('recruitment.files.resume')}
      >
        {activeResume ? (
          <FileRow
            badge={t('recruitment.files.version', {
              version: activeResume.version ?? 1,
            })}
            busy={false}
            canRemove={false}
            file={activeResume}
            onDownload={() => onDownload(activeResume)}
            onPreview={() => openPreview(resumes, activeResume)}
            onRemove={() => undefined}
          />
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('recruitment.files.emptyResume')}
          </p>
        )}
        {resumeHistory.length ? (
          <div className='space-y-2 pt-2'>
            <p className='text-xs text-muted-foreground'>
              {t('recruitment.files.resumeHistory')}
            </p>
            {resumeHistory.map((file) => (
              <FileRow
                key={file.id}
                badge={t('recruitment.files.version', {
                  version: file.version ?? 1,
                })}
                busy={false}
                canRemove={false}
                file={file}
                muted
                onDownload={() => onDownload(file)}
                onPreview={() => openPreview(resumes, file)}
                onRemove={() => undefined}
              />
            ))}
          </div>
        ) : null}
      </FileGroup>

      <FileGroup
        hint={t('recruitment.files.portfolioHint')}
        title={t('recruitment.files.portfolio')}
      >
        {portfolio.length ? (
          <ul className='space-y-2'>
            {portfolio.map((file) => (
              <li key={file.id}>
                <FileRow
                  busy={false}
                  canRemove={false}
                  file={file}
                  onDownload={() => onDownload(file)}
                  onPreview={() => openPreview(portfolio, file)}
                  onRemove={() => undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('recruitment.files.emptyPortfolio')}
          </p>
        )}
      </FileGroup>
    </div>
  );
}

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}
