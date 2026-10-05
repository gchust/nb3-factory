/**
 * Repair knowledge — the articles an engineer reads while working.
 *
 * A supervisor publishes and edits; an engineer only ever sees published
 * articles, which is a server rule the list applies rather than a client-side
 * filter. Reading one opens the full body in place.
 */
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useState,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { EyeIcon, PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type ServiceList } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  ServicePage,
} from './parts.js';
import type { KnowledgeView, MeView } from './types.js';

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<KnowledgeView | null>(null);
  const [creating, setCreating] = useState(false);
  const [reading, setReading] = useState<KnowledgeView | null>(null);

  const me = useLoad(useCallback(() => api.get<MeView>('/me'), [api]));
  const canMaintain = me.data?.roles.includes('manager') ?? false;

  const state = useLoad(
    useCallback(() => {
      const published =
        canMaintain && visibility !== 'all'
          ? visibility === 'published'
          : undefined;
      return api.get<ServiceList<KnowledgeView>>('/knowledge', {
        search: query,
        page,
        pageSize: 20,
        ...(published === undefined ? {} : { published }),
      });
    }, [api, query, visibility, page, canMaintain]),
  );

  return (
    <ServicePage
      title={t('service.knowledge.title')}
      description={t('service.knowledge.description')}
      actions={
        canMaintain ? (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className='size-4' />
            {t('service.knowledge.create')}
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.common.search')}
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-2'>
          <div className='relative'>
            <SearchIcon className='pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='ps-8'
              value={search}
              placeholder={t('service.knowledge.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setQuery(search);
                }
              }}
            />
          </div>
          {canMaintain ? (
            <div className='max-w-xs space-y-1.5'>
              <Label htmlFor='knowledge-visibility'>
                {t('service.knowledge.visibility')}
              </Label>
              <Select
                value={visibility}
                onValueChange={(value) => {
                  setPage(1);
                  setVisibility(String(value));
                }}
              >
                <SelectTrigger id='knowledge-visibility' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>{t('service.common.all')}</SelectItem>
                  <SelectItem value='published'>
                    {t('service.knowledge.published')}
                  </SelectItem>
                  <SelectItem value='draft'>
                    {t('service.knowledge.draft')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}
      {state.data ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            {state.data.rows.length === 0 ? (
              <EmptyState message={t('service.knowledge.empty')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('service.knowledge.titleColumn')}
                      </TableHead>
                      <TableHead>{t('service.knowledge.state')}</TableHead>
                      <TableHead>{t('service.knowledge.updatedAt')}</TableHead>
                      <TableHead className='text-right'>
                        {t('service.common.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className='font-medium'>
                          {row.title}
                        </TableCell>
                        <TableCell>
                          {row.published ? (
                            <Badge variant='secondary'>
                              {t('service.knowledge.published')}
                            </Badge>
                          ) : (
                            <Badge variant='outline'>
                              {t('service.knowledge.draft')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDateTime(row.updatedAt)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-1'>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => setReading(row)}
                            >
                              <EyeIcon className='size-3.5' />
                              {t('service.common.read')}
                            </Button>
                            {canMaintain ? (
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('service.common.edit')}
                                onClick={() => setEditing(row)}
                              >
                                <PencilIcon className='size-3.5' />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPage={setPage}
            />
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={reading !== null} onOpenChange={() => setReading(null)}>
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>
              {formatDateTime(reading?.updatedAt)}
            </DialogDescription>
          </DialogHeader>
          <div className='max-h-96 overflow-y-auto whitespace-pre-wrap text-sm'>
            {reading?.body}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setReading(null)}>
              {t('service.common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KnowledgeDialog
        key={editing ? `edit-${editing.id}` : 'create'}
        open={creating || editing !== null}
        article={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          state.reload();
        }}
      />
    </ServicePage>
  );
}

function KnowledgeDialog({
  article,
  onOpenChange,
  onSaved,
  open,
}: {
  readonly article: KnowledgeView | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(article?.published !== false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      title: formText(data, 'title'),
      body: formText(data, 'body'),
      published,
    };
    setBusy(true);
    try {
      if (article) {
        await api.patch(`/knowledge/${article.id}`, payload);
      } else {
        await api.post('/knowledge', payload);
      }
      onSaved();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {article
                ? t('service.knowledge.edit')
                : t('service.knowledge.create')}
            </DialogTitle>
            <DialogDescription>
              {t('service.knowledge.dialogHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='knowledge-title'>
                {t('service.knowledge.titleColumn')}
              </FieldLabel>
              <Input
                id='knowledge-title'
                name='title'
                required
                defaultValue={article?.title ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='knowledge-body'>
                {t('service.knowledge.body')}
              </FieldLabel>
              <Textarea
                id='knowledge-body'
                name='body'
                rows={10}
                required
                defaultValue={article?.body ?? ''}
              />
            </Field>
            <Field>
              <div className='flex items-center gap-2'>
                <input
                  id='knowledge-published'
                  type='checkbox'
                  checked={published}
                  onChange={(event) => setPublished(event.target.checked)}
                />
                <Label htmlFor='knowledge-published'>
                  {t('service.knowledge.published')}
                </Label>
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
