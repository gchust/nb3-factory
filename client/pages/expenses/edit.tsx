import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { ClaimEditor } from './claim-editor.js';

/** The route wrapper: the editor takes the claim id from the route and loads the claim itself. */
export default function EditExpenseClaimPage(): ReactElement {
  const { claimId } = useParams();
  if (!claimId) {
    throw new Error('The expense edit route requires a claimId parameter.');
  }
  return <ClaimEditor key={claimId} claimId={claimId} />;
}
