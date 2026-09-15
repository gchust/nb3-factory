import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useExpenseApi, type ExpenseDepartment } from '@/lib/expense-api';

const NO_MANAGER = '__none__';

interface UserOption {
  readonly id: string;
  readonly label: string;
}

export default function ExpenseDepartmentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const client = useService(apiClientToken);
  const [departments, setDepartments] = useState<readonly ExpenseDepartment[]>(
    [],
  );
  const [users, setUsers] = useState<readonly UserOption[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    api.listDepartments().then(
      (rows) => {
        if (!active) return;
        setDepartments(rows);
        setError('');
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, version]);

  useEffect(() => {
    let active = true;
    client
      .request<{ data: { items?: readonly ManagedUserRow[] } }>({
        path: 'users',
        query: { pageSize: 200 },
      })
      .then(
        (response) => {
          if (!active) return;
          const items = response.data?.items ?? [];
          setUsers(
            items.map((user) => ({
              id: String(user.id),
              label:
                user.name?.trim() ||
                user.username?.trim() ||
                user.email?.trim() ||
                String(user.id),
            })),
          );
        },
        () => {
          // The manager list is optional; without it departments can still be managed.
          if (active) setUsers([]);
        },
      );
    return () => {
      active = false;
    };
  }, [client]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await action();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const managerItems: Record<string, string> = Object.fromEntries([
    [NO_MANAGER, t('expense.departments.noManager')] as const,
    ...users.map((user) => [user.id, user.label] as const),
  ]);

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 px-6 py-8'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('expense.departments.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('expense.departments.description')}
        </p>
      </header>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.departments.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className='flex flex-wrap items-end gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              void run(async () => {
                await api.createDepartment({
                  name: name.trim(),
                  managerId: null,
                });
                setName('');
              });
            }}
          >
            <div className='min-w-48 flex-1 space-y-1.5'>
              <Input
                aria-label={t('expense.fields.department')}
                value={name}
                placeholder={t('expense.departments.namePlaceholder')}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            <Button type='submit' disabled={busy || name.trim().length === 0}>
              {t('expense.departments.addButton')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <Loading label={t('expense.common.loading')} />
      ) : (
        <div className='rounded-xl ring-1 ring-foreground/10'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expense.fields.department')}</TableHead>
                <TableHead>{t('expense.fields.manager')}</TableHead>
                <TableHead className='text-right'>
                  {t('expense.common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((department) => (
                <TableRow key={department.id}>
                  <TableCell className='font-medium'>
                    {department.name}
                  </TableCell>
                  <TableCell>
                    <Select
                      items={managerItems}
                      value={department.managerId ?? NO_MANAGER}
                      onValueChange={(value: string | null) =>
                        void run(() =>
                          api.updateDepartment(department.id, {
                            managerId:
                              !value || value === NO_MANAGER ? null : value,
                          }),
                        )
                      }
                    >
                      <SelectTrigger
                        className='w-56'
                        aria-label={`${t('expense.fields.manager')}: ${department.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER}>
                          {t('expense.departments.noManager')}
                        </SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={busy}
                      onClick={() =>
                        void run(() => api.deleteDepartment(department.id))
                      }
                    >
                      {t('expense.common.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

interface ManagedUserRow {
  readonly id: string;
  readonly name?: string;
  readonly username?: string;
  readonly email?: string;
}
