import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon, PencilIcon, UploadIcon } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { FilePreviewField } from '@/extensions/nocobase-file-component-ui';

import {
  describeError,
  toFileRecords,
  useIdentity,
  useResource,
  useServiceApi,
  type AttachmentRecord,
  type Row,
} from '../../service/api.js';
import { asText, joinTags } from '../../service/format.js';
import {
  FieldRow,
  InfoGrid,
  QueryState,
  SectionCard,
  StatusBadge,
} from '../../service/ui.js';

interface ArticleDetail extends Row {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly category: string;
  readonly attachments: readonly AttachmentRecord[];
}

/** One knowledge article, with an in-app preview for its Office/PDF attachments. */
export default function KnowledgeDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const identity = useIdentity();
  const params = useParams<{ articleId: string }>();
  const articleId = Number(params.articleId);
  const article = useResource(`service:knowledge:${articleId}`, () =>
    api.getKnowledge(articleId),
  );
  const detail = article.data as unknown as ArticleDetail | undefined;
  const canWrite = identity.data?.manageKnowledge === true;
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  const upload = async (file: File): Promise<void> => {
    try {
      await api.uploadAttachment(file, { knowledgeArticleId: articleId });
      toast.add({ type: 'success', title: t('service.common.uploaded') });
      article.reload();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.uploadFailed'),
        description: describeError(error),
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const togglePublish = async (): Promise<void> => {
    if (!detail) return;
    try {
      await api.publishKnowledge(articleId, detail.status !== 'published');
      toast.add({
        type: 'success',
        title: t('service.knowledge.publishChanged'),
      });
      article.reload();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    }
  };

  return (
    <PageContainer>
      <Button
        variant='ghost'
        size='sm'
        render={<Link to='/service/knowledge' />}
      >
        <ArrowLeftIcon />
        {t('service.knowledge.backToList')}
      </Button>

      <QueryState
        loading={article.loading}
        error={article.error}
        onRetry={article.reload}
      >
        {detail ? (
          <>
            <PageHeader
              title={
                <span className='flex flex-wrap items-center gap-3'>
                  {detail.title}
                </span>
              }
              description={asText(detail.summary)}
              actions={
                canWrite ? (
                  <span className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setEditing(true)}
                    >
                      <PencilIcon />
                      {t('service.common.edit')}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => void togglePublish()}
                    >
                      {detail.status === 'published'
                        ? t('service.knowledge.unpublish')
                        : t('service.knowledge.publish')}
                    </Button>
                  </span>
                ) : undefined
              }
            />

            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge kind='article' value={detail.status} />
              <span className='text-sm text-muted-foreground'>
                {t(`service.knowledge.category.${asText(detail.category)}`, {
                  defaultValue: asText(detail.category),
                })}
              </span>
            </div>

            <SectionCard title={t('service.knowledge.content')}>
              <p className='text-sm whitespace-pre-wrap'>
                {asText(detail.content) || '—'}
              </p>
            </SectionCard>

            <SectionCard title={t('service.knowledge.overview')}>
              <InfoGrid>
                <FieldRow label={t('service.knowledge.author')}>
                  {asText(detail.authorName) || '—'}
                </FieldRow>
                <FieldRow label={t('service.knowledge.tags')}>
                  {joinTags(detail.tags) || '—'}
                </FieldRow>
                <FieldRow label={t('service.knowledge.publishedAt')}>
                  {asText(detail.publishedAt).slice(0, 10) || '—'}
                </FieldRow>
                <FieldRow label={t('service.knowledge.viewCount')}>
                  {asText(detail.viewCount)}
                </FieldRow>
              </InfoGrid>
            </SectionCard>

            <SectionCard
              title={t('service.knowledge.attachments')}
              description={t('service.knowledge.attachmentsDescription')}
              actions={
                canWrite ? (
                  <div>
                    <input
                      ref={inputRef}
                      type='file'
                      className='hidden'
                      accept='.png,.jpg,.jpeg,.pdf,.docx,.xlsx,.pptx'
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(file);
                      }}
                    />
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => inputRef.current?.click()}
                    >
                      <UploadIcon />
                      {t('service.common.upload')}
                    </Button>
                  </div>
                ) : undefined
              }
            >
              <FilePreviewField
                files={toFileRecords(detail.attachments)}
                showFilenames
                emptyState={
                  <p className='text-sm text-muted-foreground'>
                    {t('service.common.empty')}
                  </p>
                }
              />
            </SectionCard>

            {editing ? (
              <EditArticleDialog
                article={detail}
                open
                onOpenChange={(next) => {
                  if (!next) setEditing(false);
                }}
                onSaved={() => {
                  setEditing(false);
                  article.reload();
                }}
              />
            ) : null}
          </>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}

interface EditArticleDialogProps {
  readonly article: ArticleDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}

function EditArticleDialog({
  article,
  open,
  onOpenChange,
  onSaved,
}: EditArticleDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [title, setTitle] = useState(article.title);
  const [summary, setSummary] = useState(() => asText(article.summary));
  const [content, setContent] = useState(() => asText(article.content));
  const [category, setCategory] = useState(() => asText(article.category));
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.updateKnowledge(article.id, {
        title,
        summary,
        content,
        category,
      });
      toast.add({ type: 'success', title: t('service.common.saved') });
      onSaved();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('service.knowledge.edit')}</DialogTitle>
          <DialogDescription>
            {t('service.knowledge.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label htmlFor='edit-title'>
              {t('service.knowledge.articleTitle')}
            </Label>
            <Input
              id='edit-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='edit-category'>
              {t('service.knowledge.categoryLabel')}
            </Label>
            <Input
              id='edit-category'
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='edit-summary'>
              {t('service.knowledge.summary')}
            </Label>
            <Textarea
              id='edit-summary'
              rows={2}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='edit-content'>
              {t('service.knowledge.content')}
            </Label>
            <Textarea
              id='edit-content'
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('service.common.cancel')}
          </Button>
          <Button
            disabled={saving || !title.trim()}
            onClick={() => void submit()}
          >
            {saving ? t('service.common.saving') : t('service.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
