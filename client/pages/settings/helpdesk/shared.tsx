import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

export function WorkflowLoading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground'
      role='status'
    >
      <RefreshCwIcon className='size-4 animate-spin' />
      {t('helpdesk.loading')}
    </div>
  );
}

export function ReminderHoursField({
  label,
  hint,
  value,
  disabled,
  invalid,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly invalid?: boolean;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className='flex flex-col gap-2'>
      <Label htmlFor='reminder-hours'>{label}</Label>
      <Input
        id='reminder-hours'
        type='number'
        inputMode='numeric'
        min={1}
        max={720}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className='text-xs text-muted-foreground'>{hint}</p>
    </div>
  );
}

export function TicketProcessCard({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SaveButton({
  busy,
  disabled,
  onClick,
}: {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Button type='button' disabled={busy || disabled} onClick={onClick}>
      {t(busy ? 'helpdesk.actions.saving' : 'helpdesk.actions.save')}
    </Button>
  );
}
