/**
 * Domain types, role keys and validation rules for the production reporting and quality feature.
 *
 * The pure functions here are the tested core: the routes and the service only move data in and out of
 * them, so quantity rules and the standard-time calculation have a single definition.
 */

export const ADMIN_ROLE: string = 'system-administrator';
export const SUPERVISOR_ROLE: string = 'production-supervisor';
export const TEAM_LEADER_ROLE: string = 'team-leader';
export const INSPECTOR_ROLE: string = 'quality-inspector';

/** Roles a signed-up user may pick for themselves. Administration stays with the built-in administrator. */
export const ASSIGNABLE_ROLES = [
  'production-supervisor',
  'team-leader',
  'quality-inspector',
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const WORK_ORDER_STATUSES = [
  'pending',
  'in_production',
  'completed',
  'closed',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const DEFECT_REASONS = [
  'size_deviation',
  'appearance_defect',
  'material_issue',
  'equipment_failure',
] as const;
export type DefectReason = (typeof DEFECT_REASONS)[number];

export const DEFECT_DISPOSITIONS = ['rework', 'scrap'] as const;
export type DefectDisposition = (typeof DEFECT_DISPOSITIONS)[number];

export interface Actor {
  readonly userId: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly teamId: number | null;
  readonly teamName: string | null;
}

export interface ActorCapabilities {
  readonly isAdministrator: boolean;
  readonly isSupervisor: boolean;
  readonly isTeamLeader: boolean;
  readonly isInspector: boolean;
  readonly canManageWorkOrders: boolean;
  readonly canReport: boolean;
  readonly canManageDefects: boolean;
  readonly canReadAllWorkOrders: boolean;
}

export class ProductionError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ProductionError';
    this.code = code;
    this.status = status;
  }
}

export function isAssignableRole(value: unknown): value is AssignableRole {
  return (
    typeof value === 'string' &&
    (ASSIGNABLE_ROLES as readonly string[]).includes(value)
  );
}

export function actorCapabilities(actor: Actor): ActorCapabilities {
  const roles = new Set(actor.roles);
  const isAdministrator = roles.has(ADMIN_ROLE);
  const isSupervisor = roles.has(SUPERVISOR_ROLE);
  const isTeamLeader = roles.has(TEAM_LEADER_ROLE);
  const isInspector = roles.has(INSPECTOR_ROLE);
  return {
    isAdministrator,
    isSupervisor,
    isTeamLeader,
    isInspector,
    canManageWorkOrders: isAdministrator || isSupervisor,
    canReport: isAdministrator || isSupervisor || isTeamLeader,
    canManageDefects:
      isAdministrator || isSupervisor || isInspector || isTeamLeader,
    canReadAllWorkOrders: isAdministrator || isSupervisor || isInspector,
  };
}

/**
 * Whether an actor may see a work order belonging to `teamId`. Administrators, supervisors and
 * inspectors see every team; a team leader only sees their own team.
 */
export function canAccessTeam(
  capabilities: ActorCapabilities,
  actorTeamId: number | null,
  teamId: number,
): boolean {
  if (capabilities.canReadAllWorkOrders) return true;
  return actorTeamId !== null && actorTeamId === teamId;
}

/** 本次工时 = 报工数量 × 标准工时 ÷ 60，保留一位小数。 */
export function calculateHours(
  quantity: number,
  standardMinutes: number,
): number {
  return Math.round(((quantity * standardMinutes) / 60) * 10) / 10;
}

/** 不良率 = 不良数量 ÷ (合格数量 + 不良数量) × 100，保留一位小数。 */
export function defectRate(
  defectQuantity: number,
  qualifiedQuantity: number,
): number {
  const total = defectQuantity + qualifiedQuantity;
  if (total <= 0) return 0;
  return Math.round((defectQuantity / total) * 1000) / 10;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ProductionError(
      'INVALID_QUANTITY',
      `${field} must be a non-negative integer`,
    );
  }
  return value;
}

export interface WorkReportQuantities {
  readonly quantity: unknown;
  readonly qualifiedQuantity: unknown;
  readonly defectQuantity: unknown;
}

export interface ValidatedReportQuantities {
  readonly quantity: number;
  readonly qualifiedQuantity: number;
  readonly defectQuantity: number;
}

/**
 * Validates a work report's quantities against the process' remaining planned quantity.
 *
 * 合格数量 + 不良数量 必须等于报工数量，否则拒绝；报工数量不能超过工序剩余计划数量。
 */
export function validateReportQuantities(
  input: WorkReportQuantities,
  remainingQuantity: number,
): ValidatedReportQuantities {
  const quantity = requireNonNegativeInteger(input.quantity, 'quantity');
  const qualifiedQuantity = requireNonNegativeInteger(
    input.qualifiedQuantity,
    'qualifiedQuantity',
  );
  const defectQuantity = requireNonNegativeInteger(
    input.defectQuantity,
    'defectQuantity',
  );
  if (quantity <= 0) {
    throw new ProductionError('INVALID_QUANTITY', 'quantity must be positive');
  }
  if (qualifiedQuantity + defectQuantity !== quantity) {
    throw new ProductionError(
      'REPORT_QUANTITY_MISMATCH',
      'Qualified and defective quantities must add up to the reported quantity',
    );
  }
  if (remainingQuantity <= 0) {
    throw new ProductionError(
      'PROCESS_COMPLETED',
      'The process has already reached its planned quantity',
      409,
    );
  }
  if (quantity > remainingQuantity) {
    throw new ProductionError(
      'REPORT_EXCEEDS_REMAINING',
      `Reported quantity exceeds the process' remaining quantity (${remainingQuantity})`,
      409,
    );
  }
  return { quantity, qualifiedQuantity, defectQuantity };
}

export interface DefectRegistrationInput {
  readonly quantity: unknown;
}

/**
 * Validates a defect registration against the report it belongs to and the process totals.
 *
 * 累计不良数量不能超过该工序的报工数量，单次登记也不能超过对应报工记录的不良数量。
 */
export function validateDefectQuantities(
  input: DefectRegistrationInput,
  remainingInReport: number,
  processReportedTotal: number,
  registeredDefectTotal: number,
): number {
  const quantity = requireNonNegativeInteger(input.quantity, 'quantity');
  if (quantity <= 0) {
    throw new ProductionError('INVALID_QUANTITY', 'quantity must be positive');
  }
  if (quantity > remainingInReport) {
    throw new ProductionError(
      'DEFECT_EXCEEDS_REPORT',
      `Defect quantity exceeds the report's remaining defect quantity (${remainingInReport})`,
      409,
    );
  }
  if (registeredDefectTotal + quantity > processReportedTotal) {
    throw new ProductionError(
      'DEFECT_EXCEEDS_PROCESS',
      'Cumulative defect quantity cannot exceed the process reported quantity',
      409,
    );
  }
  return quantity;
}
