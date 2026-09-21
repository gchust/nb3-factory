import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

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
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from '../compliance/access.js';
import {
  COMPLIANCE_ROLES,
  complianceRequest,
  errorMessageKey,
  normalizeError,
  type ManagedUser,
  type Member,
  type NormalizedError,
  type Organization,
  type Supplier,
} from '../compliance/api.js';
import { SimpleSelect } from '../compliance/components/simple-select.js';
import { StatusBadge } from '../compliance/components/status-badge.js';
import {
  AccessDenied,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../compliance/components/state.js';
import { roleKey } from '../compliance/labels.js';

interface MemberForm {
  userId: string;
  role: string;
  organizationId: string;
  supplierId: string;
}

const EMPTY_MEMBER: MemberForm = {
  userId: '',
  role: 'procurement',
  organizationId: '',
  supplierId: '',
};

export default function ComplianceAccessPage(): ReactElement {
  const { t } = useTranslation();
  const {
    api,
    access,
    loading: accessLoading,
    error: accessError,
  } = useAccess();

  const [organizations, setOrganizations] = useState<readonly Organization[]>(
    [],
  );
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [users, setUsers] = useState<readonly ManagedUser[]>([]);
  const [suppliers, setSuppliers] = useState<readonly Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const [notice, setNotice] = useState<string>();

  const [organizationDialog, setOrganizationDialog] = useState(false);
  const [organizationForm, setOrganizationForm] = useState({
    name: '',
    code: '',
    description: '',
  });
  const [savingOrganization, setSavingOrganization] = useState(false);

  const [memberForm, setMemberForm] = useState<MemberForm>();
  const [savingMember, setSavingMember] = useState(false);
  const [removingId, setRemovingId] = useState<number>();

  const reload = useCallback(async () => {
    if (!access?.isAdmin) return;
    setLoading(true);
    setError(undefined);
    try {
      const [organizationData, memberData, userData, supplierData] =
        await Promise.all([
          complianceRequest<Organization[]>(api, '/organizations'),
          complianceRequest<Member[]>(api, '/members'),
          complianceRequest<ManagedUser[]>(api, '/users'),
          complianceRequest<Supplier[]>(api, '/suppliers'),
        ]);
      setOrganizations(organizationData);
      setMembers(memberData);
      setUsers(userData);
      setSuppliers(supplierData);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [access?.isAdmin, api]);

  useEffect(() => {
    if (accessLoading || accessError || !access?.isAdmin) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, access?.isAdmin, reload]);

  async function saveOrganization(): Promise<void> {
    setSavingOrganization(true);
    setNotice(undefined);
    try {
      await complianceRequest(api, '/organizations', {
        method: 'POST',
        json: {
          name: organizationForm.name,
          code: organizationForm.code,
          description: organizationForm.description || undefined,
        },
      });
      setOrganizationDialog(false);
      setOrganizationForm({ name: '', code: '', description: '' });
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSavingOrganization(false);
    }
  }

  async function saveMember(): Promise<void> {
    if (!memberForm) return;
    setSavingMember(true);
    setNotice(undefined);
    try {
      await complianceRequest(api, '/members', {
        method: 'POST',
        json: {
          userId: memberForm.userId,
          role: memberForm.role,
          organizationId: memberForm.organizationId
            ? Number(memberForm.organizationId)
            : null,
          supplierId: memberForm.supplierId
            ? Number(memberForm.supplierId)
            : null,
        },
      });
      setMemberForm(undefined);
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSavingMember(false);
    }
  }

  async function removeMember(id: number): Promise<void> {
    setRemovingId(id);
    setNotice(undefined);
    try {
      await complianceRequest(api, `/members/${id}`, { method: 'DELETE' });
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setRemovingId(undefined);
    }
  }

  if (accessLoading) {
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

  if (!access?.isAdmin) {
    return (
      <PageContainer>
        <AccessDenied
          message={t('compliance.access.adminOnly', {
            defaultValue:
              'Only administrators can manage compliance role assignments.',
          })}
        />
      </PageContainer>
    );
  }

  const organizationOptions = organizations.map((organization) => ({
    value: String(organization.id),
    label: `${organization.name} (${organization.code})`,
  }));

  const isSupplierContact = memberForm?.role === 'supplier_contact';

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.access.title', {
          defaultValue: 'Compliance roles',
        })}
        description={t('compliance.access.description', {
          defaultValue:
            'Assign procurement, quality, legal and supplier-contact roles. A user without a membership acts as an administrator.',
        })}
      />

      {notice ? (
        <p className='text-sm text-destructive' role='alert'>
          {notice}
        </p>
      ) : null}

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : null}

      {!loading && !error ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {t('compliance.access.organizations', {
                  defaultValue: 'Procurement organizations',
                })}
              </CardTitle>
              <CardDescription>
                {t('compliance.access.organizationsHint', {
                  defaultValue:
                    'Data and attachments are isolated between organizations.',
                })}
              </CardDescription>
              <div>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setOrganizationDialog(true)}
                >
                  <PlusIcon />
                  {t('compliance.access.addOrganization', {
                    defaultValue: 'New organization',
                  })}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('compliance.access.code', { defaultValue: 'Code' })}
                    </TableHead>
                    <TableHead>
                      {t('compliance.access.name', { defaultValue: 'Name' })}
                    </TableHead>
                    <TableHead>
                      {t('compliance.access.descriptionLabel', {
                        defaultValue: 'Description',
                      })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((organization) => (
                    <TableRow key={organization.id}>
                      <TableCell className='font-mono text-xs'>
                        {organization.code}
                      </TableCell>
                      <TableCell>{organization.name}</TableCell>
                      <TableCell>{organization.description ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t('compliance.access.members', {
                  defaultValue: 'Role assignments',
                })}
              </CardTitle>
              <div>
                <Button
                  size='sm'
                  onClick={() => setMemberForm({ ...EMPTY_MEMBER })}
                  data-testid='compliance-member-create'
                >
                  <PlusIcon />
                  {t('compliance.access.assign', {
                    defaultValue: 'Assign role',
                  })}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <EmptyState>
                  {t('compliance.access.noMembers', {
                    defaultValue: 'No role assignments yet.',
                  })}
                </EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('compliance.access.user', { defaultValue: 'User' })}
                      </TableHead>
                      <TableHead>
                        {t('compliance.access.role', { defaultValue: 'Role' })}
                      </TableHead>
                      <TableHead>
                        {t('compliance.access.organization', {
                          defaultValue: 'Organization',
                        })}
                      </TableHead>
                      <TableHead>
                        {t('compliance.access.supplier', {
                          defaultValue: 'Supplier',
                        })}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('compliance.files.actions', {
                          defaultValue: 'Actions',
                        })}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          {member.userName ?? member.userId}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone='secondary'
                            labelKey={roleKey(member.role)}
                            fallback={member.role}
                          />
                        </TableCell>
                        <TableCell>{member.organizationName ?? '—'}</TableCell>
                        <TableCell>
                          {member.supplierId
                            ? (suppliers.find(
                                (supplier) => supplier.id === member.supplierId,
                              )?.name ?? `#${member.supplierId}`)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <div className='flex justify-end'>
                            <Button
                              variant='ghost'
                              size='icon-sm'
                              aria-label={t('compliance.access.remove', {
                                defaultValue: 'Remove role',
                              })}
                              disabled={removingId === member.id}
                              onClick={() => void removeMember(member.id)}
                            >
                              <TrashIcon />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog open={organizationDialog} onOpenChange={setOrganizationDialog}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.access.addOrganization', {
                defaultValue: 'New organization',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-3'>
            <div>
              <Label htmlFor='org-name'>
                {t('compliance.access.name', { defaultValue: 'Name' })}
              </Label>
              <Input
                id='org-name'
                className='mt-1'
                value={organizationForm.name}
                onChange={(event) =>
                  setOrganizationForm({
                    ...organizationForm,
                    name: event.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor='org-code'>
                {t('compliance.access.code', { defaultValue: 'Code' })}
              </Label>
              <Input
                id='org-code'
                className='mt-1'
                value={organizationForm.code}
                onChange={(event) =>
                  setOrganizationForm({
                    ...organizationForm,
                    code: event.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor='org-description'>
                {t('compliance.access.descriptionLabel', {
                  defaultValue: 'Description',
                })}
              </Label>
              <Input
                id='org-description'
                className='mt-1'
                value={organizationForm.description}
                onChange={(event) =>
                  setOrganizationForm({
                    ...organizationForm,
                    description: event.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setOrganizationDialog(false)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={
                savingOrganization ||
                !organizationForm.name.trim() ||
                !organizationForm.code.trim()
              }
              onClick={() => void saveOrganization()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(memberForm)}
        onOpenChange={(open) => !open && setMemberForm(undefined)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.access.assign', { defaultValue: 'Assign role' })}
            </DialogTitle>
            <DialogDescription>
              {t('compliance.access.assignHint', {
                defaultValue:
                  'Procurement maintains suppliers and contracts, quality reviews qualifications, legal views contracts, and a supplier contact sees only authorized material.',
              })}
            </DialogDescription>
          </DialogHeader>
          {memberForm ? (
            <div className='space-y-3'>
              <div>
                <Label>
                  {t('compliance.access.user', { defaultValue: 'User' })}
                </Label>
                <SimpleSelect
                  className='mt-1'
                  value={memberForm.userId}
                  onChange={(value) =>
                    setMemberForm({ ...memberForm, userId: value })
                  }
                  placeholder={t('compliance.access.selectUser', {
                    defaultValue: 'Select a user',
                  })}
                  options={users.map((user) => ({
                    value: user.id,
                    label: user.name || user.username || user.email || user.id,
                  }))}
                />
              </div>
              <div>
                <Label>
                  {t('compliance.access.role', { defaultValue: 'Role' })}
                </Label>
                <SimpleSelect
                  className='mt-1'
                  value={memberForm.role}
                  onChange={(value) =>
                    setMemberForm({
                      ...memberForm,
                      role: value,
                      supplierId: '',
                    })
                  }
                  options={COMPLIANCE_ROLES.map((role) => ({
                    value: role,
                    label: t(roleKey(role), { defaultValue: role }),
                  }))}
                />
              </div>
              {isSupplierContact ? (
                <div>
                  <Label>
                    {t('compliance.access.supplier', {
                      defaultValue: 'Supplier',
                    })}
                  </Label>
                  <SimpleSelect
                    className='mt-1'
                    value={memberForm.supplierId}
                    onChange={(value) =>
                      setMemberForm({ ...memberForm, supplierId: value })
                    }
                    placeholder={t('compliance.access.selectSupplier', {
                      defaultValue: 'Select a supplier',
                    })}
                    options={suppliers.map((supplier) => ({
                      value: String(supplier.id),
                      label: `${supplier.name} (${supplier.code})`,
                    }))}
                  />
                </div>
              ) : memberForm.role === 'administrator' ? null : (
                <div>
                  <Label>
                    {t('compliance.access.organization', {
                      defaultValue: 'Organization',
                    })}
                  </Label>
                  <SimpleSelect
                    className='mt-1'
                    value={memberForm.organizationId}
                    onChange={(value) =>
                      setMemberForm({ ...memberForm, organizationId: value })
                    }
                    placeholder={t('compliance.access.selectOrganization', {
                      defaultValue: 'Select an organization',
                    })}
                    options={organizationOptions}
                  />
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setMemberForm(undefined)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={
                savingMember ||
                !memberForm?.userId ||
                (memberForm?.role === 'supplier_contact' &&
                  !memberForm.supplierId) ||
                (memberForm?.role !== 'administrator' &&
                  memberForm?.role !== 'supplier_contact' &&
                  !memberForm?.organizationId)
              }
              onClick={() => void saveMember()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
