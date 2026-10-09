import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { MaterialDialog } from './material-dialog.js';

/**
 * The edit dialog, loaded by both `edit/:materialId` under the list and `edit`
 * under the detail drawer. It reads the id from the route params either way.
 */
export default function EditMaterialPage(): ReactElement {
  const { materialId } = useParams<{ materialId: string }>();
  return <MaterialDialog materialId={materialId} />;
}
