import type { ReactElement } from 'react';

import { ClaimEditor } from './claim-editor.js';

/** The route wrapper: the editor needs no props to create a claim. */
export default function NewExpenseClaimPage(): ReactElement {
  return <ClaimEditor />;
}
