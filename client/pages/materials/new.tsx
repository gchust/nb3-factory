import type { ReactElement } from 'react';

import { MaterialDialog } from './material-dialog.js';

/** `/materials/new` — the create dialog, opened from the page header. */
export default function NewMaterialPage(): ReactElement {
  return <MaterialDialog />;
}
