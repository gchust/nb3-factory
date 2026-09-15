import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useNavigate } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { useInspectionApi } from '../../components/inspection/api.js';
import { errorMessageKey } from '../../components/inspection/error-message.js';
import { PhotoUpload } from '../../components/inspection/photo-upload.js';
import {
  PLAN_CYCLE_KEYS,
  RESULT_KEYS,
} from '../../components/inspection/format.js';
import { useSelectableReference } from '../../components/inspection/use-selectable-reference.js';
import type {
  InspectionResult,
  Photo,
} from '../../components/inspection/types.js';

export default function RecordNewPage(): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const navigate = useNavigate();
  const { devices, plans } = useSelectableReference();
  const [deviceId, setDeviceId] = useState('');
  const [planId, setPlanId] = useState('none');
  const [result, setResult] = useState<InspectionResult>('normal');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<readonly Photo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [missingPhotos, setMissingPhotos] = useState(false);
  const [missingDevice, setMissingDevice] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitError(undefined);
    setMissingDevice(deviceId === '');
    setMissingPhotos(photos.length === 0);
    if (deviceId === '' || photos.length === 0) return;

    setSubmitting(true);
    try {
      const id = await api.createRecord({
        deviceId: Number(deviceId),
        planId: planId === 'none' ? null : Number(planId),
        result,
        description: description.trim() ? description.trim() : null,
        photoIds: photos.map((photo) => photo.fileId),
      });
      void navigate(`/inspection/records/${id}`);
    } catch (cause) {
      setSubmitError(errorMessageKey(errorCodeOf(cause)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 p-6'>
      <h1 className='font-heading text-2xl font-semibold tracking-tight'>
        {t('inspection.form.title')}
      </h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('inspection.form.sectionDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='record-device'>
                {t('inspection.form.device')}
              </Label>
              <Select
                value={deviceId}
                onValueChange={(value) => setDeviceId(String(value))}
              >
                <SelectTrigger className='w-full' id='record-device'>
                  <SelectValue
                    placeholder={t('inspection.form.selectDevice')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.code} · {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='record-plan'>{t('inspection.form.plan')}</Label>
              <Select
                value={planId}
                onValueChange={(value) => setPlanId(String(value))}
              >
                <SelectTrigger className='w-full' id='record-plan'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>
                    {t('inspection.form.noPlan')}
                  </SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={String(plan.id)}>
                      {plan.name} · {t(PLAN_CYCLE_KEYS[plan.cycle])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='record-result'>
                {t('inspection.form.result')}
              </Label>
              <Select
                value={result}
                onValueChange={(value) =>
                  setResult(value === 'abnormal' ? 'abnormal' : 'normal')
                }
              >
                <SelectTrigger className='w-full' id='record-result'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='normal'>
                    {t(RESULT_KEYS.normal)}
                  </SelectItem>
                  <SelectItem value='abnormal'>
                    {t(RESULT_KEYS.abnormal)}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='record-description'>
                {t('inspection.form.description')}
              </Label>
              <Textarea
                id='record-description'
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('inspection.form.descriptionPlaceholder')}
                rows={4}
                value={description}
              />
            </div>
          </CardContent>
        </Card>

        <Card className='mt-6'>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('inspection.form.photos')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              {t('inspection.form.photosHint')}
            </p>
            <PhotoUpload
              disabled={submitting}
              onChange={setPhotos}
              value={photos}
            />
          </CardContent>
        </Card>

        {missingDevice ? (
          <Alert className='mt-6' variant='destructive'>
            <AlertDescription>
              {t('inspection.form.deviceRequired')}
            </AlertDescription>
          </Alert>
        ) : null}
        {missingPhotos ? (
          <Alert className='mt-6' variant='destructive'>
            <AlertDescription>
              {t('inspection.form.photosRequired')}
            </AlertDescription>
          </Alert>
        ) : null}
        {submitError ? (
          <Alert className='mt-6' variant='destructive'>
            <AlertDescription>{t(submitError)}</AlertDescription>
          </Alert>
        ) : null}

        <div className='mt-6 flex justify-end gap-3'>
          <Button
            disabled={submitting}
            onClick={() => void navigate('/inspection/records')}
            type='button'
            variant='outline'
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={submitting} type='submit'>
            {submitting
              ? t('inspection.form.submitting')
              : t('inspection.form.submit')}
          </Button>
        </div>
      </form>
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
