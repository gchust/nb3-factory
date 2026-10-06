import type { AIToolRendererMap } from '@/extensions/nocobase-ai';

import { DocumentSourcesRenderer } from './document-sources.js';

/** The one backend tool the document assistant owns; the renderer is keyed by this exact name. */
export const DOCUMENTS_TOOL = 'search-documents';

/**
 * The renderers the assistant page mounts, in the shape `NocoBaseAIRootProvider` takes.
 *
 * Standalone, so the sources stay visible without expanding the tool card: an answer's citations are
 * its useful part, not a detail behind a disclosure. It lives beside the page rather than on it
 * because the page's module must keep a single component export for Fast Refresh.
 */
export const documentToolRenderers: AIToolRendererMap = {
  [DOCUMENTS_TOOL]: {
    component: DocumentSourcesRenderer,
    standalone: true,
  },
};
