import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  createMaterial,
  errorCode,
  listMaterials,
  updateMaterial,
  type Material,
} from '@/components/procurement/api.js';
import {
  EmptyState,
  ErrorBanner,
  Field,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '@/components/procurement/ui.js';
import { useAsyncData } from '@/components/procurement/use-async-data.js';

export default function ProcurementMaterialsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsyncData(
    () => listMaterials(api),
    [api],
  );
  const [editing, setEditing] = useState<Material | null>(null);
  const [creating, setCreating] = useState(false);
  const materials = data ?? [];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          <Button onClick={() => setCreating(true)} type='button'>
            <Plus aria-hidden='true' />
            {t('procurement.materials.create')}
          </Button>
        }
        description={t('procurement.materials.description')}
        title={t('procurement.materials.title')}
      />
      <ErrorBanner
        message={error ? t('procurement.materials.loadFailed') : null}
      />
      {loading && !data ? (
        <Loading />
      ) : materials.length === 0 ? (
        <EmptyState message={t('procurement.materials.empty')} />
      ) : (
        <Table>
          <THead>
            <TH>{t('procurement.materials.code')}</TH>
            <TH>{t('procurement.materials.name')}</TH>
            <TH>{t('procurement.materials.spec')}</TH>
            <TH>{t('procurement.materials.unit')}</TH>
            <TH className='text-right'>{t('procurement.actions')}</TH>
          </THead>
          <tbody>
            {materials.map((material) => (
              <TR key={material.id}>
                <TD className='font-mono text-xs'>{material.code}</TD>
                <TD>{material.name}</TD>
                <TD className='text-muted-foreground'>
                  {material.spec ?? '—'}
                </TD>
                <TD>{material.unit}</TD>
                <TD className='text-right'>
                  <Button
                    onClick={() => setEditing(material)}
                    size='xs'
                    type='button'
                    variant='outline'
                  >
                    {t('procurement.edit')}
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {creating || editing ? (
        <MaterialFormDialog
          key={editing?.id ?? 'new'}
          material={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function MaterialFormDialog({
  material,
  onClose,
  onSaved,
}: {
  material: Material | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    code: material?.code ?? '',
    name: material?.name ?? '',
    spec: material?.spec ?? '',
    unit: material?.unit ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setSaving(true);
    setFormError(null);
    try {
      if (material) {
        await updateMaterial(api, material.id, form);
      } else {
        await createMaterial(api, form);
      }
      onSaved();
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'MATERIAL_CODE_TAKEN') {
        setFormError(t('procurement.materials.codeTaken'));
      } else if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
        setFormError(t('procurement.forbidden'));
      } else {
        setFormError(t('procurement.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {material
              ? t('procurement.materials.edit')
              : t('procurement.materials.create')}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <ErrorBanner message={formError} />
          <Field label={t('procurement.materials.code')}>
            <Input
              onChange={(event) => {
                const code = event.currentTarget.value;
                setForm((current) => ({ ...current, code }));
              }}
              value={form.code}
            />
          </Field>
          <Field label={t('procurement.materials.name')}>
            <Input
              onChange={(event) => {
                const name = event.currentTarget.value;
                setForm((current) => ({ ...current, name }));
              }}
              value={form.name}
            />
          </Field>
          <Field label={t('procurement.materials.spec')}>
            <Input
              onChange={(event) => {
                const spec = event.currentTarget.value;
                setForm((current) => ({ ...current, spec }));
              }}
              value={form.spec}
            />
          </Field>
          <Field label={t('procurement.materials.unit')}>
            <Input
              onChange={(event) => {
                const unit = event.currentTarget.value;
                setForm((current) => ({ ...current, unit }));
              }}
              value={form.unit}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              void save();
            }}
            type='button'
          >
            {saving ? t('procurement.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
