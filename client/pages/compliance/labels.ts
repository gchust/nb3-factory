/** Stable translation-key and tone mappings shared by the compliance pages. */

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline';

const SUPPLIER_STATUS_TONES: Record<string, BadgeTone> = {
  draft: 'outline',
  pending_review: 'secondary',
  qualified: 'default',
  rejected: 'destructive',
  suspended: 'outline',
};

const QUALIFICATION_STATUS_TONES: Record<string, BadgeTone> = {
  active: 'default',
  expired: 'destructive',
  revoked: 'outline',
};

const CONTRACT_STATUS_TONES: Record<string, BadgeTone> = {
  active: 'default',
  expired: 'destructive',
  terminated: 'outline',
};

const DECISION_TONES: Record<string, BadgeTone> = {
  approved: 'default',
  rejected: 'destructive',
};

const SEVERITY_TONES: Record<string, BadgeTone> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

function toneFor(map: Record<string, BadgeTone>, value: string): BadgeTone {
  return map[value] ?? 'outline';
}

export function supplierStatusTone(value: string): BadgeTone {
  return toneFor(SUPPLIER_STATUS_TONES, value);
}

export function qualificationStatusTone(value: string): BadgeTone {
  return toneFor(QUALIFICATION_STATUS_TONES, value);
}

export function contractStatusTone(value: string): BadgeTone {
  return toneFor(CONTRACT_STATUS_TONES, value);
}

export function decisionTone(value: string): BadgeTone {
  return toneFor(DECISION_TONES, value);
}

export function severityTone(value: string): BadgeTone {
  return toneFor(SEVERITY_TONES, value);
}

export function qualificationTypeKey(value: string): string {
  return `compliance.qualificationType.${value}`;
}

export function supplierStatusKey(value: string): string {
  return `compliance.supplierStatus.${value}`;
}

export function qualificationStatusKey(value: string): string {
  return `compliance.qualificationStatus.${value}`;
}

export function contractStatusKey(value: string): string {
  return `compliance.contractStatus.${value}`;
}

export function roleKey(value: string): string {
  return `compliance.role.${value}`;
}

export function fileCategoryKey(value: string): string {
  return `compliance.fileCategory.${value}`;
}

export function decisionKey(value: string): string {
  return `compliance.decision.${value}`;
}

export function riskKindKey(value: string): string {
  return `compliance.riskKind.${value}`;
}

export function isPreviewableImage(mimeType: string, ext: string): boolean {
  return (
    /^image\/(png|jpeg|jpg|gif|webp|bmp)$/u.test(mimeType) ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext.toLowerCase())
  );
}

export function isPdf(mimeType: string, ext: string): boolean {
  return mimeType === 'application/pdf' || ext.toLowerCase() === 'pdf';
}

export function isTextLike(mimeType: string, ext: string): boolean {
  const normalized = ext.toLowerCase();
  return (
    mimeType.startsWith('text/') ||
    ['txt', 'csv', 'log', 'md', 'json', 'xml', 'html', 'htm'].includes(
      normalized,
    )
  );
}

export function isOfficeDocument(mimeType: string, ext: string): boolean {
  const normalized = ext.toLowerCase();
  return (
    ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(normalized) ||
    mimeType.includes('officedocument') ||
    mimeType === 'application/msword'
  );
}
