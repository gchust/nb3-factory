import { useTranslation } from '@nocobase/i18n/client';
import { Library, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
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

import { useTrainingQuery, useTrainingViewer } from './client.js';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusFor,
} from './components.js';
import { COURSE_STATUS_KEYS, type CourseSummary } from './types.js';

export default function TrainingCatalogPage(): ReactElement {
  const { t } = useTranslation();
  const viewer = useTrainingViewer();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const categories = useTrainingQuery<string[]>('training/categories');
  const courses = useTrainingQuery<CourseSummary[]>('training/catalog', {
    search: search.trim() ? search.trim() : undefined,
    category: category === 'all' ? undefined : category,
  });

  const categoryItems = [
    { value: 'all', label: t('training.catalog.allCategories') },
    ...(categories.data ?? []).map((item) => ({ value: item, label: item })),
  ];

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('training.catalog.title')}
        description={t('training.catalog.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to='/training/my-learning' />}
          >
            <Library className='size-4' aria-hidden />
            {t('training.nav.myLearning')}
          </Button>
        }
      />

      <div className='flex flex-col gap-4 rounded-xl border border-border bg-card p-5 md:flex-row md:items-end'>
        <div className='flex-1 space-y-2'>
          <Label htmlFor='catalog-search'>{t('training.catalog.search')}</Label>
          <div className='relative'>
            <Search
              className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
              aria-hidden
            />
            <Input
              id='catalog-search'
              className='pl-8'
              value={search}
              placeholder={t('training.catalog.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className='space-y-2'>
          <Label>{t('training.catalog.category')}</Label>
          <Select
            value={category}
            items={categoryItems}
            onValueChange={(value) =>
              setCategory(value ? String(value) : 'all')
            }
          >
            <SelectTrigger className='w-full md:w-48'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant='outline'
          onClick={() => {
            setSearch('');
            setCategory('all');
          }}
        >
          {t('training.catalog.reset')}
        </Button>
      </div>

      {viewer.error ? (
        <ErrorBlock message={viewer.error} onRetry={viewer.reload} />
      ) : null}

      {courses.loading ? <LoadingBlock /> : null}
      {courses.error ? (
        <ErrorBlock message={courses.error} onRetry={courses.reload} />
      ) : null}
      {!courses.loading &&
      !courses.error &&
      (courses.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('training.catalog.empty')} />
      ) : null}

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {(courses.data ?? []).map((course) => (
          <Card key={course.id}>
            <CardHeader className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <span className='font-mono text-xs text-muted-foreground'>
                  {course.code}
                </span>
                <StatusFor
                  labelKey={COURSE_STATUS_KEYS[course.status]}
                  tone={course.status === 'published' ? 'success' : 'muted'}
                />
              </div>
              <CardTitle className='text-base'>{course.title}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 text-sm text-muted-foreground'>
              <p className='line-clamp-3'>{course.description ?? '—'}</p>
              <dl className='grid grid-cols-2 gap-2 text-xs'>
                <div>
                  <dt>{t('training.catalog.category')}</dt>
                  <dd className='text-foreground'>{course.category}</dd>
                </div>
                <div>
                  <dt>{t('training.catalog.level')}</dt>
                  <dd className='text-foreground'>{course.level}</dd>
                </div>
                <div>
                  <dt>{t('training.catalog.sessionCount')}</dt>
                  <dd className='text-foreground'>{course.sessionCount}</dd>
                </div>
                <div>
                  <dt>{t('training.catalog.assignmentCount')}</dt>
                  <dd className='text-foreground'>{course.assignmentCount}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
