import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { SalesUser } from '../../lib/sales-api';
import { useSalesApi } from './use-sales-api';

export interface UserSelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly allowEmpty?: boolean;
}

/**
 * A select of the sales users (sales + sales-manager roles) that can own
 * records. Loads the user list once and caches it.
 */
export function UserSelect({
  value,
  onValueChange,
  placeholder,
  allowEmpty = false,
}: UserSelectProps): ReactNode {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [users, setUsers] = useState<SalesUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .listUsers()
      .then((result) => {
        if (!cancelled) setUsers(result);
      })
      .catch(() => {
        // The select degrades to an empty list; the parent form still works.
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <Select
      value={value}
      onValueChange={(value) => onValueChange(value ?? '')}
      // Base UI's SelectValue only renders a label when the Root knows how to
      // stringify the selected value (via `itemToStringLabel` or an `items`
      // map); the labels registered by the popup items are used for typeahead
      // only. Without this, the trigger shows the raw user id (a UUID) instead
      // of the user's name until an item is picked.
      itemToStringLabel={(id) => {
        const user = users.find((candidate) => candidate.id === id);
        return user
          ? `${user.name}${user.email ? ` (${user.email})` : ''}`
          : String(id);
      }}
    >
      <SelectTrigger className='w-full'>
        <SelectValue
          placeholder={
            placeholder ??
            t('sales.users.select', { defaultValue: 'Select a user' })
          }
        />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? (
          <SelectItem value=''>
            {t('sales.users.unassigned', { defaultValue: 'Unassigned' })}
          </SelectItem>
        ) : null}
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            {user.name}
            {user.email ? ` (${user.email})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
