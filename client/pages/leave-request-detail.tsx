import { useTranslation } from '@nocobase/i18n/client';
import { useNavigate, useParams } from 'react-router';
import { useService } from '@nocobase/app-client';
import { apiClientToken } from '@nocobase/app-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loading } from '@/components/loading';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Paperclip,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  errorCodeOf,
  formatDateTime,
  formatFileSize,
  type LeaveEvidenceRecord,
  type LeaveRequestDetail,
  type LeaveRequestDetailResponse,
  type LeaveEvidenceUploadResponse,
  type LeaveRequestStatus,
} from '@/lib/leave-requests';

function statusVariant(
  status: LeaveRequestStatus,
): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'approved':
      return 'default';
    case 'rejected':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export default function LeaveRequestDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const requestId = Number(params.id);
  const api = useService(apiClientToken);

  const [detail, setDetail] = useState<LeaveRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [processError, setProcessError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LeaveEvidenceRecord | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!Number.isInteger(requestId)) {
      return;
    }
    try {
      const response = await api.request<LeaveRequestDetailResponse>({
        method: 'GET',
        path: `leave-requests/${requestId}`,
      });
      setDetail(response.data);
      setLoading(false);
      setLoadError(null);
    } catch (e) {
      const code = errorCodeOf(e);
      setLoadError(
        code === 'NOT_FOUND'
          ? t('leaveRequests.detail.notFound')
          : t('leaveRequests.error.unexpected'),
      );
      setLoading(false);
    }
  }, [api, requestId, t]);

  useEffect(() => {
    if (!Number.isInteger(requestId)) {
      return;
    }
    let cancelled = false;
    api
      .request<LeaveRequestDetailResponse>({
        method: 'GET',
        path: `leave-requests/${requestId}`,
      })
      .then((response) => {
        if (cancelled) return;
        setDetail(response.data);
        setLoading(false);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const code = errorCodeOf(e);
        setLoadError(
          code === 'NOT_FOUND'
            ? t('leaveRequests.detail.notFound')
            : t('leaveRequests.error.unexpected'),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, requestId, t]);

  const handleDecide = async (
    decision: 'approve' | 'reject',
  ): Promise<void> => {
    if (!detail) return;
    setProcessing(true);
    setProcessError(null);
    try {
      await api.request<LeaveRequestDetailResponse>({
        method: 'POST',
        path: `leave-requests/${detail.id}/${decision}`,
        json: { comment },
      });
      setApproveOpen(false);
      setRejectOpen(false);
      setComment('');
      await reload();
    } catch (e) {
      const code = errorCodeOf(e);
      if (code === 'ALREADY_PROCESSED') {
        setProcessError(t('leaveRequests.process.alreadyProcessed'));
        setApproveOpen(false);
        setRejectOpen(false);
        await reload();
      } else if (code === 'INVALID_INPUT') {
        setProcessError(t('leaveRequests.process.commentRequired'));
      } else {
        setProcessError(t('leaveRequests.error.unexpected'));
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleUpload = async (files: FileList | null): Promise<void> => {
    if (!detail || !files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('file', file);
      const response = await api.request<LeaveEvidenceUploadResponse>({
        method: 'POST',
        path: `leave-requests/${detail.id}/evidence/upload`,
        body: form,
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              evidenceFiles: [
                ...current.evidenceFiles,
                ...response.data.filter(
                  (file) =>
                    !current.evidenceFiles.some((item) => item.id === file.id),
                ),
              ],
            }
          : current,
      );
    } catch (e) {
      const err = e as { message?: string };
      setUploadError(
        err.message ??
          t('leaveRequests.evidence.uploadError', { defaultValue: '上传失败' }),
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteEvidence = async (): Promise<void> => {
    if (!detail || !deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.request<{ data: { deleted: boolean } }>({
        method: 'DELETE',
        path: `leave-requests/${detail.id}/evidence/${deleteTarget.id}`,
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              evidenceFiles: current.evidenceFiles.filter(
                (file) => file.id !== deleteTarget.id,
              ),
            }
          : current,
      );
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(t('leaveRequests.evidence.deleteError'));
      void e;
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Loading label={t('leaveRequests.detail.loading')} />;
  if (loadError || !detail) {
    return (
      <section className='mx-auto w-full max-w-3xl px-6 py-10'>
        <Button
          variant='ghost'
          className='mb-3 -ml-2'
          onClick={() => void navigate('/leave-requests')}
        >
          <ArrowLeft className='size-4' />
          {t('leaveRequests.actions.backToList')}
        </Button>
        <Card>
          <CardContent className='py-8 text-center text-sm text-destructive'>
            {loadError ?? t('leaveRequests.detail.notFound')}
          </CardContent>
        </Card>
      </section>
    );
  }

  const locale = i18n.language;
  const isPending = detail.status === 'pending';

  return (
    <section className='mx-auto w-full max-w-3xl px-6 py-10'>
      <div className='mb-6'>
        <Button
          variant='ghost'
          className='mb-3 -ml-2'
          onClick={() => void navigate('/leave-requests')}
        >
          <ArrowLeft className='size-4' />
          {t('leaveRequests.actions.backToList')}
        </Button>
        <div className='flex items-center justify-between gap-4'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('leaveRequests.detail.title', { id: detail.id })}
          </h1>
          <Badge variant={statusVariant(detail.status)}>
            {t(`leaveRequests.statuses.${detail.status}`)}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('leaveRequests.detail.info')}
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4 text-sm sm:grid-cols-2'>
          <div>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.applicant')}
            </p>
            <p className='mt-0.5 font-medium'>{detail.applicantName}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.type')}
            </p>
            <p className='mt-0.5 font-medium'>
              {t(`leaveRequests.types.${detail.type}`)}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.startAt')}
            </p>
            <p className='mt-0.5'>{formatDateTime(detail.startAt, locale)}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.endAt')}
            </p>
            <p className='mt-0.5'>{formatDateTime(detail.endAt, locale)}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.days')}
            </p>
            <p className='mt-0.5'>{detail.days}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.createdAt')}
            </p>
            <p className='mt-0.5'>{formatDateTime(detail.createdAt, locale)}</p>
          </div>
          <div className='sm:col-span-2'>
            <p className='text-xs text-muted-foreground'>
              {t('leaveRequests.fields.reason')}
            </p>
            <p className='mt-0.5'>{detail.reason}</p>
          </div>
        </CardContent>
      </Card>

      {detail.status !== 'pending' ? (
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              {detail.status === 'approved' ? (
                <CheckCircle2 className='size-4 text-emerald-600' />
              ) : (
                <XCircle className='size-4 text-destructive' />
              )}
              {t('leaveRequests.detail.decision')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <p>
              {t('leaveRequests.detail.decisionBy', {
                name: detail.approvedByName ?? '–',
              })}{' '}
              {detail.approvedAt
                ? formatDateTime(detail.approvedAt, locale)
                : ''}
            </p>
            {detail.approvalComment ? (
              <p className='rounded-lg bg-muted/40 px-3 py-2 whitespace-pre-wrap'>
                {detail.approvalComment}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className='mt-4'>
        <CardHeader className='flex flex-row items-center justify-between gap-4 space-y-0'>
          <div>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Paperclip className='size-4 text-muted-foreground' />
              {t('leaveRequests.evidence.title')}
            </CardTitle>
            <CardDescription className='mt-1'>
              {t('leaveRequests.evidence.description')}
            </CardDescription>
          </div>
          <Button
            variant='outline'
            size='sm'
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className='size-4' />
            {t('leaveRequests.evidence.upload')}
          </Button>
          <Input
            ref={fileInputRef}
            type='file'
            multiple
            className='hidden'
            data-testid='evidence-file-input'
            onChange={(event) => void handleUpload(event.target.files)}
          />
        </CardHeader>
        <CardContent className='space-y-2'>
          {uploadError ? (
            <p className='text-sm text-destructive'>{uploadError}</p>
          ) : null}
          {detail.evidenceFiles.length === 0 ? (
            <p className='rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
              {t('leaveRequests.evidence.empty')}
            </p>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {detail.evidenceFiles.map((file) => (
                <li
                  key={file.id}
                  className='flex items-center gap-3 px-3 py-2.5'
                  data-testid={`evidence-item-${file.id}`}
                >
                  <FileText className='size-4 shrink-0 text-muted-foreground' />
                  <div className='min-w-0 flex-1'>
                    <p
                      className='truncate text-sm font-medium'
                      title={file.filename}
                    >
                      {file.filename}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {file.ext.toUpperCase()} · {formatFileSize(file.size)}
                    </p>
                  </div>
                  <a
                    href={file.contentUrl}
                    download={file.filename}
                    className='text-muted-foreground transition-colors hover:text-foreground'
                    aria-label={t('leaveRequests.evidence.download', {
                      name: file.filename,
                    })}
                  >
                    <Download className='size-4' />
                  </a>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('leaveRequests.evidence.delete', {
                      name: file.filename,
                    })}
                    onClick={() => {
                      setDeleteTarget(file);
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className='size-4 text-destructive' />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isPending ? (
        <div className='mt-4 flex flex-wrap justify-end gap-2'>
          <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Check className='size-4' />
                  {t('leaveRequests.actions.approve')}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t('leaveRequests.process.approveTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('leaveRequests.process.commentHint')}
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-2'>
                <Label htmlFor='approve-comment'>
                  {t('leaveRequests.fields.comment')}
                </Label>
                <Textarea
                  id='approve-comment'
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className='min-h-24'
                />
                {processError && approveOpen ? (
                  <p className='text-sm text-destructive'>{processError}</p>
                ) : null}
              </div>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button variant='outline'>{t('actions.cancel')}</Button>
                  }
                />
                <Button
                  disabled={processing}
                  onClick={() => void handleDecide('approve')}
                >
                  {processing
                    ? t('leaveRequests.process.submitting')
                    : t('leaveRequests.actions.confirmApprove')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger
              render={
                <Button variant='destructive'>
                  <XCircle className='size-4' />
                  {t('leaveRequests.actions.reject')}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t('leaveRequests.process.rejectTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('leaveRequests.process.commentRequiredHint')}
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-2'>
                <Label htmlFor='reject-comment'>
                  {t('leaveRequests.fields.comment')}
                </Label>
                <Textarea
                  id='reject-comment'
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className='min-h-24'
                />
                {processError && rejectOpen ? (
                  <p className='text-sm text-destructive'>{processError}</p>
                ) : null}
              </div>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button variant='outline'>{t('actions.cancel')}</Button>
                  }
                />
                <Button
                  variant='destructive'
                  disabled={processing}
                  onClick={() => void handleDecide('reject')}
                >
                  {processing
                    ? t('leaveRequests.process.submitting')
                    : t('leaveRequests.actions.confirmReject')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('leaveRequests.evidence.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? t('leaveRequests.evidence.deleteConfirm', {
                    name: deleteTarget.filename,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className='text-sm text-destructive'>{deleteError}</p>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={<Button variant='outline'>{t('actions.cancel')}</Button>}
            />
            <Button
              variant='destructive'
              disabled={deleting}
              onClick={() => void handleDeleteEvidence()}
            >
              {deleting
                ? t('leaveRequests.evidence.deleting')
                : t('leaveRequests.evidence.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
