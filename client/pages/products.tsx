import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  apiClientToken,
  useService,
  type ApiClient,
} from '@nocobase/app-client';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AsyncSection } from '@/components/production/async-section';
import {
  productionApi,
  type ActorInfo,
  type Product,
} from '@/lib/production-api';
import { translateError } from '@/lib/production-messages';
import { useAsync } from '@/lib/use-async';

interface ProductsData {
  actor: ActorInfo;
  products: Product[];
}

export default function ProductsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [createOpen, setCreateOpen] = useState(false);

  const state = useAsync<ProductsData>(async () => {
    const [actor, products] = await Promise.all([
      productionApi.me(api),
      productionApi.products(api),
    ]);
    return { actor, products };
  }, 'products');

  return (
    <section className='mx-auto w-full max-w-5xl space-y-6 p-6'>
      <header className='flex flex-wrap items-center justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('production.products.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('production.products.subtitle')}
          </p>
        </div>
        {state.data?.actor.capabilities.canManageWorkOrders ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t('production.products.new')}
          </Button>
        ) : null}
      </header>

      <AsyncSection
        error={state.error}
        onRetry={() => void state.reload()}
        status={state.status}
      >
        <Card>
          <CardContent className='pt-6'>
            {state.data && state.data.products.length === 0 ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                {t('production.common.empty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('production.products.code')}</TableHead>
                    <TableHead>{t('production.products.name')}</TableHead>
                    <TableHead>
                      {t('production.products.specification')}
                    </TableHead>
                    <TableHead>{t('production.products.unit')}</TableHead>
                    <TableHead className='text-right'>
                      {t('production.products.standardMinutes')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data?.products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className='font-medium'>
                        {product.code}
                      </TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{product.specification ?? '-'}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className='text-right'>
                        {product.standardMinutes}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </AsyncSection>

      <ProductFormDialog
        api={api}
        onCreated={() => void state.reload()}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </section>
  );
}

function ProductFormDialog({
  open,
  onOpenChange,
  api,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly api: ApiClient;
  readonly onCreated: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [specification, setSpecification] = useState('');
  const [unit, setUnit] = useState('');
  const [standardMinutes, setStandardMinutes] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    if (!code.trim() || !name.trim() || !(Number(standardMinutes) > 0)) {
      setError(t('production.products.formIncomplete'));
      return;
    }
    setPending(true);
    try {
      await productionApi.createProduct(api, {
        code: code.trim(),
        name: name.trim(),
        specification: specification.trim() || null,
        unit: unit.trim() || undefined,
        standardMinutes: Number(standardMinutes),
      });
      onCreated();
      onOpenChange(false);
      setCode('');
      setName('');
      setSpecification('');
      setUnit('');
      setStandardMinutes('');
    } catch (submitError) {
      setError(translateError(t, submitError));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('production.products.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('production.products.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='product-code'>
              {t('production.products.code')}
            </Label>
            <Input
              id='product-code'
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='product-name'>
              {t('production.products.name')}
            </Label>
            <Input
              id='product-name'
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='product-spec'>
              {t('production.products.specification')}
            </Label>
            <Input
              id='product-spec'
              onChange={(event) => setSpecification(event.target.value)}
              value={specification}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='product-unit'>
                {t('production.products.unit')}
              </Label>
              <Input
                id='product-unit'
                onChange={(event) => setUnit(event.target.value)}
                value={unit}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='product-minutes'>
                {t('production.products.standardMinutes')}
              </Label>
              <Input
                id='product-minutes'
                min='0'
                onChange={(event) => setStandardMinutes(event.target.value)}
                step='0.01'
                type='number'
                value={standardMinutes}
              />
            </div>
          </div>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type='button'
              variant='outline'
            >
              {t('production.common.cancel')}
            </Button>
            <Button disabled={pending} type='submit'>
              {t('production.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
