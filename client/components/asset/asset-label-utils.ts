/** Translation keys for asset types, keyed by the stored value. */
export const ASSET_TYPE_KEYS: Readonly<Record<string, string>> = {
  computer: 'assets.types.computer',
  monitor: 'assets.types.monitor',
  phone: 'assets.types.phone',
  other: 'assets.types.other',
};

/** Translation keys for asset statuses, keyed by the stored value. */
export const ASSET_STATUS_KEYS: Readonly<Record<string, string>> = {
  available: 'assets.statuses.available',
  inUse: 'assets.statuses.inUse',
  maintenance: 'assets.statuses.maintenance',
  retired: 'assets.statuses.retired',
};

/** Translation keys for claim record statuses, keyed by the stored value. */
export const RECORD_STATUS_KEYS: Readonly<Record<string, string>> = {
  claimed: 'assets.recordStatuses.claimed',
  returned: 'assets.recordStatuses.returned',
};

export function assetTypeKey(type: string): string {
  return ASSET_TYPE_KEYS[type] ?? 'assets.types.other';
}

export function assetStatusKey(status: string): string {
  return ASSET_STATUS_KEYS[status] ?? 'assets.statuses.available';
}

export function recordStatusKey(status: string): string {
  return RECORD_STATUS_KEYS[status] ?? 'assets.recordStatuses.claimed';
}

/** Formats an ISO date-time for display in the user's locale. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Converts an ISO date-time to the `yyyy-mm-dd` value of a date input. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
