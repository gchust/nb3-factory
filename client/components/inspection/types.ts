export interface Equipment {
  id: number;
  code: string;
  name: string;
  model: string | null;
  location: string | null;
  commissionedAt: string | null;
  status: string;
  photoFileId: string | null;
  remark: string | null;
}

export interface TemplateItem {
  id: number;
  seq: number;
  title: string;
  standard: string;
}

export interface InspectionTemplate {
  id: number;
  name: string;
  description: string | null;
  items: TemplateItem[];
}

export interface Attachment {
  id: number;
  fileId: string;
  filename: string;
  mimeType: string;
  ext: string;
  size: number;
  note: string | null;
  uploadedById: string;
  uploadedByName: string | null;
  createdAt: string | null;
  stage?: string;
  contentUrl: string;
}

export interface ResultEntry {
  id: number;
  templateItemId: number;
  title: string;
  standard: string;
  result: string | null;
  remark: string | null;
  attachments: Attachment[];
}

export interface InspectionTask {
  id: number;
  code: string;
  equipmentId: number;
  equipmentCode: string | null;
  equipmentName: string | null;
  templateId: number;
  templateName: string | null;
  assigneeId: string;
  assigneeName: string | null;
  plannedDate: string | null;
  status: string;
  submittedAt: string | null;
  abnormalCount: number;
  resultCount: number;
  answeredCount: number;
  overdue: boolean;
}

export interface InspectionTaskDetail extends InspectionTask {
  equipment: Equipment | null;
  results: ResultEntry[];
}

export interface RepairOrder {
  id: number;
  code: string;
  equipmentId: number;
  equipmentCode: string | null;
  equipmentName: string | null;
  sourceResultId: number;
  sourceTitle: string | null;
  sourceRemark: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: string;
  status: string;
  description: string | null;
  reviewRemark: string | null;
  createdAt: string | null;
  closedAt: string | null;
  recordCount: number;
  beforeCount: number;
  afterCount: number;
}

export interface RepairRecord {
  id: number;
  authorId: string;
  authorName: string | null;
  content: string;
  createdAt: string | null;
}

export interface RepairOrderDetail extends RepairOrder {
  records: RepairRecord[];
  beforeFiles: Attachment[];
  afterFiles: Attachment[];
  taskId: number | null;
}

export interface DashboardCounts {
  pending: number;
  overdue: number;
  abnormal: number;
  pendingReview: number;
}

export interface SessionContext {
  userId: string;
  roles: string[];
}

export interface PersonOption {
  id: string;
  name: string;
}
