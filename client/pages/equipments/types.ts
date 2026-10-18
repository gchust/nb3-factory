import type { EquipmentStatus } from './api.js';

/** What child routes get from the list through the outlet: a way to refresh it after a save. */
export interface EquipmentListOutletContext {
  reload(): void;
}

export function statusTone(status: EquipmentStatus): 'success' | 'warning' {
  return status === 'available' ? 'success' : 'warning';
}
