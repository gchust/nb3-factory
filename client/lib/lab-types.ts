/**
 * The shapes the laboratory API returns.
 *
 * These mirror the server's view types (`server/providers/lab-service.ts`). The client and the
 * server are compiled separately and share no module, so the contract is stated twice on purpose:
 * the server owns the data, the browser owns what it renders, and a change to either shows up as a
 * type error on its own side.
 */

export type LabRole =
  'lab_admin' | 'teacher' | 'technician' | 'safety_officer' | 'student';

export type FileTargetType =
  | 'laboratory'
  | 'equipment'
  | 'calibration'
  | 'work_order'
  | 'safety_check'
  | 'training_record';

export interface LabAccess {
  readonly userId: string;
  readonly isRoot: boolean;
  readonly memberships: readonly { labId: number; role: LabRole }[];
}

export interface LabMemberView {
  userId: string;
  role: LabRole;
  name: string | null;
  email: string | null;
}

export interface LaboratoryView {
  id: number;
  code: string;
  name: string;
  building: string | null;
  room: string | null;
  description: string | null;
  status: string;
  role: LabRole | null;
  equipmentCount: number;
  createdAt: string | null;
}

export interface EquipmentView {
  id: number;
  assetNo: string;
  name: string;
  model: string | null;
  serialNo: string | null;
  category: string | null;
  labId: number;
  labName: string | null;
  status: string;
  purchaseDate: string | null;
  ownerName: string | null;
  description: string | null;
  studentVisible: boolean;
  studentDescription: string | null;
  calibrationExpiresAt: string | null;
  calibrationExpired: boolean;
  calibrationExpiringSoon: boolean;
  openBlockingIssues: number;
  restricted: boolean;
}

export interface CalibrationView {
  id: number;
  equipmentId: number;
  calibratedAt: string | null;
  expiresAt: string | null;
  provider: string | null;
  certificateNo: string | null;
  result: string;
  notes: string | null;
  expired: boolean;
  createdAt: string | null;
}

export interface ReservationView {
  id: number;
  equipmentId: number;
  equipmentName: string | null;
  assetNo: string | null;
  userId: string;
  startsAt: string | null;
  endsAt: string | null;
  purpose: string | null;
  status: string;
  createdAt: string | null;
}

export interface WorkOrderEventView {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  actorId: string | null;
  createdAt: string | null;
}

export interface WorkOrderView {
  id: number;
  code: string;
  equipmentId: number;
  equipmentName: string | null;
  assetNo: string | null;
  labId: number;
  labName: string | null;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  createdById: string | null;
  resolvedAt: string | null;
  reviewComment: string | null;
  reviewedById: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  events?: WorkOrderEventView[];
}

export interface SafetyCheckView {
  id: number;
  labId: number;
  labName: string | null;
  title: string;
  checkType: string | null;
  result: string;
  severity: string | null;
  status: string;
  findings: string | null;
  checkedAt: string | null;
  checkedById: string | null;
  closedAt: string | null;
  closedById: string | null;
  createdAt: string | null;
}

export interface TrainingRecordView {
  id: number;
  labId: number;
  labName: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  title: string;
  trainer: string | null;
  trainedAt: string | null;
  participantCount: number;
  notes: string | null;
  createdById: string | null;
  createdAt: string | null;
}

export interface LabFileView {
  id: string;
  filename: string;
  ext: string | null;
  mimeType: string;
  size: number;
  purpose: string | null;
  targetType: FileTargetType;
  targetId: string;
  remark: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string | null;
  contentUrl: string;
}

export interface DashboardData {
  laboratories: readonly { id: number; code: string; name: string }[];
  equipment: {
    total: number;
    byStatus: Record<string, number>;
    calibrationExpired: number;
    calibrationExpiringSoon: number;
  };
  workOrders: {
    total: number;
    open: number;
    byStatus: Record<string, number>;
  };
  safety: { total: number; open: number; blocking: number };
  training: { total: number; participants: number };
  reservations: { upcoming: number; total: number };
  recentWorkOrders: readonly {
    id: number;
    code: string;
    title: string;
    status: string;
    priority: string;
  }[];
  restricted: boolean;
}

/**
 * Option lists built from the values the server accepts.
 *
 * Each entry carries the message key the interface translates it with, so the values stay in one
 * place instead of being spelled out at every select.
 */
/** One choice of a select: the value the server stores and the key its label is read from. */
export interface LabOption {
  readonly value: string;
  readonly labelKey: string;
}

function options(values: readonly string[], prefix: string): LabOption[] {
  return values.map((value) => ({
    value,
    labelKey: `${prefix}.${value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`,
  }));
}

export const LAB_STATUS_OPTIONS = options(
  ['active', 'inactive'],
  'lab.labStatus',
);
export const LAB_ROLE_OPTIONS = options(
  ['lab_admin', 'teacher', 'technician', 'safety_officer', 'student'],
  'lab.role',
);
export const EQUIPMENT_STATUS_OPTIONS = options(
  ['available', 'in_use', 'maintenance', 'retired'],
  'lab.equipmentStatus',
);
export const CALIBRATION_RESULT_OPTIONS = options(
  ['passed', 'failed'],
  'lab.calibrationResult',
);
export const WORK_ORDER_TYPE_OPTIONS = options(
  ['repair', 'maintenance', 'calibration', 'scrap'],
  'lab.workOrderType',
);
export const WORK_ORDER_PRIORITY_OPTIONS = options(
  ['low', 'normal', 'high', 'critical'],
  'lab.priority',
);
export const WORK_ORDER_STATUS_OPTIONS = options(
  [
    'open',
    'assigned',
    'in_progress',
    'pending_review',
    'completed',
    'cancelled',
  ],
  'lab.workOrderStatus',
);
export const RESERVATION_STATUS_OPTIONS = options(
  ['reserved', 'in_use', 'completed', 'cancelled'],
  'lab.reservationStatus',
);
export const SAFETY_RESULT_OPTIONS = options(
  ['pending', 'pass', 'issue'],
  'lab.safetyResult',
);
export const SAFETY_SEVERITY_OPTIONS = options(
  ['low', 'medium', 'high', 'critical'],
  'lab.severity',
);
export const SAFETY_STATUS_OPTIONS = options(
  ['open', 'closed'],
  'lab.safetyStatus',
);
export const FILE_PURPOSE_OPTIONS = options(
  [
    'nameplate',
    'manual',
    'certificate',
    'before_repair',
    'after_repair',
    'fault_report',
    'roster',
    'risk_notice',
    'archive',
    'attachment',
  ],
  'lab.filePurpose',
);
