export const DOCUMENTS_RESOURCE = {
  type: 'composite',
  id: 'documents.library',
} as const;

export const VIEW_DOCUMENTS = {
  resource: DOCUMENTS_RESOURCE,
  action: 'view',
} as const;

export const CREATE_DOCUMENT = {
  resource: DOCUMENTS_RESOURCE,
  action: 'create',
} as const;

export const EDIT_DOCUMENT = {
  resource: DOCUMENTS_RESOURCE,
  action: 'edit',
} as const;

export const SHARE_DOCUMENT = {
  resource: DOCUMENTS_RESOURCE,
  action: 'share',
} as const;
