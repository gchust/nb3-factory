import { useTranslation } from '@nocobase/i18n/client';
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Loading } from '#components/loading';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';

import {
  errorMessage,
  type LibraryActor,
  type LibraryMaterial,
} from './api.js';
import {
  MaterialBadges,
  MaterialFormDialog,
  ShareDialog,
} from './components.js';
import { useLibraryClient, useSessionExpiredRedirect } from './use-library.js';

function MaterialCard({
  material,
  onEdit,
  onShare,
  onDelete,
}: {
  readonly material: LibraryMaterial;
  readonly onEdit: () => void;
  readonly onShare: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const hasMenu = material.writable || material.canShare;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link
            to={`/materials/${material.id}`}
            className='text-foreground hover:underline'
          >
            {material.title}
          </Link>
        </CardTitle>
        {hasMenu ? (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('library.actions.menu')}
                className='grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
              >
                <MoreHorizontalIcon className='size-4' />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {material.writable ? (
                  <DropdownMenuItem onClick={onEdit}>
                    {t('library.actions.edit')}
                  </DropdownMenuItem>
                ) : null}
                {material.canShare ? (
                  <DropdownMenuItem onClick={onShare}>
                    {t('library.actions.share')}
                  </DropdownMenuItem>
                ) : null}
                {material.writable ? (
                  <DropdownMenuItem variant='destructive' onClick={onDelete}>
                    {t('library.actions.delete')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        ) : null}
        <div className='flex flex-col gap-2'>
          <MaterialBadges material={material} />
          <p className='text-xs text-muted-foreground'>
            {t('library.owner')}: {material.ownerName || material.ownerId}
          </p>
        </div>
      </CardHeader>
      {material.body ? (
        <CardContent>
          <p className='line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground'>
            {material.body}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useLibraryClient();
  const [actor, setActor] = useState<LibraryActor | null>(null);
  const [materials, setMaterials] = useState<LibraryMaterial[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMaterial, setFormMaterial] = useState<LibraryMaterial | null>(
    null,
  );
  const [shareMaterial, setShareMaterial] = useState<LibraryMaterial | null>(
    null,
  );
  const [deleting, setDeleting] = useState<LibraryMaterial | null>(null);

  useSessionExpiredRedirect(error);

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.actor(), client.materials()])
      .then(([nextActor, nextMaterials]) => {
        if (cancelled) return;
        setActor(nextActor);
        setMaterials(nextMaterials);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause);
      });
    return () => {
      cancelled = true;
    };
  }, [client, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const remove = async (material: LibraryMaterial): Promise<void> => {
    setDeleting(null);
    try {
      await client.deleteMaterial(material.id);
      reload();
    } catch (cause) {
      setError(cause);
    }
  };

  const mayCreate = actor?.isAdmin === true || actor?.role === 'editor';
  const loading = materials === null && error === null;

  return (
    <PageContainer>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          mayCreate ? (
            <Button
              type='button'
              onClick={() => {
                setFormMaterial(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon data-icon='inline-start' />
              {t('library.create')}
            </Button>
          ) : null
        }
      />
      {loading ? <Loading /> : null}
      {error !== null && materials === null ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription>
            {t('library.error.description')} {errorMessage(error)}
          </AlertDescription>
        </Alert>
      ) : null}
      {materials !== null && materials.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('library.list.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('library.list.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {materials !== null && materials.length > 0 ? (
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              onEdit={() => {
                setFormMaterial(material);
                setFormOpen(true);
              }}
              onShare={() => setShareMaterial(material)}
              onDelete={() => setDeleting(material)}
            />
          ))}
        </div>
      ) : null}

      {formOpen ? (
        <MaterialFormDialog
          material={formMaterial}
          onOpenChange={(open) => {
            if (!open) setFormOpen(false);
          }}
          onSaved={reload}
        />
      ) : null}
      {shareMaterial ? (
        <ShareDialog
          open
          material={shareMaterial}
          onOpenChange={(open) => {
            if (!open) setShareMaterial(null);
          }}
          onChanged={reload}
        />
      ) : null}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('library.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void remove(deleting);
              }}
            >
              {t('library.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
