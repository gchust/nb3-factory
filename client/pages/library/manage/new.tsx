import type { ReactElement } from 'react';

import { DocumentForm } from '../document-form.js';

export default function NewLibraryDocumentDialog(): ReactElement {
  return <DocumentForm closeTo='/library/manage' />;
}
