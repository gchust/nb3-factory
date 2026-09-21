import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { CalibrationPanel } from '@/components/calibration-list';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useLabApi } from '@/lib/lab-api';
import { equipmentChoices } from '@/lib/lab-fields';
import { hasStaffRole } from '@/lib/lab-permissions';
import { useAsync } from '@/lib/use-async';

/**
 * Every calibration the viewer may read.
 *
 * The certificates themselves hang off the records, so the page's own table opens them; the
 * instrument list is loaded only to name the instrument in each row and to fill the form's select.
 */
export default function CalibrationsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const access = useAsync('access', () => api.access());
  const equipment = useAsync('equipment-for-calibrations', () =>
    api.equipment(),
  );
  const equipmentOptions = equipmentChoices(equipment.data ?? []);

  return (
    <PageContainer>
      <PageHeader
        description={t('calibrations.description')}
        title={t('calibrations.title')}
      />
      <CalibrationPanel
        canWrite={hasStaffRole(access.data, ['lab_admin', 'technician'])}
        equipmentLabel={(id) => {
          const item = (equipment.data ?? []).find((row) => row.id === id);
          return item ? `${item.assetNo} · ${item.name}` : `#${id}`;
        }}
        equipmentOptions={equipmentOptions}
        titleKey='calibrations.title'
      />
    </PageContainer>
  );
}
