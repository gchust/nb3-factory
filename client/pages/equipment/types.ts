/** The statuses the ledger understands, matching the server's enum exactly. */
export const EQUIPMENT_STATUSES = ['available', 'borrowed'] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export function isEquipmentStatus(
  value: string | null,
): value is EquipmentStatus {
  return EQUIPMENT_STATUSES.some((status) => status === value);
}

/** One device as the API returns it; ids and times are strings. */
export interface Equipment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The body of `GET /api/equipment`: one page of devices and where it sits among all matching records. */
export interface EquipmentList {
  readonly data: Equipment[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** What the create dialog and a row's edit dialog read through `<Outlet context>` from the list behind them. */
export interface EquipmentOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the edit dialog reads through `<Outlet context>` from the list behind it. */
export interface EquipmentEditOutletContext extends EquipmentOutletContext {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (equipment: Equipment) => void;
  /** Called on finding that the record no longer exists. */
  readonly onNotFound: () => void;
}
