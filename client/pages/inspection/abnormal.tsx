import type { ReactElement } from 'react';

import RecordsPage from './records.js';

export default function AbnormalRecordsPage(): ReactElement {
  return <RecordsPage fixedResult='abnormal' />;
}
