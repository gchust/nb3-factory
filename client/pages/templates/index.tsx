import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
  useAsync,
} from '@/components/inspection/api.js';
import type { InspectionTemplate } from '@/components/inspection/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DraftItem {
  readonly key: string;
  readonly title: string;
  readonly standard: string;
}

let draftItemCounter = 0;
function newDraftItem(): DraftItem {
  draftItemCounter += 1;
  return { key: `item-${draftItemCounter}`, title: '', standard: '' };
}

export default function TemplatesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const templates = useAsync('templates', listTemplates);
  const [editor, setEditor] = useState<
    InspectionTemplate | 'new' | undefined
  >();
  const [error, setError] = useState('');

  async function handleDelete(template: InspectionTemplate): Promise<void> {
    setError('');
    if (
      !window.confirm(t('templates.confirmDelete', { name: template.name }))
    ) {
      return;
    }
    try {
      await deleteTemplate(api, template.id);
      templates.reload();
    } catch (cause) {
      setError(messageOf(cause, t('templates.saveFailed')));
    }
  }

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('templates.title')}
        description={t('templates.description')}
        actions={
          <Button onClick={() => setEditor('new')}>
            <Plus className='size-4' />
            {t('templates.create')}
          </Button>
        }
      />
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {templates.loading ? (
        <Loading label={t('status.loading')} />
      ) : templates.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('templates.loadFailed')}
        </p>
      ) : (
        <div className='grid gap-4'>
          {(templates.data ?? []).map((template) => (
            <Card key={template.id}>
              <CardHeader className='flex flex-row items-start justify-between space-y-0'>
                <div>
                  <CardTitle>{template.name}</CardTitle>
                  {template.description ? (
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {template.description}
                    </p>
                  ) : null}
                </div>
                <span className='flex gap-1'>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => setEditor(template)}
                  >
                    <Pencil className='size-4' />
                    {t('templates.edit')}
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => void handleDelete(template)}
                  >
                    <Trash2 className='size-4' />
                    {t('templates.delete')}
                  </Button>
                </span>
              </CardHeader>
              <CardContent>
                <ol className='divide-y rounded-lg border text-sm'>
                  {template.items.map((item) => (
                    <li key={item.id} className='px-3 py-2'>
                      <p className='font-medium'>
                        {item.seq}. {item.title}
                      </p>
                      <p className='text-muted-foreground'>{item.standard}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editor ? (
        <TemplateEditor
          template={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            templates.reload();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function TemplateEditor(props: {
  readonly template: InspectionTemplate | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { template } = props;
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [items, setItems] = useState<DraftItem[]>(
    template?.items.map((item) => ({
      key: `template-${item.id}`,
      title: item.title,
      standard: item.standard,
    })) ?? [{ key: 'new-0', title: '', standard: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function updateItem(
    index: number,
    key: keyof DraftItem,
    value: string,
  ): void {
    setItems((previous) =>
      previous.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const payload = {
        name,
        description,
        items: items.map((item) => ({
          title: item.title,
          standard: item.standard,
        })),
      };
      if (template) {
        await updateTemplate(api, template.id, payload);
      } else {
        await createTemplate(api, payload);
      }
      props.onSaved();
    } catch (cause) {
      setError(messageOf(cause, t('templates.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className='max-h-[85vh] max-w-2xl overflow-auto'>
        <DialogHeader>
          <DialogTitle>
            {template ? t('templates.editTitle') : t('templates.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label>{t('templates.name')}</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label>{t('templates.descriptionLabel')}</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('templates.items')}</Label>
            {items.map((item, index) => (
              <div key={item.key} className='flex items-start gap-2'>
                <Input
                  value={item.title}
                  placeholder={t('templates.itemTitle')}
                  onChange={(event) =>
                    updateItem(index, 'title', event.target.value)
                  }
                />
                <Input
                  value={item.standard}
                  placeholder={t('templates.itemStandard')}
                  onChange={(event) =>
                    updateItem(index, 'standard', event.target.value)
                  }
                />
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={t('templates.removeItem')}
                  onClick={() =>
                    setItems((previous) =>
                      previous.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                >
                  <X className='size-4' />
                </Button>
              </div>
            ))}
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                setItems((previous) => [...previous, newDraftItem()])
              }
            >
              <Plus className='size-4' />
              {t('templates.addItem')}
            </Button>
          </div>
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  const payload = cause as {
    payload?: { message?: unknown };
    message?: unknown;
  };
  if (typeof payload?.payload?.message === 'string') {
    return payload.payload.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
