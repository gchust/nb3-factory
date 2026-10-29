import type { DocumentRecord } from './api.js';

export interface DocumentsOutletContext {
  readonly reload: () => void;
}

export interface DocumentEditOutletContext {
  readonly document: DocumentRecord;
  readonly reload: () => void;
}
