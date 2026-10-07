import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Trash2Icon, UserPlusIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  addDepartmentMember,
  displayUserName,
  documentCenterErrorKey,
  listDepartmentMembers,
  listDirectoryUsers,
  removeDepartmentMember,
  type DepartmentMember,
  type DirectoryUser,
} from '@/lib/document-center';

/**
 * The `:departmentId/members` child route: the accounts that belong to a
 * department, which is what decides whether a document assigned to it is
 * visible to them.
 */
export default function DepartmentMembersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { departmentId } = useParams();
  const id = Number(departmentId);

  const [reloadCount, setReloadCount] = useState(0);
  const [members, setMembers] = useState<readonly DepartmentMember[]>();
  const [users, setUsers] = useState<readonly DirectoryUser[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const controller = new AbortController();
    Promise.all([
      listDepartmentMembers(api, id, controller.signal),
      listDirectoryUsers(api, { limit: 100 }, controller.signal),
    ]).then(
      ([departmentMembers, directoryUsers]) => {
        if (controller.signal.aborted) return;
        setMembers(departmentMembers);
        setUsers(directoryUsers);
        setError(null);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(failure);
      },
    );
    return () => controller.abort();
  }, [api, id, reloadCount]);

  const memberIds = new Set((members ?? []).map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));

  function nameOf(member: DepartmentMember): string {
    const user = users.find((item) => item.id === member.userId);
    return displayUserName(user ?? null) ?? member.userId;
  }

  async function add(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await addDepartmentMember(api, { departmentId: id, userId: selected });
      setSelected(null);
      setReloadCount((count) => count + 1);
    } catch (failure) {
      toaster.show({
        type: 'error',
        title: t(`documents.error.${documentCenterErrorKey(failure)}`),
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: DepartmentMember): Promise<void> {
    setBusy(true);
    try {
      await removeDepartmentMember(api, member.id);
      setReloadCount((count) => count + 1);
    } catch (failure) {
      toaster.show({
        type: 'error',
        title: t(`documents.error.${documentCenterErrorKey(failure)}`),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <RouteDrawer
      title={t('documentsAdmin.members.title')}
      description={t('documentsAdmin.members.description')}
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : members === undefined ? (
        <div
          className='space-y-3'
          role='status'
          aria-label={t('status.loading')}
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-end gap-2'>
            <div className='min-w-56 flex-1 space-y-2'>
              <Select
                value={selected}
                onValueChange={(value) =>
                  setSelected(value === null ? null : String(value))
                }
              >
                <SelectTrigger aria-label={t('documentsAdmin.members.select')}>
                  <SelectValue
                    placeholder={t('documentsAdmin.members.selectPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {displayUserName(user) ?? user.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type='button'
              disabled={busy || !selected}
              onClick={() => {
                void add();
              }}
            >
              {busy ? <Spinner /> : <UserPlusIcon />}
              {t('documentsAdmin.members.add')}
            </Button>
          </div>

          {members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('documentsAdmin.members.empty')}</EmptyTitle>
                <EmptyDescription>
                  {t('documentsAdmin.members.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {members.map((member) => (
                <li
                  key={member.id}
                  className='flex items-center justify-between gap-2 p-3'
                >
                  <span className='truncate text-sm'>{nameOf(member)}</span>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('documentsAdmin.members.remove')}
                    disabled={busy}
                    onClick={() => {
                      void remove(member);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </RouteDrawer>
  );
}
