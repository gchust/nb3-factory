import type { ServiceOrder, ServiceOrderShare } from '@/api/service-types';

/**
 * What every section of the order drawer is given.
 *
 * `reload` re-reads the order and everything derived from it — the timeline,
 * the shares, the attachments — and refreshes the list the drawer was opened
 * from, so a write never leaves the page showing the state before it.
 */
export interface OrderSectionProps {
  readonly order: ServiceOrder;
  readonly reload: () => Promise<void>;
}

export interface OrderSharesSectionProps extends OrderSectionProps {
  readonly shares: readonly ServiceOrderShare[];
}
