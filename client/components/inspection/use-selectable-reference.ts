import { useEffect, useState } from 'react';

import { useInspectionApi } from './api.js';
import type { Device, Plan } from './types.js';

export interface SelectableReference {
  readonly devices: readonly Device[];
  readonly plans: readonly Plan[];
  readonly loading: boolean;
}

/** Load the device and plan catalogs used by the record form and filters. */
export function useSelectableReference(): SelectableReference {
  const api = useInspectionApi();
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.devices(), api.plans()])
      .then(([deviceList, planList]) => {
        if (!active) return;
        setDevices(deviceList);
        setPlans(planList);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return { devices, plans, loading };
}
