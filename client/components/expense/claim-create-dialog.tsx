import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CLAIM_TYPES,
  useExpenseApi,
  type ClaimType,
  type ExpenseDepartment,
} from '@/lib/expense-api';
import {
  CLAIM_TYPE_KEYS,
  messageOf,
  todayInputValue,
} from '@/lib/expense-display';

export interface ClaimCreateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (claimId: number) => void;
}

export function ClaimCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: ClaimCreateDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const [departments, setDepartments] = useState<readonly ExpenseDepartment[]>(
    [],
  );
  const [departmentId, setDepartmentId] = useState('');
  const [type, setType] = useState<ClaimType>('travel');
  const [reason, setReason] = useState('');
  const [appliedAt, setAppliedAt] = useState(() => todayInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    api.listDepartments().then(
      (rows) => {
        if (active) setDepartments(rows);
      },
      (cause: unknown) => {
        if (active) setError(messageOf(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [api, open]);

  const departmentItems = Object.fromEntries(
    departments.map((department) => [String(department.id), department.name]),
  );
  const typeItems = Object.fromEntries(
    CLAIM_TYPES.map((value) => [value, t(CLAIM_TYPE_KEYS[value])]),
  );

  const submit = async (): Promise<void> => {
    if (!departmentId) {
      setError(t('expense.claims.departmentRequired'));
      return;
    }
    if (!reason.trim()) {
      setError(t('expense.claims.reasonRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.createClaim({
        departmentId: Number(departmentId),
        type,
        reason: reason.trim(),
        appliedAt,
      });
      setReason('');
      onCreated(created.id);
      onOpenChange(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('expense.claims.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('expense.claims.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='expense-department'>
              {t('expense.fields.department')}
            </Label>
            <Select
              items={departmentItems}
              value={departmentId}
              onValueChange={(value: string | null) =>
                setDepartmentId(value ?? '')
              }
            >
              <SelectTrigger id='expense-department' className='w-full'>
                <SelectValue
                  placeholder={t('expense.claims.departmentPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={String(department.id)}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='expense-type'>{t('expense.fields.type')}</Label>
            <Select
              items={typeItems}
              value={type}
              onValueChange={(value: string | null) =>
                setType((value ?? 'travel') as ClaimType)
              }
            >
              <SelectTrigger id='expense-type' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAIM_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(CLAIM_TYPE_KEYS[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='expense-applied-at'>
              {t('expense.fields.appliedAt')}
            </Label>
            <Input
              id='expense-applied-at'
              type='date'
              value={appliedAt}
              onChange={(event) => setAppliedAt(event.currentTarget.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='expense-reason'>{t('expense.fields.reason')}</Label>
            <Textarea
              id='expense-reason'
              value={reason}
              rows={3}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('expense.claims.amountIsDerived')}
          </p>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            type='button'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='button' disabled={saving} onClick={() => void submit()}>
            {saving
              ? t('expense.claims.creating')
              : t('expense.claims.createSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
