import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceDialog } from './device-dialog.js';

export default function EditDevicePage(): ReactElement {
  const { deviceId } = useParams();
  return <DeviceDialog deviceId={deviceId} />;
}
