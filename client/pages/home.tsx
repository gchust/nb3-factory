import { useTranslation } from '@nocobase/i18n/client';
import {
  BarChart3,
  ClipboardList,
  Package,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/retail-ui';
import { useRetailApi, type RetailAccess } from '@/lib/retail-api';

interface Shortcut {
  readonly to: string;
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useRetailApi();
  const [access, setAccess] = useState<RetailAccess>();

  useEffect(() => {
    let active = true;
    void api
      .access()
      .then((value) => {
        if (active) setAccess(value);
      })
      .catch(() => {
        if (active) setAccess(undefined);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const shortcuts: readonly Shortcut[] = [
    ...(access?.createOrder
      ? [
          {
            to: '/pos',
            title: t('navigation.pos', { defaultValue: 'Checkout' }),
            description: t('retail.home.openPos', {
              defaultValue: 'Ring up a sale and take payment.',
            }),
            icon: <ShoppingCart aria-hidden='true' className='size-5' />,
          },
        ]
      : []),
    ...(access?.viewSales
      ? [
          {
            to: '/sales',
            title: t('navigation.sales', { defaultValue: 'Sales orders' }),
            description: t('retail.home.openSales', {
              defaultValue: 'Review the sales orders you can see.',
            }),
            icon: <ClipboardList aria-hidden='true' className='size-5' />,
          },
        ]
      : []),
    ...(access?.manageProducts
      ? [
          {
            to: '/products',
            title: t('navigation.products', { defaultValue: 'Products' }),
            description: t('retail.home.openProducts', {
              defaultValue: 'Maintain prices, cost and stock.',
            }),
            icon: <Package aria-hidden='true' className='size-5' />,
          },
        ]
      : []),
    ...(access?.registerPurchase
      ? [
          {
            to: '/purchases',
            title: t('navigation.purchases', { defaultValue: 'Stock-in' }),
            description: t('retail.home.openPurchases', {
              defaultValue: 'Register incoming stock from suppliers.',
            }),
            icon: <Truck aria-hidden='true' className='size-5' />,
          },
        ]
      : []),
    ...(access?.viewReports
      ? [
          {
            to: '/reports',
            title: t('navigation.reports', {
              defaultValue: 'Daily settlement',
            }),
            description: t('retail.home.openReports', {
              defaultValue: 'See the day’s totals and ranking.',
            }),
            icon: <BarChart3 aria-hidden='true' className='size-5' />,
          },
        ]
      : []),
  ];

  return (
    <section className='mx-auto w-full max-w-6xl space-y-8 px-6 py-10'>
      <PageHeader
        description={t('home.description', {
          defaultValue: 'Run the shop: checkout, stock and daily settlement.',
        })}
        title={t('home.title', { defaultValue: 'Store retail management' })}
      />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {shortcuts.map((shortcut) => (
          <Link
            className='group rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-colors hover:bg-muted'
            key={shortcut.to}
            to={shortcut.to}
          >
            <div className='flex items-center gap-3'>
              <span className='text-muted-foreground group-hover:text-foreground'>
                {shortcut.icon}
              </span>
              <span className='font-medium'>{shortcut.title}</span>
            </div>
            <p className='mt-3 text-sm text-muted-foreground'>
              {shortcut.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
