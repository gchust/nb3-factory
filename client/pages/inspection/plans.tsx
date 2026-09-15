import { Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

import { useInspectionApi } from '../../components/inspection/api.js';
import { errorMessageKey } from '../../components/inspection/error-message.js';
import {
  formatDate,
  PLAN_CYCLE_KEYS,
  PLAN_STATUS_KEYS,
} from '../../components/inspection/format.js';
import { useInspectionUser } from '../../components/inspection/use-inspection-user.js';
import {
  canManageCatalog,
  type Plan,
  type PlanCycle,
  type PlanInput,
  type PlanStatus,
} from '../../components/inspection/types.js';

const CYCLES: readonly PlanCycle[] = ['daily', 'weekly', 'monthly'];
const STATUSES: readonly PlanStatus[] = ['active', 'ended'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY: PlanInput = {
  name: '',
  cycle: 'daily',
  team: '',
  startDate: today(),
  status: 'active',
};

export default function PlansPage(): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const { user } = useInspectionUser();
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | undefined>();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PlanInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const mayManage = canManageCatalog(user?.role ?? 'none');

  const load = useCallback(async () => {
    try {
      setPlans(await api.plans());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (): void => {
    setEditing(undefined);
    setDraft(EMPTY);
    setError(undefined);
    setOpen(true);
  };

  const openEdit = (plan: Plan): void => {
    setEditing(plan);
    setDraft({
      name: plan.name,
      cycle: plan.cycle,
      team: plan.team,
      startDate: plan.startDate.slice(0, 10),
      status: plan.status,
    });
    setError(undefined);
    setOpen(true);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      const input: PlanInput = {
        ...draft,
        startDate: new Date(`${draft.startDate}T00:00:00`).toISOString(),
      };
      if (editing) await api.updatePlan(editing.id, input);
      else await api.createPlan(input);
      setOpen(false);
      await load();
    } catch (cause) {
      setError(errorMessageKey(errorCodeOf(cause)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='space-y-6 p-6'>
      <header className='flex items-start justify-between gap-4'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('inspection.plans.title')}
        </h1>
        {mayManage ? (
          <Button onClick={openCreate} type='button'>
            <Plus />
            {t('inspection.plans.create')}
          </Button>
        ) : null}
      </header>

      <Card>
        <CardContent className='pt-6'>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              {t('inspection.plans.loading')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inspection.plans.name')}</TableHead>
                  <TableHead>{t('inspection.plans.cycle')}</TableHead>
                  <TableHead>{t('inspection.plans.team')}</TableHead>
                  <TableHead>{t('inspection.plans.startDate')}</TableHead>
                  <TableHead>{t('inspection.plans.status')}</TableHead>
                  {mayManage ? (
                    <TableHead className='text-right'>
                      {t('inspection.plans.actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className='font-medium'>{plan.name}</TableCell>
                    <TableCell>{t(PLAN_CYCLE_KEYS[plan.cycle])}</TableCell>
                    <TableCell>{plan.team}</TableCell>
                    <TableCell>{formatDate(plan.startDate)}</TableCell>
                    <TableCell>
                      <Badge variant='secondary'>
                        {t(PLAN_STATUS_KEYS[plan.status])}
                      </Badge>
                    </TableCell>
                    {mayManage ? (
                      <TableCell className='text-right'>
                        <Button
                          onClick={() => openEdit(plan)}
                          size='sm'
                          type='button'
                          variant='outline'
                        >
                          <Pencil />
                          {t('inspection.plans.edit')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('inspection.plans.editTitle')
                : t('inspection.plans.createTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='plan-name'>{t('inspection.plans.name')}</Label>
              <Input
                id='plan-name'
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                value={draft.name}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='plan-cycle'>{t('inspection.plans.cycle')}</Label>
              <Select
                value={draft.cycle}
                onValueChange={(value) =>
                  setDraft({ ...draft, cycle: value as PlanCycle })
                }
              >
                <SelectTrigger className='w-full' id='plan-cycle'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLES.map((cycle) => (
                    <SelectItem key={cycle} value={cycle}>
                      {t(PLAN_CYCLE_KEYS[cycle])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='plan-team'>{t('inspection.plans.team')}</Label>
              <Input
                id='plan-team'
                onChange={(event) =>
                  setDraft({ ...draft, team: event.target.value })
                }
                value={draft.team}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='plan-start'>
                {t('inspection.plans.startDate')}
              </Label>
              <Input
                id='plan-start'
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
                type='date'
                value={draft.startDate}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='plan-status'>
                {t('inspection.plans.status')}
              </Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  setDraft({ ...draft, status: value as PlanStatus })
                }
              >
                <SelectTrigger className='w-full' id='plan-status'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(PLAN_STATUS_KEYS[status])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>{t(error)}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type='button'
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={saving} onClick={() => void save()} type='button'>
              {saving ? t('inspection.plans.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const payload = (error as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
