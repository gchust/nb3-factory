import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  KeyRoundIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  Trash2Icon,
  UserCheckIcon,
  UserRoundIcon,
  UserXIcon,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { toast } from '#components/ui/toast';

import type {
  DocumentRoleUser,
  RecordOption,
  SharingRule,
  SubjectOption,
} from '../../documents/types.js';

const ROLE_KEYS = [
  'documents.admin',
  'documents.maintainer',
  'documents.reader',
] as const;

type RoleKey = (typeof ROLE_KEYS)[number];

const ROLE_LABEL_KEYS: Readonly<Record<RoleKey, string>> = {
  'documents.admin': 'documents.roles.admin',
  'documents.maintainer': 'documents.roles.maintainer',
  'documents.reader': 'documents.roles.reader',
};

const ROLE_DESCRIPTION_KEYS: Readonly<Record<RoleKey, string>> = {
  'documents.admin': 'documents.roleDescriptions.admin',
  'documents.maintainer': 'documents.roleDescriptions.maintainer',
  'documents.reader': 'documents.roleDescriptions.reader',
};

interface UserResult {
  readonly users: readonly DocumentRoleUser[];
  readonly total: number;
}

export default function DocumentAdministrationPage(): ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState('users');

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('documents.administration.title')}
        description={t('documents.administration.description')}
      />
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value='users'>
            <UserRoundIcon />
            {t('documents.administration.usersTab')}
          </TabsTrigger>
          <TabsTrigger value='sharing'>
            <Share2Icon />
            {t('documents.administration.sharingTab')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='users' className='mt-4'>
          <UserRolesPanel />
        </TabsContent>
        <TabsContent value='sharing' className='mt-4'>
          <SharingRulesPanel />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function UserRolesPanel(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { session } = useAuthentication();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UserResult>({ users: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [reloadCount, setReloadCount] = useState(0);
  const [editing, setEditing] = useState<DocumentRoleUser>();
  const [roles, setRoles] = useState<readonly RoleKey[]>([]);
  const [pending, setPending] = useState(false);
  const [disableTarget, setDisableTarget] = useState<DocumentRoleUser>();
  const [statusPending, setStatusPending] = useState(false);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  // Search the server after a short pause so each keystroke does not become a request.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if (next === query) return;
      setLoading(true);
      setError(undefined);
      setPage(1);
      setQuery(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (query) params.set('q', query);
    api
      .request<{ data: UserResult }>({
        path: `documentsAdministration/users?${params.toString()}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult(data);
            setLoading(false);
          }
        },
        (failure: unknown) => {
          if (!controller.signal.aborted) {
            setError(failure);
            setLoading(false);
          }
        },
      );
    return () => controller.abort();
  }, [api, page, query, reloadCount]);

  const reload = (): void => {
    setLoading(true);
    setError(undefined);
    setReloadCount((count) => count + 1);
  };

  const goToPage = (next: number): void => {
    setLoading(true);
    setError(undefined);
    setPage(next);
  };

  const openRoles = (user: DocumentRoleUser): void => {
    setEditing(user);
    setRoles(
      user.roles.filter((role): role is RoleKey =>
        (ROLE_KEYS as readonly string[]).includes(role),
      ),
    );
  };

  const saveRoles = async (): Promise<void> => {
    if (!editing) return;
    setPending(true);
    try {
      const { data } = await api.request<{ data: UserResult }>({
        path: `documentsAdministration/users/${encodeURIComponent(editing.id)}/roles`,
        method: 'PUT',
        json: { roles },
      });
      const updated = data.users[0];
      if (updated) {
        setResult((current) => ({
          ...current,
          users: current.users.map((user) =>
            user.id === updated.id ? updated : user,
          ),
        }));
      }
      toast.add({
        title: t('documents.administration.rolesSaved'),
        type: 'success',
      });
      setEditing(undefined);
    } catch (failure) {
      toast.add({
        title: t('documents.administration.rolesSaveFailed'),
        description: errorMessage(t, failure),
        type: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  const setAccountEnabled = async (
    user: DocumentRoleUser,
    enabled: boolean,
  ): Promise<void> => {
    setStatusPending(true);
    try {
      // The Users plugin owns account state: disabling deletes every Session and
      // disconnects realtime, so an already signed-in person loses access at once.
      const { data } = await api.request<{
        data: { readonly disabledAt: string | null };
      }>({
        path: `users/${encodeURIComponent(user.id)}/${enabled ? 'enable' : 'disable'}`,
        method: 'POST',
      });
      setResult((current) => ({
        ...current,
        users: current.users.map((item) =>
          item.id === user.id ? { ...item, disabledAt: data.disabledAt } : item,
        ),
      }));
      toast.add({
        title: t(
          enabled
            ? 'documents.administration.accountEnabled'
            : 'documents.administration.accountDisabled',
        ),
        type: 'success',
      });
      setDisableTarget(undefined);
    } catch (failure) {
      toast.add({
        title: t(
          enabled
            ? 'documents.administration.accountEnableFailed'
            : 'documents.administration.accountDisableFailed',
        ),
        description: statusErrorMessage(t, failure),
        type: 'error',
      });
    } finally {
      setStatusPending(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='relative w-full max-w-sm'>
          <SearchIcon
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden
          />
          <Input
            className='pl-8'
            aria-label={t('documents.administration.searchUsers')}
            placeholder={t('documents.administration.searchUsers')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <p className='text-sm text-muted-foreground'>
          {t('documents.administration.userCount', { total: result.total })}
        </p>
      </div>

      {error ? (
        <PanelError
          message={errorMessage(t, error)}
          retryLabel={t('documents.retry')}
          onRetry={reload}
        />
      ) : null}

      <div className='overflow-hidden rounded-xl border border-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('documents.administration.user')}</TableHead>
              <TableHead>{t('documents.administration.roles')}</TableHead>
              <TableHead>{t('documents.administration.status')}</TableHead>
              <TableHead className='w-12 text-right'>
                <span className='sr-only'>
                  {t('documents.administration.manageRoles')}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className='py-16 text-center'>
                  <span className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                    <Spinner />
                    {t('documents.loading')}
                  </span>
                </TableCell>
              </TableRow>
            ) : result.users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className='py-16 text-center text-sm text-muted-foreground'
                >
                  {t('documents.administration.noUsers')}
                </TableCell>
              </TableRow>
            ) : (
              result.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {user.name || user.username || user.email}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {user.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.roles.length > 0 ? (
                      <div className='flex flex-wrap gap-1.5'>
                        {user.roles.map((role) => (
                          <StatusBadge key={role} tone='info'>
                            {ROLE_LABEL_KEYS[role as RoleKey]
                              ? t(ROLE_LABEL_KEYS[role as RoleKey])
                              : role}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <span className='text-sm text-muted-foreground'>
                        {t('documents.administration.noRole')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={user.disabledAt ? 'neutral' : 'success'}>
                      {t(
                        user.disabledAt
                          ? 'documents.administration.disabled'
                          : 'documents.administration.active',
                      )}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            aria-label={t(
                              'documents.administration.manageRoles',
                            )}
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem onClick={() => openRoles(user)}>
                          <KeyRoundIcon />
                          {t('documents.administration.manageRoles')}
                        </DropdownMenuItem>
                        {user.id === session?.user.id ? null : (
                          <>
                            <DropdownMenuSeparator />
                            {user.disabledAt ? (
                              <DropdownMenuItem
                                disabled={statusPending}
                                onClick={() =>
                                  void setAccountEnabled(user, true)
                                }
                              >
                                <UserCheckIcon />
                                {t('documents.administration.enableAccount')}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                variant='destructive'
                                disabled={statusPending}
                                onClick={() => setDisableTarget(user)}
                              >
                                <UserXIcon />
                                {t('documents.administration.disableAccount')}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className='flex items-center justify-between gap-3'>
        <p className='text-sm text-muted-foreground'>
          {t('documents.administration.pageOf', {
            page,
            total: totalPages,
          })}
        </p>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1 || loading}
            onClick={() => goToPage(Math.max(1, page - 1))}
          >
            {t('documents.administration.previous')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages || loading}
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
          >
            {t('documents.administration.next')}
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {t('documents.administration.manageRolesTitle')}
            </DialogTitle>
            <DialogDescription>
              {editing?.name || editing?.email || ''}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-3'>
            {ROLE_KEYS.map((role) => (
              <label
                key={role}
                className='flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3'
              >
                <input
                  type='checkbox'
                  className='mt-0.5 size-4 accent-primary'
                  disabled={pending}
                  checked={roles.includes(role)}
                  onChange={(event) =>
                    setRoles((current) =>
                      event.target.checked
                        ? [...current, role]
                        : current.filter((item) => item !== role),
                    )
                  }
                />
                <span className='flex flex-col gap-0.5'>
                  <span className='text-sm font-medium'>
                    {t(ROLE_LABEL_KEYS[role])}
                  </span>
                  <span className='text-sm text-muted-foreground'>
                    {t(ROLE_DESCRIPTION_KEYS[role])}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => setEditing(undefined)}
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={pending} onClick={() => void saveRoles()}>
              {pending ? <Spinner /> : null}
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(disableTarget)}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(undefined);
        }}
      >
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('documents.administration.disableAccountTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.administration.disableAccountDescription', {
                name:
                  disableTarget?.name ||
                  disableTarget?.email ||
                  disableTarget?.username ||
                  '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusPending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={statusPending || !disableTarget}
              onClick={() => {
                if (disableTarget) {
                  void setAccountEnabled(disableTarget, false);
                }
              }}
            >
              {statusPending ? <Spinner /> : null}
              {t('documents.administration.disableAccount')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ShareInput {
  readonly key: string;
  readonly documentId: string;
  readonly subjectId: string;
  readonly action: 'view' | 'edit';
  readonly title: string;
}

function SharingRulesPanel(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [rules, setRules] = useState<readonly SharingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [reloadCount, setReloadCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<SharingRule>();
  const [deletePending, setDeletePending] = useState(false);
  const [documents, setDocuments] = useState<readonly RecordOption[]>([]);
  const [subjects, setSubjects] = useState<readonly SubjectOption[]>([]);
  const [input, setInput] = useState<ShareInput>({
    key: '',
    documentId: '',
    subjectId: '',
    action: 'view',
    title: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: readonly SharingRule[] }>({
        path: 'authorization/sharingRules',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setRules(data);
            setLoading(false);
          }
        },
        (failure: unknown) => {
          if (!controller.signal.aborted) {
            setError(failure);
            setLoading(false);
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = (): void => {
    setLoading(true);
    setError(undefined);
    setReloadCount((count) => count + 1);
  };

  const openCreate = async (): Promise<void> => {
    setCreating(true);
    setInput({
      key: `document-share-${Date.now().toString(36)}`,
      documentId: '',
      subjectId: '',
      action: 'view',
      title: '',
    });
    try {
      const [documentResult, subjectResult] = await Promise.all([
        api.request<{ data: readonly RecordOption[] }>({
          path: 'authorization/sharingRules/records/documents?page=1&pageSize=100',
        }),
        api.request<{ data: readonly SubjectOption[] }>({
          path: 'authorization/sharingRules/subjects/user?page=1&pageSize=100',
        }),
      ]);
      setDocuments(documentResult.data);
      setSubjects(subjectResult.data);
    } catch (failure) {
      toast.add({
        title: t('documents.administration.sharingOptionsFailed'),
        description: errorMessage(t, failure),
        type: 'error',
      });
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!input.documentId || !input.subjectId) return;
    setPending(true);
    try {
      const { data } = await api.request<{ data: SharingRule }>({
        path: 'authorization/sharingRules',
        method: 'POST',
        json: {
          key: input.key,
          title: input.title.trim() || undefined,
          resource: { type: 'composite', id: 'documents' },
          subjects: [{ type: 'user', id: input.subjectId }],
          actions: [
            {
              action: input.action,
              scopeKey: 'documents',
              selection: {
                type: 'records',
                ids: [input.documentId],
              },
            },
          ],
        },
      });
      setRules((current) => [...current, data]);
      toast.add({
        title: t('documents.administration.sharingCreated'),
        type: 'success',
      });
      setCreating(false);
    } catch (failure) {
      toast.add({
        title: t('documents.administration.sharingCreateFailed'),
        description: errorMessage(t, failure),
        type: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await api.request<void>({
        path: `authorization/sharingRules/${encodeURIComponent(deleting.key)}`,
        method: 'DELETE',
      });
      setRules((current) =>
        current.filter((rule) => rule.key !== deleting.key),
      );
      toast.add({
        title: t('documents.administration.sharingDeleted'),
        type: 'success',
      });
      setDeleting(undefined);
    } catch (failure) {
      toast.add({
        title: t('documents.administration.sharingDeleteFailed'),
        description: errorMessage(t, failure),
        type: 'error',
      });
    } finally {
      setDeletePending(false);
    }
  };

  const documentLabels = useMemo(
    () => new Map(documents.map((item) => [item.id, item.label])),
    [documents],
  );
  const subjectLabels = useMemo(
    () =>
      new Map(
        subjects.map((item) => [
          item.id,
          typeof item.title === 'string' ? item.title : item.title.key,
        ]),
      ),
    [subjects],
  );

  const describeSelection = (rule: SharingRule): string => {
    const action = rule.actions[0];
    if (!action) return '—';
    if (action.selection.type !== 'records') {
      return action.selection.key ?? action.selection.type;
    }
    return (action.selection.ids ?? [])
      .map((id) => documentLabels.get(id) ?? id)
      .join(', ');
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='max-w-2xl text-sm text-muted-foreground'>
          {t('documents.administration.sharingDescription')}
        </p>
        <Button onClick={() => void openCreate()}>
          <PlusIcon data-icon='inline-start' />
          {t('documents.administration.newSharing')}
        </Button>
      </div>

      {error ? (
        <PanelError
          message={errorMessage(t, error)}
          retryLabel={t('documents.retry')}
          onRetry={reload}
        />
      ) : null}

      {loading ? (
        <div className='flex items-center justify-center gap-2 rounded-xl border border-border py-16 text-sm text-muted-foreground'>
          <Spinner />
          {t('documents.loading')}
        </div>
      ) : rules.length === 0 ? (
        <Empty className='rounded-xl border border-dashed border-border py-12'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Share2Icon />
            </EmptyMedia>
            <EmptyTitle>
              {t('documents.administration.sharingEmptyTitle')}
            </EmptyTitle>
            <EmptyDescription>
              {t('documents.administration.sharingEmptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='overflow-hidden rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('documents.administration.sharingRule')}
                </TableHead>
                <TableHead>
                  {t('documents.administration.sharedWith')}
                </TableHead>
                <TableHead>{t('documents.administration.document')}</TableHead>
                <TableHead>
                  {t('documents.administration.permission')}
                </TableHead>
                <TableHead className='w-12 text-right'>
                  <span className='sr-only'>
                    {t('documents.administration.deleteSharing')}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const action = rule.actions[0];
                return (
                  <TableRow key={rule.key}>
                    <TableCell>
                      <span className='font-medium'>
                        {typeof rule.title === 'string' ? rule.title : rule.key}
                      </span>
                    </TableCell>
                    <TableCell>
                      {rule.subjects
                        .map(
                          (subject) =>
                            subjectLabels.get(subject.id) ?? subject.id,
                        )
                        .join(', ')}
                    </TableCell>
                    <TableCell>{describeSelection(rule)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={action?.action === 'edit' ? 'warning' : 'info'}
                      >
                        {t(
                          `documents.administration.sharingActions.${action?.action ?? 'view'}`,
                        )}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className='text-right'>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label={t(
                                'documents.administration.deleteSharing',
                              )}
                            >
                              <MoreHorizontalIcon />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            variant='destructive'
                            onClick={() => setDeleting(rule)}
                          >
                            <Trash2Icon />
                            {t('documents.administration.deleteSharing')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('documents.administration.newSharingTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('documents.administration.newSharingDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => void save(event)}
          >
            <div className='flex flex-col gap-2'>
              <span className='text-sm font-medium'>
                {t('documents.administration.document')}
              </span>
              <Select
                items={documents.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                value={input.documentId}
                onValueChange={(value) =>
                  setInput((current) => ({
                    ...current,
                    documentId: String(value ?? ''),
                  }))
                }
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={t('documents.administration.document')}
                >
                  <SelectValue
                    placeholder={t('documents.administration.selectDocument')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-2'>
              <span className='text-sm font-medium'>
                {t('documents.administration.sharedWith')}
              </span>
              <Select
                items={subjects.map((item) => ({
                  value: item.id,
                  label:
                    typeof item.title === 'string'
                      ? item.title
                      : item.title.key,
                }))}
                value={input.subjectId}
                onValueChange={(value) =>
                  setInput((current) => ({
                    ...current,
                    subjectId: String(value ?? ''),
                  }))
                }
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={t('documents.administration.sharedWith')}
                >
                  <SelectValue
                    placeholder={t('documents.administration.selectUser')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {typeof item.title === 'string'
                        ? item.title
                        : item.title.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-2'>
              <span className='text-sm font-medium'>
                {t('documents.administration.permission')}
              </span>
              <Select
                items={[
                  { value: 'view', label: t('documents.permissions.view') },
                  { value: 'edit', label: t('documents.permissions.edit') },
                ]}
                value={input.action}
                onValueChange={(value) =>
                  setInput((current) => ({
                    ...current,
                    action: String(value) === 'edit' ? 'edit' : 'view',
                  }))
                }
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={t('documents.administration.permission')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='view'>
                    {t('documents.permissions.view')}
                  </SelectItem>
                  <SelectItem value='edit'>
                    {t('documents.permissions.edit')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-2'>
              <span className='text-sm font-medium'>
                {t('documents.administration.sharingLabel')}
              </span>
              <Input
                value={input.title}
                placeholder={t(
                  'documents.administration.sharingLabelPlaceholder',
                )}
                disabled={pending}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={pending}
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type='submit'
                disabled={
                  pending || !input.documentId || !input.subjectId || !input.key
                }
              >
                {pending ? <Spinner /> : null}
                {t('documents.administration.createSharing')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('documents.administration.deleteSharingTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.administration.deleteSharingDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={deletePending}
              onClick={() => void confirmDelete()}
            >
              {deletePending ? <Spinner /> : null}
              {t('documents.administration.deleteSharing')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PanelError({
  message,
  retryLabel,
  onRetry,
}: {
  readonly message: string;
  readonly retryLabel: string;
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div className='flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm'>
      <span>{message}</span>
      <Button variant='outline' size='sm' onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

function errorMessage(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return t('documents.errors.denied');
    if (error.status === 404) return t('documents.errors.notFound');
  }
  return t('documents.errors.generic');
}

function statusErrorMessage(
  t: (key: string) => string,
  error: unknown,
): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return t('documents.errors.denied');
    if (error.status === 404) return t('documents.administration.userNotFound');
    if (error.status === 400) {
      return t('documents.administration.statusChangeBlocked');
    }
  }
  return t('documents.errors.generic');
}
