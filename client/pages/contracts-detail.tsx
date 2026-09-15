import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { ArrowLeft, Download, FileText, Plus, Save } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ContractUploadField } from '@/components/contract-upload-field';
import { Loading } from '@/components/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorCode,
  attachmentDownloadUrl,
  createVersion,
  fetchCapabilities,
  fetchContract,
  uploadAttachment,
  type ContractAttachment,
  type ContractCapabilities,
  type ContractDetail,
} from '@/lib/contracts';
import {
  daysUntil,
  formatAmount,
  formatBytes,
  formatDate,
  formatDateTime,
} from '@/lib/format';

export default function ContractDetailPage(): ReactElement {
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { t } = useTranslation();

  const [detail, setDetail] = useState<ContractDetail>();
  const [capabilities, setCapabilities] = useState<ContractCapabilities>();
  const [error, setError] = useState<string>();
  const [versionOpen, setVersionOpen] = useState(false);
  // Bumped after a scan upload or a new version so the effect reloads the detail.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([fetchContract(api, id), fetchCapabilities(api)]).then(
      ([result, caps]) => {
        if (!active) return;
        setDetail(result);
        setCapabilities(caps);
        setError(undefined);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(
          t(`contracts.errors.${apiErrorCode(cause) ?? 'loadFailed'}`, {
            defaultValue: 'Something went wrong while loading.',
          }),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [api, id, reloadToken, t]);

  if (detail === undefined && !error) {
    return (
      <Loading
        className='min-h-[60svh]'
        label={t('contracts.loading', { defaultValue: 'Loading contracts' })}
      />
    );
  }

  if (error || !detail) {
    return (
      <section className='space-y-4 p-6'>
        <Alert variant='destructive'>
          <AlertDescription>
            {error ??
              t('contracts.detail.notFound', {
                defaultValue: 'Contract not found.',
              })}
          </AlertDescription>
        </Alert>
        <Button
          onClick={() => {
            void navigate('/contracts');
          }}
          type='button'
          variant='outline'
        >
          <ArrowLeft />
          {t('contracts.actions.back', { defaultValue: 'Back to list' })}
        </Button>
      </section>
    );
  }

  const { contract, capabilities: detailCapabilities } = detail;
  const uploadLimits = capabilities?.upload;
  const days = daysUntil(contract.expiryDate);

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-1'>
          <div className='flex items-center gap-3'>
            <h1 className='font-heading text-2xl font-semibold tracking-tight'>
              {contract.name}
            </h1>
            <Badge
              variant={
                contract.status === 'active'
                  ? 'default'
                  : contract.status === 'terminated'
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {t(`contracts.status.${contract.status}`, {
                defaultValue: contract.status,
              })}
            </Badge>
          </div>
          <p className='font-mono text-sm text-muted-foreground'>
            {contract.contractNo}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            onClick={() => {
              void navigate('/contracts');
            }}
            type='button'
            variant='outline'
          >
            <ArrowLeft />
            {t('contracts.actions.back', { defaultValue: 'Back to list' })}
          </Button>
          {detailCapabilities.canManage ? (
            <Button
              onClick={() => {
                void navigate(`/contracts/${contract.id}/edit`);
              }}
              type='button'
            >
              {t('contracts.actions.edit', { defaultValue: 'Edit' })}
            </Button>
          ) : null}
        </div>
      </header>

      <dl className='grid gap-4 rounded-lg border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-3'>
        <Field
          label={t('contracts.fields.counterparty', {
            defaultValue: 'Counterparty',
          })}
          value={contract.counterparty}
        />
        <Field
          label={t('contracts.fields.type', { defaultValue: 'Type' })}
          value={t(`contracts.type.${contract.type}`, {
            defaultValue: contract.type,
          })}
        />
        <Field
          label={t('contracts.fields.amount', { defaultValue: 'Amount' })}
          value={formatAmount(contract.amount)}
        />
        <Field
          label={t('contracts.fields.signedDate', { defaultValue: 'Signed' })}
          value={formatDate(contract.signedDate)}
        />
        <Field
          label={t('contracts.fields.effectiveDate', {
            defaultValue: 'Effective',
          })}
          value={formatDate(contract.effectiveDate)}
        />
        <Field
          label={t('contracts.fields.expiryDate', { defaultValue: 'Expires' })}
          value={formatDate(contract.expiryDate)}
        />
        <Field
          label={t('contracts.fields.owner', { defaultValue: 'Owner' })}
          value={contract.ownerName ?? contract.ownerId}
        />
        <Field
          label={t('contracts.detail.remaining', {
            defaultValue: 'Days to expiry',
          })}
          value={
            days === null
              ? '—'
              : days < 0
                ? t('contracts.remaining.expired', { defaultValue: 'Expired' })
                : t('contracts.remaining.days', {
                    defaultValue: '{{count}} days',
                    count: days,
                  })
          }
        />
      </dl>

      <section className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='font-heading text-lg font-semibold'>
            {t('contracts.detail.versions', {
              defaultValue: 'Versions and scans',
            })}
          </h2>
          {detailCapabilities.canManage ? (
            <Button
              onClick={() => setVersionOpen((open) => !open)}
              type='button'
              variant='outline'
            >
              <Plus />
              {t('contracts.detail.createVersion', {
                defaultValue: 'Add a version',
              })}
            </Button>
          ) : null}
        </div>

        {!detailCapabilities.canDownload ? (
          <Alert>
            <AlertDescription>
              {t('contracts.detail.noDownloadPermission', {
                defaultValue:
                  'You may view this contract, but not download its scans.',
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        {versionOpen && detailCapabilities.canManage ? (
          <VersionForm
            onCancel={() => setVersionOpen(false)}
            onSubmit={async (input) => {
              await createVersion(api, contract.id, input);
              setVersionOpen(false);
              setReloadToken((token) => token + 1);
            }}
          />
        ) : null}

        {detail.versions.length === 0 ? (
          <p className='rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground'>
            {t('contracts.detail.noVersions', {
              defaultValue: 'No versions yet.',
            })}
          </p>
        ) : (
          detail.versions.map(({ version, attachments }) => (
            <article
              className='space-y-3 rounded-lg border border-border bg-card p-4'
              key={version.id}
            >
              <header className='flex flex-wrap items-start justify-between gap-2'>
                <div className='space-y-1'>
                  <h3 className='font-medium'>
                    {t('contracts.detail.versionLabel', {
                      defaultValue: 'Version {{version}}',
                      version: version.versionNo,
                    })}
                  </h3>
                  {version.description ? (
                    <p className='text-sm text-muted-foreground'>
                      {version.description}
                    </p>
                  ) : null}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {t('contracts.fields.uploadedAt', {
                    defaultValue: 'Uploaded',
                  })}
                  : {formatDateTime(version.uploadedAt)}
                  {version.uploadedByName ? ` · ${version.uploadedByName}` : ''}
                </p>
              </header>

              <AttachmentList
                attachments={attachments}
                canDownload={detailCapabilities.canDownload}
                contractId={contract.id}
              />

              {detailCapabilities.canManage && uploadLimits ? (
                <ContractUploadField
                  allowedExtensions={uploadLimits.allowedExtensions}
                  maxBytes={uploadLimits.maxBytes}
                  onUpload={async (file) => {
                    await uploadAttachment(api, contract.id, file, version.id);
                    setReloadToken((token) => token + 1);
                  }}
                />
              ) : null}
            </article>
          ))
        )}

        {detail.unassigned.length > 0 || detailCapabilities.canManage ? (
          <article className='space-y-3 rounded-lg border border-border bg-card p-4'>
            <h3 className='font-medium'>
              {t('contracts.detail.unassigned', {
                defaultValue: 'Scans without a version',
              })}
            </h3>
            <AttachmentList
              attachments={detail.unassigned}
              canDownload={detailCapabilities.canDownload}
              contractId={contract.id}
            />
            {detailCapabilities.canManage && uploadLimits ? (
              <ContractUploadField
                allowedExtensions={uploadLimits.allowedExtensions}
                maxBytes={uploadLimits.maxBytes}
                onUpload={async (file) => {
                  await uploadAttachment(api, contract.id, file);
                  setReloadToken((token) => token + 1);
                }}
              />
            ) : null}
          </article>
        ) : null}
      </section>
    </section>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{value}</dd>
    </div>
  );
}

function AttachmentList({
  attachments,
  canDownload,
  contractId,
}: {
  readonly attachments: readonly ContractAttachment[];
  readonly canDownload: boolean;
  readonly contractId: string;
}): ReactElement {
  const { t } = useTranslation();
  if (attachments.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('contracts.detail.noAttachments', {
          defaultValue: 'No scans in this version.',
        })}
      </p>
    );
  }
  return (
    <ul className='divide-y divide-border rounded-md border border-border'>
      {attachments.map((attachment) => (
        <li
          className='flex flex-wrap items-center justify-between gap-3 p-3'
          key={attachment.id}
        >
          <div className='flex min-w-0 items-center gap-3'>
            <FileText className='size-4 shrink-0 text-muted-foreground' />
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium'>
                {attachment.filename}
              </p>
              <p className='text-xs text-muted-foreground'>
                {attachment.ext.toUpperCase()} · {formatBytes(attachment.size)}{' '}
                · {formatDateTime(attachment.createdAt)}
                {attachment.uploadedByName
                  ? ` · ${attachment.uploadedByName}`
                  : ''}
              </p>
            </div>
          </div>
          {canDownload ? (
            <a
              className='inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted'
              download={attachment.filename}
              href={attachmentDownloadUrl(contractId, attachment.id)}
            >
              <Download className='size-4' />
              {t('contracts.actions.download', { defaultValue: 'Download' })}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function VersionForm({
  onSubmit,
  onCancel,
}: {
  readonly onSubmit: (input: {
    versionNo: string;
    description?: string;
  }) => Promise<void>;
  readonly onCancel: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [versionNo, setVersionNo] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      className='space-y-4 rounded-lg border border-border bg-card p-4'
      onSubmit={(event) => {
        event.preventDefault();
        if (!versionNo.trim()) {
          setError(
            t('contracts.form.requiredError', {
              defaultValue: 'Please fill in every required field.',
            }),
          );
          return;
        }
        setBusy(true);
        setError(undefined);
        void onSubmit({
          versionNo: versionNo.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        })
          .catch((cause: unknown) => {
            setError(
              t(`contracts.errors.${apiErrorCode(cause) ?? 'saveFailed'}`, {
                defaultValue: 'Could not save the version.',
              }),
            );
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='version-no'>
            {t('contracts.versionForm.versionNo', {
              defaultValue: 'Version number',
            })}
          </Label>
          <Input
            id='version-no'
            onChange={(event) => setVersionNo(event.target.value)}
            placeholder='V2.0'
            required
            value={versionNo}
          />
        </div>
        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor='version-description'>
            {t('contracts.versionForm.description', {
              defaultValue: 'Version notes',
            })}
          </Label>
          <Textarea
            id='version-description'
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            value={description}
          />
        </div>
      </div>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='flex items-center gap-2'>
        <Button disabled={busy} type='submit'>
          <Save />
          {t('contracts.versionForm.submit', { defaultValue: 'Save version' })}
        </Button>
        <Button onClick={onCancel} type='button' variant='ghost'>
          {t('contracts.actions.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </form>
  );
}
