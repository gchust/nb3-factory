import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from '../access.js';
import {
  complianceRequest,
  errorMessageKey,
  formatDate,
  formatDateTime,
  normalizeError,
  QUALIFICATION_TYPES,
  type NormalizedError,
  type Qualification,
  type Review,
  type Supplier,
} from '../api.js';
import { FileAttachmentManager } from '../components/file-attachment-manager.js';
import { SimpleSelect } from '../components/simple-select.js';
import { StatusBadge } from '../components/status-badge.js';
import { ErrorState, LoadingState } from '../components/state.js';
import {
  decisionKey,
  decisionTone,
  qualificationStatusKey,
  qualificationStatusTone,
  qualificationTypeKey,
  supplierStatusKey,
  supplierStatusTone,
} from '../labels.js';
import { canManageSupplier, canReviewSupplier } from '../permissions.js';

interface QualificationForm {
  id?: number;
  type: string;
  certificateNo: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  status: string;
  notes: string;
}

interface ReviewForm {
  decision: 'approved' | 'rejected';
  reason: string;
  comments: string;
  reviewYear: string;
}

const EMPTY_QUALIFICATION: QualificationForm = {
  type: QUALIFICATION_TYPES[0] ?? 'other',
  certificateNo: '',
  issuer: '',
  issuedAt: '',
  expiresAt: '',
  status: 'active',
  notes: '',
};

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function SupplierDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const supplierId = Number(params.id);
  const {
    api,
    access,
    loading: accessLoading,
    error: accessError,
  } = useAccess();

  const [supplier, setSupplier] = useState<Supplier>();
  const [qualifications, setQualifications] = useState<
    readonly Qualification[]
  >([]);
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const [notice, setNotice] = useState<string>();
  const [tab, setTab] = useState('qualifications');

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    category: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    businessScope: '',
    notes: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [qualificationForm, setQualificationForm] =
    useState<QualificationForm>();
  const [savingQualification, setSavingQualification] = useState(false);

  const [reviewForm, setReviewForm] = useState<ReviewForm>();
  const [savingReview, setSavingReview] = useState(false);

  const reload = useCallback(async () => {
    if (!Number.isFinite(supplierId)) {
      setError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Supplier not found.',
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const [supplierData, qualificationData, reviewData] = await Promise.all([
        complianceRequest<Supplier>(api, `/suppliers/${supplierId}`),
        complianceRequest<Qualification[]>(api, '/qualifications', {
          query: { supplierId },
        }),
        complianceRequest<Review[]>(api, '/reviews', { query: { supplierId } }),
      ]);
      setSupplier(supplierData);
      setQualifications(qualificationData);
      setReviews(reviewData);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api, supplierId]);

  useEffect(() => {
    if (accessLoading || accessError) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, reload]);

  function openProfileEdit(): void {
    if (!supplier) return;
    setProfileForm({
      name: supplier.name,
      category: supplier.category ?? '',
      contactName: supplier.contactName ?? '',
      contactEmail: supplier.contactEmail ?? '',
      contactPhone: supplier.contactPhone ?? '',
      businessScope: supplier.businessScope ?? '',
      notes: supplier.notes ?? '',
    });
    setEditingProfile(true);
  }

  async function saveProfile(): Promise<void> {
    if (!supplier) return;
    setSavingProfile(true);
    setNotice(undefined);
    try {
      await complianceRequest<Supplier>(api, `/suppliers/${supplier.id}`, {
        method: 'PATCH',
        json: profileForm,
      });
      setEditingProfile(false);
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveQualification(): Promise<void> {
    if (!qualificationForm || !supplier) return;
    setSavingQualification(true);
    setNotice(undefined);
    const payload = {
      type: qualificationForm.type,
      certificateNo: qualificationForm.certificateNo || null,
      issuer: qualificationForm.issuer || null,
      issuedAt: qualificationForm.issuedAt || null,
      expiresAt: qualificationForm.expiresAt || null,
      status: qualificationForm.status,
      notes: qualificationForm.notes || null,
    };
    try {
      if (qualificationForm.id) {
        await complianceRequest(
          api,
          `/qualifications/${qualificationForm.id}`,
          {
            method: 'PATCH',
            json: payload,
          },
        );
      } else {
        await complianceRequest(
          api,
          `/suppliers/${supplier.id}/qualifications`,
          {
            method: 'POST',
            json: payload,
          },
        );
      }
      setQualificationForm(undefined);
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSavingQualification(false);
    }
  }

  async function removeQualification(id: number): Promise<void> {
    setNotice(undefined);
    try {
      await complianceRequest(api, `/qualifications/${id}`, {
        method: 'DELETE',
      });
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    }
  }

  async function saveReview(): Promise<void> {
    if (!reviewForm || !supplier) return;
    setSavingReview(true);
    setNotice(undefined);
    try {
      await complianceRequest<Supplier>(
        api,
        `/suppliers/${supplier.id}/review`,
        {
          method: 'POST',
          json: {
            decision: reviewForm.decision,
            reason:
              reviewForm.decision === 'rejected'
                ? reviewForm.reason
                : undefined,
            comments: reviewForm.comments || undefined,
            reviewYear: Number(reviewForm.reviewYear) || undefined,
          },
        },
      );
      setReviewForm(undefined);
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSavingReview(false);
    }
  }

  if (accessLoading || loading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (accessError) {
    return (
      <PageContainer>
        <ErrorState error={accessError} onRetry={() => void reload()} />
      </PageContainer>
    );
  }

  if (error || !supplier) {
    return (
      <PageContainer>
        <ErrorState
          error={
            error ?? {
              status: 404,
              code: 'NOT_FOUND',
              message: 'Supplier not found.',
            }
          }
          onRetry={() => void reload()}
        />
      </PageContainer>
    );
  }

  const manage = canManageSupplier(access, supplier);
  const review = canReviewSupplier(access, supplier);

  return (
    <PageContainer>
      <Button
        variant='ghost'
        size='sm'
        render={<Link to='/compliance/suppliers' />}
      >
        <ArrowLeftIcon />
        {t('compliance.suppliers.back', { defaultValue: 'Back to suppliers' })}
      </Button>

      <PageHeader
        title={supplier.name}
        description={`${supplier.code} · ${supplier.organizationName ?? ''}`}
        actions={
          <div className='flex flex-wrap gap-2'>
            {manage ? (
              <Button variant='outline' onClick={openProfileEdit}>
                <PencilIcon />
                {t('compliance.suppliers.edit', { defaultValue: 'Edit' })}
              </Button>
            ) : null}
            {review && supplier.status !== 'qualified' ? (
              <Button
                onClick={() =>
                  setReviewForm({
                    decision: 'approved',
                    reason: '',
                    comments: '',
                    reviewYear: String(new Date().getFullYear()),
                  })
                }
                data-testid='compliance-supplier-review'
              >
                <CheckCircle2Icon />
                {t('compliance.reviews.review', { defaultValue: 'Review' })}
              </Button>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <p className='text-sm text-destructive' role='alert'>
          {notice}
        </p>
      ) : null}

      <section className='grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>
              {t('compliance.suppliers.profile', { defaultValue: 'Profile' })}
            </CardTitle>
            <div className='flex items-center gap-2'>
              <StatusBadge
                tone={supplierStatusTone(supplier.status)}
                labelKey={supplierStatusKey(supplier.status)}
              />
            </div>
          </CardHeader>
          <CardContent className='grid gap-3 text-sm sm:grid-cols-2'>
            <Field
              label={t('compliance.suppliers.category', {
                defaultValue: 'Category',
              })}
              value={supplier.category}
            />
            <Field
              label={t('compliance.suppliers.contactName', {
                defaultValue: 'Contact name',
              })}
              value={supplier.contactName}
            />
            <Field
              label={t('compliance.suppliers.contactEmail', {
                defaultValue: 'Contact email',
              })}
              value={supplier.contactEmail}
            />
            <Field
              label={t('compliance.suppliers.contactPhone', {
                defaultValue: 'Contact phone',
              })}
              value={supplier.contactPhone}
            />
            <div className='sm:col-span-2'>
              <Field
                label={t('compliance.suppliers.businessScope', {
                  defaultValue: 'Business scope',
                })}
                value={supplier.businessScope}
              />
            </div>
            <div className='sm:col-span-2'>
              <Field
                label={t('compliance.suppliers.notes', {
                  defaultValue: 'Notes',
                })}
                value={supplier.notes}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('compliance.suppliers.compliance', {
                defaultValue: 'Qualification',
              })}
            </CardTitle>
            <CardDescription>
              {t('compliance.suppliers.complianceHint', {
                defaultValue:
                  'A valid business license and quality certificate are required for the qualified catalog.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <p>
              {supplier.compliance.eligible
                ? t('compliance.compliance.eligible', {
                    defaultValue: 'Qualification complete',
                  })
                : t('compliance.compliance.incomplete', {
                    defaultValue: 'Qualification incomplete',
                  })}
            </p>
            {supplier.compliance.missing.length > 0 ? (
              <p className='text-destructive'>
                {t('compliance.compliance.missingList', {
                  defaultValue: 'Missing: {{list}}',
                  list: supplier.compliance.missing
                    .map((type) =>
                      t(qualificationTypeKey(type), { defaultValue: type }),
                    )
                    .join(', '),
                })}
              </p>
            ) : null}
            {supplier.compliance.expired.length > 0 ? (
              <p className='text-destructive'>
                {t('compliance.compliance.expiredList', {
                  defaultValue: 'Expired: {{list}}',
                  list: supplier.compliance.expired
                    .map((type) =>
                      t(qualificationTypeKey(type), { defaultValue: type }),
                    )
                    .join(', '),
                })}
              </p>
            ) : null}
            {supplier.compliance.expiringSoon.length > 0 ? (
              <p className='text-muted-foreground'>
                {t('compliance.compliance.expiringList', {
                  defaultValue: 'Expiring soon: {{list}}',
                  list: supplier.compliance.expiringSoon
                    .map((type) =>
                      t(qualificationTypeKey(type), { defaultValue: type }),
                    )
                    .join(', '),
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value='qualifications'>
            {t('compliance.tabs.qualifications', {
              defaultValue: 'Qualification records',
            })}
          </TabsTrigger>
          <TabsTrigger value='reviews'>
            {t('compliance.tabs.reviews', { defaultValue: 'Annual reviews' })}
          </TabsTrigger>
          <TabsTrigger value='files'>
            {t('compliance.tabs.files', { defaultValue: 'Attachments' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='qualifications' className='space-y-3'>
          {manage ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setQualificationForm({ ...EMPTY_QUALIFICATION })}
            >
              <PlusIcon />
              {t('compliance.qualifications.create', {
                defaultValue: 'Add qualification',
              })}
            </Button>
          ) : null}
          {qualifications.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('compliance.qualifications.empty', {
                defaultValue: 'No qualification records.',
              })}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('compliance.qualifications.type', {
                      defaultValue: 'Type',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.qualifications.certificateNo', {
                      defaultValue: 'Certificate no.',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.qualifications.issuer', {
                      defaultValue: 'Issuer',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.qualifications.issuedAt', {
                      defaultValue: 'Issued',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.qualifications.expiresAt', {
                      defaultValue: 'Expires',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.qualifications.status', {
                      defaultValue: 'Status',
                    })}
                  </TableHead>
                  {manage ? (
                    <TableHead className='text-right'>
                      {t('compliance.files.actions', {
                        defaultValue: 'Actions',
                      })}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {qualifications.map((qualification) => (
                  <TableRow key={qualification.id}>
                    <TableCell>
                      {t(qualificationTypeKey(qualification.type), {
                        defaultValue: qualification.type,
                      })}
                    </TableCell>
                    <TableCell>{qualification.certificateNo ?? '—'}</TableCell>
                    <TableCell>{qualification.issuer ?? '—'}</TableCell>
                    <TableCell>{formatDate(qualification.issuedAt)}</TableCell>
                    <TableCell>{formatDate(qualification.expiresAt)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={qualificationStatusTone(
                          qualification.effectiveStatus ?? 'active',
                        )}
                        labelKey={qualificationStatusKey(
                          qualification.effectiveStatus ?? 'active',
                        )}
                      />
                    </TableCell>
                    {manage ? (
                      <TableCell>
                        <div className='flex justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('compliance.files.edit', {
                              defaultValue: 'Edit',
                            })}
                            onClick={() =>
                              setQualificationForm({
                                id: qualification.id,
                                type: qualification.type,
                                certificateNo:
                                  qualification.certificateNo ?? '',
                                issuer: qualification.issuer ?? '',
                                issuedAt: toDateInput(qualification.issuedAt),
                                expiresAt: toDateInput(qualification.expiresAt),
                                status: qualification.status,
                                notes: qualification.notes ?? '',
                              })
                            }
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('compliance.files.remove', {
                              defaultValue: 'Remove',
                            })}
                            onClick={() =>
                              void removeQualification(qualification.id)
                            }
                          >
                            <TrashIcon />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value='reviews' className='space-y-3'>
          {reviews.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('compliance.reviews.empty', {
                defaultValue: 'No review records.',
              })}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('compliance.reviews.year', { defaultValue: 'Year' })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.reviews.decision', {
                      defaultValue: 'Decision',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.reviews.reason', { defaultValue: 'Reason' })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.reviews.reviewer', {
                      defaultValue: 'Reviewer',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('compliance.reviews.reviewedAt', {
                      defaultValue: 'Reviewed at',
                    })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.reviewYear}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={decisionTone(item.decision)}
                        labelKey={decisionKey(item.decision)}
                      />
                    </TableCell>
                    <TableCell className='max-w-64 truncate'>
                      {item.reason ?? '—'}
                    </TableCell>
                    <TableCell>{item.reviewerName ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(item.reviewedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value='files'>
          <FileAttachmentManager
            supplierId={supplier.id}
            organizationId={supplier.organizationId}
            canManage={manage}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={editingProfile} onOpenChange={setEditingProfile}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.suppliers.editTitle', {
                defaultValue: 'Edit supplier',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div>
              <Label htmlFor='edit-name'>
                {t('compliance.suppliers.name', { defaultValue: 'Name' })}
              </Label>
              <Input
                id='edit-name'
                className='mt-1'
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, name: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='edit-category'>
                {t('compliance.suppliers.category', {
                  defaultValue: 'Category',
                })}
              </Label>
              <Input
                id='edit-category'
                className='mt-1'
                value={profileForm.category}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    category: event.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor='edit-contact'>
                {t('compliance.suppliers.contactName', {
                  defaultValue: 'Contact name',
                })}
              </Label>
              <Input
                id='edit-contact'
                className='mt-1'
                value={profileForm.contactName}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    contactName: event.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor='edit-email'>
                {t('compliance.suppliers.contactEmail', {
                  defaultValue: 'Contact email',
                })}
              </Label>
              <Input
                id='edit-email'
                className='mt-1'
                value={profileForm.contactEmail}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    contactEmail: event.target.value,
                  })
                }
              />
            </div>
            <div className='sm:col-span-2'>
              <Label htmlFor='edit-scope'>
                {t('compliance.suppliers.businessScope', {
                  defaultValue: 'Business scope',
                })}
              </Label>
              <Textarea
                id='edit-scope'
                className='mt-1'
                value={profileForm.businessScope}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    businessScope: event.target.value,
                  })
                }
              />
            </div>
            <div className='sm:col-span-2'>
              <Label htmlFor='edit-notes'>
                {t('compliance.suppliers.notes', { defaultValue: 'Notes' })}
              </Label>
              <Textarea
                id='edit-notes'
                className='mt-1'
                value={profileForm.notes}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, notes: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setEditingProfile(false)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={savingProfile}
              onClick={() => void saveProfile()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(qualificationForm)}
        onOpenChange={(open) => !open && setQualificationForm(undefined)}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {qualificationForm?.id
                ? t('compliance.qualifications.editTitle', {
                    defaultValue: 'Edit qualification',
                  })
                : t('compliance.qualifications.createTitle', {
                    defaultValue: 'Add qualification',
                  })}
            </DialogTitle>
          </DialogHeader>
          {qualificationForm ? (
            <div className='grid gap-3 sm:grid-cols-2'>
              <div>
                <Label>
                  {t('compliance.qualifications.type', {
                    defaultValue: 'Type',
                  })}
                </Label>
                <SimpleSelect
                  className='mt-1'
                  value={qualificationForm.type}
                  onChange={(value) =>
                    setQualificationForm({ ...qualificationForm, type: value })
                  }
                  options={QUALIFICATION_TYPES.map((value) => ({
                    value,
                    label: t(qualificationTypeKey(value), {
                      defaultValue: value,
                    }),
                  }))}
                />
              </div>
              <div>
                <Label htmlFor='qual-status'>
                  {t('compliance.qualifications.status', {
                    defaultValue: 'Status',
                  })}
                </Label>
                <SimpleSelect
                  className='mt-1'
                  value={qualificationForm.status}
                  onChange={(value) =>
                    setQualificationForm({
                      ...qualificationForm,
                      status: value,
                    })
                  }
                  options={[
                    {
                      value: 'active',
                      label: t('compliance.qualificationStatus.active', {
                        defaultValue: 'Active',
                      }),
                    },
                    {
                      value: 'revoked',
                      label: t('compliance.qualificationStatus.revoked', {
                        defaultValue: 'Revoked',
                      }),
                    },
                  ]}
                />
              </div>
              <div>
                <Label htmlFor='qual-no'>
                  {t('compliance.qualifications.certificateNo', {
                    defaultValue: 'Certificate no.',
                  })}
                </Label>
                <Input
                  id='qual-no'
                  className='mt-1'
                  value={qualificationForm.certificateNo}
                  onChange={(event) =>
                    setQualificationForm({
                      ...qualificationForm,
                      certificateNo: event.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor='qual-issuer'>
                  {t('compliance.qualifications.issuer', {
                    defaultValue: 'Issuer',
                  })}
                </Label>
                <Input
                  id='qual-issuer'
                  className='mt-1'
                  value={qualificationForm.issuer}
                  onChange={(event) =>
                    setQualificationForm({
                      ...qualificationForm,
                      issuer: event.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor='qual-issued'>
                  {t('compliance.qualifications.issuedAt', {
                    defaultValue: 'Issued',
                  })}
                </Label>
                <Input
                  id='qual-issued'
                  type='date'
                  className='mt-1'
                  value={qualificationForm.issuedAt}
                  onChange={(event) =>
                    setQualificationForm({
                      ...qualificationForm,
                      issuedAt: event.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor='qual-expires'>
                  {t('compliance.qualifications.expiresAt', {
                    defaultValue: 'Expires',
                  })}
                </Label>
                <Input
                  id='qual-expires'
                  type='date'
                  className='mt-1'
                  value={qualificationForm.expiresAt}
                  onChange={(event) =>
                    setQualificationForm({
                      ...qualificationForm,
                      expiresAt: event.target.value,
                    })
                  }
                />
              </div>
              <div className='sm:col-span-2'>
                <Label htmlFor='qual-notes'>
                  {t('compliance.qualifications.notes', {
                    defaultValue: 'Notes',
                  })}
                </Label>
                <Textarea
                  id='qual-notes'
                  className='mt-1'
                  value={qualificationForm.notes}
                  onChange={(event) =>
                    setQualificationForm({
                      ...qualificationForm,
                      notes: event.target.value,
                    })
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setQualificationForm(undefined)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={savingQualification}
              onClick={() => void saveQualification()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reviewForm)}
        onOpenChange={(open) => !open && setReviewForm(undefined)}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.reviews.reviewTitle', {
                defaultValue: 'Annual qualification review',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('compliance.reviews.reviewHint', {
                defaultValue:
                  'Approving requires complete, current qualifications. A rejection must record a reason.',
              })}
            </DialogDescription>
          </DialogHeader>
          {reviewForm ? (
            <div className='space-y-3'>
              <div>
                <Label>
                  {t('compliance.reviews.decision', {
                    defaultValue: 'Decision',
                  })}
                </Label>
                <SimpleSelect
                  className='mt-1'
                  value={reviewForm.decision}
                  onChange={(value) =>
                    setReviewForm({
                      ...reviewForm,
                      decision: value === 'rejected' ? 'rejected' : 'approved',
                    })
                  }
                  options={[
                    {
                      value: 'approved',
                      label: t('compliance.decision.approved', {
                        defaultValue: 'Approve',
                      }),
                    },
                    {
                      value: 'rejected',
                      label: t('compliance.decision.rejected', {
                        defaultValue: 'Reject',
                      }),
                    },
                  ]}
                />
              </div>
              {reviewForm.decision === 'rejected' ? (
                <div>
                  <Label htmlFor='review-reason'>
                    {t('compliance.reviews.reason', { defaultValue: 'Reason' })}
                  </Label>
                  <Textarea
                    id='review-reason'
                    className='mt-1'
                    value={reviewForm.reason}
                    onChange={(event) =>
                      setReviewForm({
                        ...reviewForm,
                        reason: event.target.value,
                      })
                    }
                  />
                </div>
              ) : null}
              <div>
                <Label htmlFor='review-comments'>
                  {t('compliance.reviews.comments', {
                    defaultValue: 'Comments',
                  })}
                </Label>
                <Textarea
                  id='review-comments'
                  className='mt-1'
                  value={reviewForm.comments}
                  onChange={(event) =>
                    setReviewForm({
                      ...reviewForm,
                      comments: event.target.value,
                    })
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setReviewForm(undefined)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={
                savingReview ||
                (reviewForm?.decision === 'rejected' &&
                  !reviewForm.reason.trim())
              }
              onClick={() => void saveReview()}
            >
              {t('compliance.reviews.submit', {
                defaultValue: 'Submit review',
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string | null;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5'>{value && value !== '' ? value : '—'}</dd>
    </div>
  );
}
