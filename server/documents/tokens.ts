import { createServiceToken } from '@nocobase/service-provider';

import type { DocumentsService } from '../services/documents-service.js';

export const documentsServiceToken =
  createServiceToken<DocumentsService>('documents');
