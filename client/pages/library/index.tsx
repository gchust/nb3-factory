import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { BookOpen, Plus, Search } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import {
  createMaterial,
  fileContentUrl,
  listCategories,
  listMaterials,
  listSelectableUsers,
  loadMe,
  type MaterialFormValues,
  type MaterialSummaryDto,
  type MeDto,
  type SelectableUserDto,
} from './api.js';
import { Alert, Badge } from './components.js';
import { MaterialFormDialog } from './material-form.js';

export default function LibraryListPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();

  const [me, setMe] = useState<MeDto | null>(null);
  const [materials, setMaterials] = useState<readonly MaterialSummaryDto[]>([]);
  const [categories, setCategories] = useState<readonly string[]>([]);
  const [users, setUsers] = useState<readonly SelectableUserDto[]>([]);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (query: string, selected: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listMaterials(api, {
          query: query || undefined,
          category: selected || undefined,
        });
        setMaterials(rows);
      } catch {
        setError(t('library.error.generic'));
      } finally {
        setLoading(false);
      }
    },
    [api, t],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await listMaterials(api);
        if (active) setMaterials(rows);
      } catch {
        if (active) setError(t('library.error.generic'));
      } finally {
        if (active) setLoading(false);
      }
      try {
        const [profile, cats] = await Promise.all([
          loadMe(api),
          listCategories(api),
        ]);
        if (!active) return;
        setMe(profile);
        setCategories(cats);
        if (profile.isAdmin) {
          const list = await listSelectableUsers(api);
          if (active) setUsers(list);
        }
      } catch {
        if (active) setMe(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, t]);

  const submitSearch = (event: FormEvent): void => {
    event.preventDefault();
    setApplied(search);
    void load(search, category);
  };

  const changeCategory = (value: string): void => {
    setCategory(value);
    void load(applied, value);
  };

  const handleCreate = async (values: MaterialFormValues): Promise<void> => {
    const created = await createMaterial(api, values);
    void navigate(`/library/${created.id}`);
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          me?.isAdmin ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('library.create')}
            </Button>
          ) : null
        }
        description={t('library.description')}
        title={t('library.title')}
      />

      <form
        className='flex flex-wrap items-center gap-2'
        onSubmit={submitSearch}
      >
        <div className='relative min-w-56 flex-1'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='pl-8'
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('library.searchPlaceholder')}
            value={search}
          />
        </div>
        <select
          className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          onChange={(event) => changeCategory(event.target.value)}
          value={category}
        >
          <option value=''>{t('library.allCategories')}</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <Button type='submit' variant='outline'>
          {t('library.search')}
        </Button>
      </form>

      {error ? <Alert tone='error'>{error}</Alert> : null}

      {loading ? (
        <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      ) : materials.length === 0 ? (
        <div className='space-y-2 rounded-lg border border-border p-8 text-center'>
          <BookOpen className='mx-auto size-6 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>{t('library.empty')}</p>
        </div>
      ) : (
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {materials.map((material) => (
            <li key={material.id}>
              <Link
                className='group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-primary/50'
                to={`/library/${material.id}`}
              >
                <div className='aspect-[16/9] w-full overflow-hidden bg-muted'>
                  {material.coverFileId ? (
                    <img
                      alt={material.title}
                      className='size-full object-cover transition-transform group-hover:scale-105'
                      src={fileContentUrl(material.coverFileId)}
                    />
                  ) : (
                    <div className='grid size-full place-items-center text-muted-foreground'>
                      <BookOpen className='size-6' />
                    </div>
                  )}
                </div>
                <div className='flex flex-1 flex-col gap-2 p-4'>
                  <div className='flex items-start justify-between gap-2'>
                    <h2 className='font-heading line-clamp-1 font-medium'>
                      {material.title}
                    </h2>
                    <Badge
                      tone={material.visibility === 'all' ? 'muted' : 'warning'}
                    >
                      {t(`library.visibility.${material.visibility}`)}
                    </Badge>
                  </div>
                  <p className='line-clamp-2 flex-1 text-sm text-muted-foreground'>
                    {material.summary || t('library.summaryEmpty')}
                  </p>
                  <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    {material.category ? (
                      <Badge>{material.category}</Badge>
                    ) : null}
                    <span>
                      {material.owner
                        ? t('library.ownerLabel', { name: material.owner })
                        : ''}
                    </span>
                    <span className='ml-auto'>
                      {material.borrowable
                        ? t('library.availability', {
                            available: material.availableCopies,
                            total: material.totalCopies,
                          })
                        : t('library.notBorrowable')}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className='rounded-lg border border-border bg-muted/30 p-4 text-sm'>
        <summary className='cursor-pointer font-medium'>
          {t('library.trial.title')}
        </summary>
        <div className='mt-2 space-y-1 text-muted-foreground'>
          <p>{t('library.trial.admin')}</p>
          <p>{t('library.trial.member')}</p>
          <p>{t('library.trial.hint')}</p>
        </div>
      </details>

      {creating ? (
        <MaterialFormDialog
          initial={null}
          onClose={() => setCreating(false)}
          onSubmit={handleCreate}
          users={users}
        />
      ) : null}
    </PageContainer>
  );
}
