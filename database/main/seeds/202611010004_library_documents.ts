import { defineSeed } from '@nocobase/db';

import { ensureLibraryDocuments } from '../../seed-data/library-documents.ts';

/** A small set of sample documents that shows each visibility rule on a fresh demo installation. */
export default defineSeed({
  name: '202611010004_library_documents',
  sample: true,
  transaction: true,
  async run(context) {
    await ensureLibraryDocuments(context.repository('libraryDocuments'));
  },
});
