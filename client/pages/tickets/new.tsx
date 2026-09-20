import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { ArrowLeft, Save } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { errorKey, PRIORITY_KEYS, repairApi } from '@/lib/repair-api';
import { useRepairMeta } from '@/lib/use-repair';

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const meta = useRepairMeta();
  const [values, setValues] = useState({
    title: '',
    buildingId: '',
    roomId: '',
    equipmentId: '',
    location: '',
    faultType: '',
    priority: 'normal',
    description: '',
    contactName: '',
    contactPhone: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const set = (key: keyof typeof values, value: string): void =>
    setValues((current) => ({ ...current, [key]: value }));

  const rooms = (meta.data?.rooms ?? []).filter(
    (room) =>
      !values.buildingId || String(room.buildingId) === values.buildingId,
  );
  const equipment = (meta.data?.equipment ?? []).filter(
    (item) =>
      (!values.buildingId || String(item.buildingId) === values.buildingId) &&
      (!values.roomId || String(item.roomId) === values.roomId),
  );

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    if (!values.buildingId) {
      setError(
        t('repair.form.buildingRequired', {
          defaultValue: 'Choose a building.',
        }),
      );
      return;
    }
    setSubmitting(true);
    try {
      const created = await repairApi.createTicket(api, {
        title: values.title,
        buildingId: Number(values.buildingId),
        roomId: values.roomId ? Number(values.roomId) : undefined,
        equipmentId: values.equipmentId
          ? Number(values.equipmentId)
          : undefined,
        location: values.location,
        faultType: values.faultType,
        priority: values.priority,
        description: values.description,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
      });
      if (files.length) {
        await repairApi.uploadTicketFiles(api, created.id, {
          files,
          category: 'fault',
        });
      }
      void navigate(`/tickets/${created.id}`);
    } catch (cause) {
      const mapped = errorKey(cause);
      setError(t(mapped.key, { defaultValue: mapped.fallback }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-3xl'>
      <PageHeader
        title={t('repair.form.title', { defaultValue: 'New repair request' })}
        description={t('repair.form.description', {
          defaultValue:
            'Describe the fault and attach photos of the problem. A dispatcher will assign a technician.',
        })}
        actions={
          <Button variant='outline' render={<Link to='/tickets' />}>
            <ArrowLeft aria-hidden='true' />
            {t('repair.form.back', { defaultValue: 'Back to list' })}
          </Button>
        }
      />
      <form onSubmit={(event) => void submit(event)} className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('repair.form.fault', { defaultValue: 'Fault' })}
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4'>
            <div className='space-y-1'>
              <Label htmlFor='title'>
                {t('repair.form.subject', { defaultValue: 'Subject' })}
              </Label>
              <Input
                id='title'
                required
                value={values.title}
                onChange={(event) => set('title', event.currentTarget.value)}
              />
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>
                  {t('repair.form.building', { defaultValue: 'Building' })}
                </Label>
                <Select
                  value={values.buildingId}
                  onValueChange={(value) => {
                    set('buildingId', value ?? '');
                    set('roomId', '');
                    set('equipmentId', '');
                  }}
                >
                  <SelectTrigger
                    aria-label={t('repair.form.building', {
                      defaultValue: 'Building',
                    })}
                  >
                    <SelectValue
                      placeholder={t('repair.form.choose', {
                        defaultValue: 'Choose…',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(meta.data?.buildings ?? []).map((building) => (
                      <SelectItem key={building.id} value={String(building.id)}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>{t('repair.form.room', { defaultValue: 'Room' })}</Label>
                <Select
                  value={values.roomId}
                  onValueChange={(value) => {
                    set('roomId', value ?? '');
                    set('equipmentId', '');
                  }}
                >
                  <SelectTrigger
                    aria-label={t('repair.form.room', { defaultValue: 'Room' })}
                  >
                    <SelectValue
                      placeholder={t('repair.form.choose', {
                        defaultValue: 'Choose…',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={String(room.id)}>
                        {room.roomNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>
                  {t('repair.form.equipment', { defaultValue: 'Equipment' })}
                </Label>
                <Select
                  value={values.equipmentId}
                  onValueChange={(value) => set('equipmentId', value ?? '')}
                >
                  <SelectTrigger
                    aria-label={t('repair.form.equipment', {
                      defaultValue: 'Equipment',
                    })}
                  >
                    <SelectValue
                      placeholder={t('repair.form.optional', {
                        defaultValue: 'Optional',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='location'>
                  {t('repair.form.location', { defaultValue: 'Location' })}
                </Label>
                <Input
                  id='location'
                  required
                  value={values.location}
                  onChange={(event) =>
                    set('location', event.currentTarget.value)
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label>
                  {t('repair.form.faultType', { defaultValue: 'Fault type' })}
                </Label>
                <Select
                  value={values.faultType}
                  onValueChange={(value) => set('faultType', value ?? '')}
                >
                  <SelectTrigger
                    aria-label={t('repair.form.faultType', {
                      defaultValue: 'Fault type',
                    })}
                  >
                    <SelectValue
                      placeholder={t('repair.form.choose', {
                        defaultValue: 'Choose…',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(meta.data?.faultTypes ?? []).map((faultType) => (
                      <SelectItem key={faultType} value={faultType}>
                        {t(`repair.faultType.${faultType}`, {
                          defaultValue: faultType,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>
                  {t('repair.form.priority', { defaultValue: 'Priority' })}
                </Label>
                <Select
                  value={values.priority}
                  onValueChange={(value) => set('priority', value ?? '')}
                >
                  <SelectTrigger
                    aria-label={t('repair.form.priority', {
                      defaultValue: 'Priority',
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_KEYS.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {t(`repair.priority.${priority}`, {
                          defaultValue: priority,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='description'>
                {t('repair.form.problem', { defaultValue: 'Description' })}
              </Label>
              <Textarea
                id='description'
                required
                rows={4}
                value={values.description}
                onChange={(event) =>
                  set('description', event.currentTarget.value)
                }
              />
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label htmlFor='contactName'>
                  {t('repair.form.contactName', {
                    defaultValue: 'Contact name',
                  })}
                </Label>
                <Input
                  id='contactName'
                  required
                  value={values.contactName}
                  onChange={(event) =>
                    set('contactName', event.currentTarget.value)
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='contactPhone'>
                  {t('repair.form.contactPhone', {
                    defaultValue: 'Contact phone',
                  })}
                </Label>
                <Input
                  id='contactPhone'
                  required
                  value={values.contactPhone}
                  onChange={(event) =>
                    set('contactPhone', event.currentTarget.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('repair.form.photos', { defaultValue: 'Fault photos' })}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Input
              type='file'
              multiple
              aria-label={t('repair.form.photos', {
                defaultValue: 'Fault photos',
              })}
              onChange={(event) =>
                setFiles(
                  Array.from(event.currentTarget.files ?? []).slice(0, 5),
                )
              }
            />
            <p className='text-xs text-muted-foreground'>
              {t('repair.files.limits', {
                defaultValue: 'Up to 5 files per upload, 20 MB each.',
              })}
            </p>
          </CardContent>
        </Card>

        {error ? (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        ) : null}

        <div className='flex gap-2'>
          <Button type='submit' disabled={submitting}>
            <Save aria-hidden='true' />
            {submitting
              ? t('repair.form.submitting', { defaultValue: 'Submitting…' })
              : t('repair.form.submit', { defaultValue: 'Submit request' })}
          </Button>
          <Button variant='ghost' render={<Link to='/tickets' />}>
            {t('actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
