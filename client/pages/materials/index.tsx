import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PackagePlus } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DataState } from '@/components/repair/data-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorKey, formatMoney, repairApi } from '@/lib/repair-api';
import { useApiData, useRepairSession } from '@/lib/use-repair';

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const session = useRepairSession();
  const materials = useApiData('repair/materials', (api_) =>
    repairApi.materials(api_),
  );
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const canStockIn = session.data?.capabilities.stockIn ?? false;

  const stockIn = async (
    event: FormEvent,
    materialId: number,
  ): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await repairApi.stockIn(api, materialId, {
        quantity: Number(quantities[materialId] ?? 0),
      });
      setQuantities((current) => ({ ...current, [materialId]: '' }));
      materials.reload();
    } catch (cause) {
      const mapped = errorKey(cause);
      setError(t(mapped.key, { defaultValue: mapped.fallback }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.materials.title', { defaultValue: 'Material ledger' })}
        description={t('repair.materials.description', {
          defaultValue:
            'Stock is reduced when a ticket consumes a material and restored when an unused draw is returned.',
        })}
      />

      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}

      <DataState
        loading={materials.loading}
        error={materials.error}
        empty={materials.data?.rows.length === 0}
        onRetry={materials.reload}
      >
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('repair.materials.code', { defaultValue: 'Code' })}
                </TableHead>
                <TableHead>
                  {t('repair.materials.name', { defaultValue: 'Material' })}
                </TableHead>
                <TableHead>
                  {t('repair.materials.unit', { defaultValue: 'Unit' })}
                </TableHead>
                <TableHead>
                  {t('repair.materials.price', { defaultValue: 'Unit price' })}
                </TableHead>
                <TableHead>
                  {t('repair.materials.stock', { defaultValue: 'Stock' })}
                </TableHead>
                <TableHead>
                  {t('repair.materials.safety', {
                    defaultValue: 'Safety stock',
                  })}
                </TableHead>
                {canStockIn ? (
                  <TableHead>
                    {t('repair.materials.restock', {
                      defaultValue: 'Stock in',
                    })}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(materials.data?.rows ?? []).map((material) => (
                <TableRow key={material.id} data-testid='material-row'>
                  <TableCell className='font-mono text-xs'>
                    {material.code}
                  </TableCell>
                  <TableCell>{material.name}</TableCell>
                  <TableCell>{material.unit}</TableCell>
                  <TableCell className='tabular-nums'>
                    {formatMoney(material.unitPrice)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    <span className='flex items-center gap-2'>
                      {material.stock}
                      {material.lowStock ? (
                        <Badge variant='destructive'>
                          {t('repair.materials.low', { defaultValue: 'Low' })}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {material.safetyStock}
                  </TableCell>
                  {canStockIn ? (
                    <TableCell>
                      <form
                        className='flex items-center gap-2'
                        onSubmit={(event) => void stockIn(event, material.id)}
                      >
                        <Input
                          className='w-24'
                          type='number'
                          min={0.01}
                          step='0.01'
                          aria-label={t('repair.materials.quantity', {
                            defaultValue: 'Quantity',
                          })}
                          value={quantities[material.id] ?? ''}
                          onChange={(event) => {
                            // Capture before the updater runs: React clears `currentTarget` after the handler.
                            const value = event.currentTarget.value;
                            setQuantities((current) => ({
                              ...current,
                              [material.id]: value,
                            }));
                          }}
                        />
                        <Button
                          type='submit'
                          size='sm'
                          variant='outline'
                          disabled={busy}
                        >
                          <PackagePlus aria-hidden='true' />
                          {t('repair.materials.stockIn', {
                            defaultValue: 'Stock in',
                          })}
                        </Button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('repair.materials.rules', { defaultValue: 'Rules' })}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-1 text-sm text-muted-foreground'>
          <p>
            {t('repair.materials.ruleNegative', {
              defaultValue:
                'A draw that would make the stock negative is refused.',
            })}
          </p>
          <p>
            {t('repair.materials.ruleReturn', {
              defaultValue:
                'Returning an unused draw restores the stock once; repeating the return changes nothing.',
            })}
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
