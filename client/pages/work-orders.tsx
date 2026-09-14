import { useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { Link } from 'react-router';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AsyncSection } from '@/components/production/async-section';
import { WorkOrderStatusBadge } from '@/components/production/status-badge';
import { WorkOrderFormDialog } from '@/components/production/work-order-form';
import {
  productionApi,
  type ActorInfo,
  type Product,
  type Team,
  type WorkOrderSummary,
} from '@/lib/production-api';
import { useAsync } from '@/lib/use-async';

interface WorkOrdersData {
  actor: ActorInfo;
  workOrders: WorkOrderSummary[];
  products: Product[];
  teams: Team[];
}

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [createOpen, setCreateOpen] = useState(false);

  const state = useAsync<WorkOrdersData>(async () => {
    const [actor, workOrders, products, teams] = await Promise.all([
      productionApi.me(api),
      productionApi.workOrders(api),
      productionApi.products(api),
      productionApi.teams(api),
    ]);
    return { actor, workOrders, products, teams };
  }, 'work-orders');

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6'>
      <header className='flex flex-wrap items-center justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('production.workOrders.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('production.workOrders.subtitle')}
          </p>
        </div>
        {state.data?.actor.capabilities.canManageWorkOrders ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t('production.workOrders.new')}
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
            {state.data && state.data.workOrders.length === 0 ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                {t('production.workOrders.empty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('production.workOrders.code')}</TableHead>
                    <TableHead>{t('production.workOrders.product')}</TableHead>
                    <TableHead>{t('production.workOrders.team')}</TableHead>
                    <TableHead className='text-right'>
                      {t('production.workOrders.plannedQuantity')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('production.workOrders.reported')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('production.workOrders.qualified')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('production.workOrders.defect')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('production.workOrders.completion')}
                    </TableHead>
                    <TableHead>{t('production.workOrders.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data?.workOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          className='font-medium text-primary underline-offset-4 hover:underline'
                          to={`/work-orders/${order.id}`}
                        >
                          {order.code}
                        </Link>
                      </TableCell>
                      <TableCell>{order.productName}</TableCell>
                      <TableCell>{order.teamName}</TableCell>
                      <TableCell className='text-right'>
                        {order.plannedQuantity}
                      </TableCell>
                      <TableCell className='text-right'>
                        {order.reportedQuantity}
                      </TableCell>
                      <TableCell className='text-right'>
                        {order.qualifiedQuantity}
                      </TableCell>
                      <TableCell className='text-right'>
                        {order.defectQuantity}
                      </TableCell>
                      <TableCell className='text-right'>
                        {order.completion}%
                      </TableCell>
                      <TableCell>
                        <WorkOrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </AsyncSection>

      {state.data ? (
        <WorkOrderFormDialog
          api={api}
          onCreated={() => void state.reload()}
          onOpenChange={setCreateOpen}
          open={createOpen}
          products={state.data.products}
          teams={state.data.teams}
        />
      ) : null}
    </section>
  );
}
